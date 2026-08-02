/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/unbound-method */
import { Octokit } from '@octokit/core'

import {
  clearCache,
  clearRepos,
  descriptionKey,
  idbDelete,
  idbGet,
  idbGetAll,
  idbGetAllKeys,
  idbPut,
} from './db'
import {
  descriptionQuery,
  type GithubReleaseResponse,
  graphqlAllowingPartials,
  type GithubRepoManifestNode,
  type GithubReposByIdsResponse,
  type GithubRepository,
  type GithubStarredReposResponse,
  reposByIdsQuery,
  reposFullQuery,
  reposManifestQuery,
} from './github'
import { chunk, delay, mergeSorted } from './helpers'
import { Release } from './models/release.svelte'
import { ReleaseGroup } from './models/release_group.svelte'
import { settings } from './state.svelte'

const now = new Date()
const startingDate = new Date(now)
startingDate.setMonth(now.getMonth() - 1)

// Sentinel repo for the empty trailing "caught up" group. Not a valid
// "owner/name", so its key can't collide with a real repo group.
const CAUGHT_UP_GROUP_REPO = '__caught_up__'

const REFRESH_BATCH_SIZE = 20
const DESCRIPTION_BATCH_SIZE = 20
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

// True if release.publishedAt falls within the visible one-month feed window.
function isReleaseInWindow(release: { publishedAt: string }): boolean {
  return new Date(release.publishedAt) >= startingDate
}

// Only reposFullQuery nodes carry `releases` — those need no refresh.
function isFullRepo(
  node: GithubRepoManifestNode | GithubRepository,
): node is GithubRepository {
  return 'releases' in node
}

class Loader {
  public loading: boolean = $state(false)
  public toast: string = $state('')

  private totalRepos = $state(0)
  private reposProcessed = $state(0)
  public progress: number = $derived.by(() => {
    if (this.totalRepos === 0) return 0
    // Clamp: concurrent star changes can push reposProcessed past totalRepos.
    return Math.min(this.reposProcessed / this.totalRepos, 1)
  })

  private readonly octokit: Octokit | undefined = $derived.by(() => {
    if (settings.githubToken === null) return undefined
    return new Octokit({ auth: settings.githubToken })
  })

  private releases = $state<Release[]>([])
  private releasesIndex = new Map<string, Release>()
  // repo id → its release ids, so dropReleasesForRepos is O(batch) not O(feed).
  private releasesByRepo = new Map<string, Set<string>>()

  public groups: ReleaseGroup[] = $derived.by(() => {
    const groups: ReleaseGroup[] = []
    let currentGroup: ReleaseGroup | null = null
    let caughtUpDividerPlaced = false

    for (const release of this.releases) {
      // Skip hidden releases before grouping so they don't split a repo's run.
      if (!release.isDisplayable) continue

      const repo = release.data.repo.fullName

      // The divider goes above the first displayable previously-seen release.
      const wasPreviouslySeen =
        release.data.publishedAt <= settings.lastAccessedAt
      const isCaughtUpBoundary = !caughtUpDividerPlaced && wasPreviouslySeen

      if (currentGroup && (currentGroup.repo !== repo || isCaughtUpBoundary)) {
        groups.push(currentGroup)
        currentGroup = null
      }

      currentGroup ??= new ReleaseGroup(repo)

      if (isCaughtUpBoundary) {
        currentGroup.showCaughtUp = true
        caughtUpDividerPlaced = true
      }

      currentGroup.releases.push(release)
    }

    if (currentGroup) {
      groups.push(currentGroup)
    }

    // No inline divider but releases exist (first visit / all seen hidden): show it at the end.
    if (!caughtUpDividerPlaced && this.releases.length > 0) {
      const caughtUpGroup = new ReleaseGroup(CAUGHT_UP_GROUP_REPO)
      caughtUpGroup.showCaughtUp = true
      groups.push(caughtUpGroup)
    }

    return groups
  })

  private totalRequestTime = 0
  private totalProcessingTime = 0

  private starredRepoIds = new Set<string>()
  private cachedReposIndex = new Map<string, GithubRepository>()
  private reposRefreshChain: Promise<boolean> = Promise.resolve(false)
  // Bumped on every start/reset. A token check alone can't tell a stale
  // chain apart from a fresh one once a new token has been pasted in.
  private session = 0

  // Kick off a load: marks loading active and starts the async pipeline.
  // No-op if no GitHub token is configured.
  public start(): void {
    if (!this.octokit) return

    this.session += 1
    this.resetFeedState()
    this.loading = true

    void this.run(this.session)
  }

  // Wipe the token, IDB stores, and all in-memory state. Called on
  // explicit logout and on auth errors that invalidate the session.
  public reset(): void {
    localStorage.removeItem('githubToken')
    settings.githubToken = null

    localStorage.removeItem('lastAccessedAt')
    settings.lastAccessedAt = new Date(0)

    localStorage.removeItem('lastEvictedAt')

    // Bump first so isStale() rejects every in-flight continuation.
    this.session += 1
    void this.wipeCache(this.session, this.reposRefreshChain)

    this.loading = false
    this.toast = ''

    this.resetFeedState()
  }

  // Manual cache wipe from Settings. Cancels the running load first, else
  // its in-flight writes repopulate the stores as fast as they're cleared.
  public async clearCachedData(): Promise<void> {
    const pendingRefresh = this.reposRefreshChain

    this.session += 1
    const { session } = this

    this.resetFeedState()

    // Hold the spinner: draining in-flight writes and the reload that
    // follows take seconds, and the feed is blank throughout.
    this.loading = this.octokit !== undefined

    await this.wipeCache(session, pendingRefresh)

    // A second click, or a logout, superseded this wipe.
    if (session !== this.session) return

    this.start()
  }

  // Drop all per-load state. Shared by start/reset/clearCachedData so a
  // second load can't double-merge into the feed the first one built.
  private resetFeedState(): void {
    this.totalRepos = 0
    this.reposProcessed = 0
    this.totalRequestTime = 0
    this.totalProcessingTime = 0
    this.releases = []
    this.releasesIndex = new Map()
    this.releasesByRepo = new Map()
    this.starredRepoIds = new Set()
    this.cachedReposIndex = new Map()
    // A chain left resolved `true` by an earlier abort would short-circuit
    // every batch of the next load and leave finishLoad hanging.
    this.reposRefreshChain = Promise.resolve(false)
  }

  // Wipe IDB now, then again once the in-flight refresh batch has finished
  // writing — its already-queued puts would outlive the first wipe.
  private async wipeCache(
    session: number,
    pendingRefresh: Promise<boolean>,
  ): Promise<void> {
    await clearCache()
    await pendingRefresh
    // Skip the second pass if a new session has since repopulated IDB.
    if (session !== this.session) return
    await clearCache()
  }

  // True once this session has been superseded or the token is gone.
  // Every continuation after an await must bail on it.
  private isStale(session: number): boolean {
    return session !== this.session || !this.octokit
  }

  // Top-level load pipeline: populate the in-memory cached-repo lookup
  // from IDB, then start paginating the GitHub manifest.
  private async run(session: number): Promise<void> {
    if (!settings.disableCache) {
      const cachedRepos = await idbGetAll('repos')
      if (this.isStale(session)) return
      for (const repo of cachedRepos) {
        this.cachedReposIndex.set(repo.id, repo)
      }
    }

    await this.fetchStarredReposPage(session)
  }

  // Fetch one page of starred repos. Hydrate cached ones, enqueue
  // refreshes for new/changed, then recurse to the next page.
  private async fetchStarredReposPage(
    session: number,
    cursor: string | null = null,
    retries = 0,
  ): Promise<void> {
    if (this.isStale(session)) {
      console.error('ERROR: Session no longer active. Aborting...')
      return
    }

    // Only the request is guarded: a throw while processing the response
    // must not re-issue this page and fork the pagination chain.
    const response = await this.requestStarredReposPage(
      session,
      cursor,
      retries,
    )
    if (!response) return

    await this.processStarredReposPage(session, response)
  }

  // Request one page. Returns undefined when the request failed; a retry
  // (or an abort) has already been scheduled in that case.
  private async requestStarredReposPage(
    session: number,
    cursor: string | null,
    retries: number,
  ): Promise<GithubStarredReposResponse | undefined> {
    const { octokit } = this
    if (!octokit) return undefined

    // Cache disabled: skip the manifest and pull whole repos up front.
    const query = settings.disableCache ? reposFullQuery : reposManifestQuery

    try {
      const startRequestTime = performance.now()
      const response = await octokit.graphql<
        GithubStarredReposResponse | undefined
      >(query, { cursor })

      // Don't bill a superseded session's request to the current load.
      if (this.isStale(session)) return undefined

      this.totalRequestTime += performance.now() - startRequestTime

      if (!response) {
        throw new Error('Invalid GraphQL Response')
      }

      return response
    } catch (error: unknown) {
      console.error(error)
      if (this.handleAuthError(session, error)) return undefined

      // A superseded session must not touch the live one's toast or spinner.
      if (this.isStale(session)) return undefined

      const nextRetries = this.nextRetry(retries)
      if (nextRetries === null) return undefined

      await this.retryDelay(nextRetries)
      void this.fetchStarredReposPage(session, cursor, nextRetries)
      return undefined
    }
  }

  // Merge the ready repos from one page into the feed, enqueue refreshes
  // for the rest, and either advance pagination or wrap the load up.
  private async processStarredReposPage(
    session: number,
    response: GithubStarredReposResponse,
  ): Promise<void> {
    if (this.isStale(session)) {
      console.error('ERROR: Session no longer active. Aborting...')
      return
    }

    const {
      pageInfo,
      totalCount,
      nodes: starredRepos,
    } = response.viewer.starredRepositories

    this.totalRepos ||= totalCount

    this.toast = ''

    const shouldContinue =
      pageInfo.hasNextPage && response.rateLimit.remaining > 0
    if (shouldContinue) {
      void this.fetchStarredReposPage(session, pageInfo.endCursor)
    }

    // Repos mergeable without a refetch: full nodes, or unchanged cached ones.
    const readyRepos: GithubRepository[] = []
    const repoIdsToRefresh: string[] = []
    for (const starredRepo of starredRepos) {
      // Skip duplicate nodes (concurrent star changes) repeated across pages.
      if (!this.starredRepoIds.has(starredRepo.id)) {
        this.starredRepoIds.add(starredRepo.id)
        // Cache disabled: the page already carries the whole repo.
        if (isFullRepo(starredRepo)) {
          readyRepos.push(starredRepo)
          continue
        }

        const cached = this.cachedReposIndex.get(starredRepo.id)
        if (this.repoNeedsRefresh(starredRepo, cached)) {
          repoIdsToRefresh.push(starredRepo.id)
        } else if (cached) {
          readyRepos.push(cached)
        }
      }
    }

    if (readyRepos.length > 0) {
      this.mergeReposIntoFeed(session, readyRepos)
    }

    for (const batch of chunk(repoIdsToRefresh, REFRESH_BATCH_SIZE)) {
      this.enqueueRepoRefresh(session, batch)
    }

    // Ready repos count as done; pending refreshes advance the rest.
    this.reposProcessed += readyRepos.length

    if (pageInfo.hasNextPage && response.rateLimit.remaining <= 0) {
      // Incomplete: drain batches, but skip unstarred-pruning + caught-up marker.
      this.toast = 'ERROR: Reached Github Rate Limit'
      await this.reposRefreshChain
      if (this.isStale(session)) return
      this.loading = false
    } else if (!shouldContinue) {
      await this.finishLoad(session)
    }
  }

  // Decide whether a manifest entry warrants a full refetch by comparing
  // `updatedAt` (which bumps on any repo metadata write).
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private repoNeedsRefresh(
    starredRepo: GithubRepoManifestNode,
    cached: GithubRepository | undefined,
  ): boolean {
    if (!cached) return true
    return cached.updatedAt !== starredRepo.updatedAt
  }

  // Extract in-window releases from `repos`, merge them into the sorted
  // feed, index by id, and kick off description fetches.
  private mergeReposIntoFeed(session: number, repos: GithubRepository[]): void {
    const startProcessingTime = performance.now()
    const newReleases: Release[] = []

    for (const repo of repos) {
      const releases = this.extractReleases(repo)
      if (releases.length > 0) {
        newReleases.push(...releases)
      }
    }

    if (newReleases.length > 0) {
      this.releases = mergeSorted(
        this.releases,
        newReleases,
        this.releaseSortFn,
      )

      for (const release of newReleases) {
        this.releasesIndex.set(release.data.id, release)
        const repoId = release.data.repo.id
        let repoReleaseIds = this.releasesByRepo.get(repoId)
        if (!repoReleaseIds) {
          repoReleaseIds = new Set()
          this.releasesByRepo.set(repoId, repoReleaseIds)
        }
        repoReleaseIds.add(release.data.id)
      }

      void this.loadDescriptions(session, newReleases)
    }

    this.totalProcessingTime += performance.now() - startProcessingTime
  }

  // Descriptions stream in after the feed has already rendered, so this is
  // fire-and-forget — nothing must escape as an unhandled rejection.
  private async loadDescriptions(
    session: number,
    releases: Release[],
  ): Promise<void> {
    try {
      await this.fetchReleaseDescriptions(session, releases)
    } catch (error) {
      console.error('Failed to fetch release descriptions', error)
    }
  }

  // Convert a GitHub repo node into Release instances, dropping any
  // whose publishedAt is older than the visible (one-month) window.
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private extractReleases(repo: GithubRepository): Release[] {
    const { releases: releaseData, ...repoData } = repo
    const releaseNodes = releaseData.nodes

    const fullName = `${repoData.owner.login}/${repoData.name}`
    const releaseRepo = { ...repoData, fullName }

    return releaseNodes.reduce<Release[]>((result, releaseNode) => {
      const publishedAt = new Date(releaseNode.publishedAt)
      if (publishedAt >= startingDate) {
        const release = new Release({
          repo: releaseRepo,
          ...releaseNode,
          publishedAt,
        })
        result.push(release)
      }
      return result
    }, [])
  }

  // Sort releases newest-first by publishedAt. Used by mergeSorted to
  // maintain the feed order.
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private releaseSortFn(a: Release, b: Release): number {
    return b.data.publishedAt.getTime() - a.data.publishedAt.getTime()
  }

  // Fill in HTML descriptions for the given releases: attach cached
  // entries from IDB, then batch-fetch the rest from GitHub.
  private async fetchReleaseDescriptions(
    session: number,
    releases: Release[],
  ): Promise<void> {
    if (this.isStale(session) || releases.length === 0) return

    const uncachedReleaseIds: string[] = []

    // A miss and a failed read are the same thing here: refetch it.
    await Promise.all(
      releases.map(async (release): Promise<void> => {
        const description = await idbGet(
          'descriptions',
          descriptionKey(release.data.id, release.data.updatedAt),
        )

        if (description === undefined) {
          uncachedReleaseIds.push(release.data.id)
        } else {
          this.attachReleaseDescription(release.data.id, description)
        }
      }),
    )

    if (uncachedReleaseIds.length === 0) return

    const batches = chunk(uncachedReleaseIds, DESCRIPTION_BATCH_SIZE)

    await Promise.all(
      batches.map(async (releaseIds): Promise<void> => {
        await this.fetchDescriptionBatch(session, releaseIds, 0)
      }),
    )
  }

  // Fetch one batch of rendered release notes. Retries transient failures
  // rather than leaving the cards permanently blank.
  private async fetchDescriptionBatch(
    session: number,
    releaseIds: string[],
    retries: number,
  ): Promise<void> {
    const { octokit } = this
    if (!octokit || this.isStale(session)) return

    try {
      const response = await graphqlAllowingPartials<GithubReleaseResponse>(
        octokit,
        descriptionQuery,
        { releaseIds },
      )

      if (this.isStale(session)) return

      if (response) {
        for (const releaseNode of response.nodes) {
          if (!releaseNode) continue

          // Key on the release's own updatedAt, not the one this query
          // returns — reads and eviction both key on the cached value.
          const release = this.releasesIndex.get(releaseNode.id)
          if (release) {
            void idbPut(
              'descriptions',
              releaseNode.descriptionHTML,
              descriptionKey(release.data.id, release.data.updatedAt),
            )
          }

          this.attachReleaseDescription(
            releaseNode.id,
            releaseNode.descriptionHTML,
          )
        }
        return
      }
      // Missing response — fall through to retry.
    } catch (error: unknown) {
      console.error(error)
      if (this.handleAuthError(session, error)) return
      // Fall through to retry on non-auth errors.
    }

    // A superseded session must not touch the live one's toast.
    if (this.isStale(session)) return

    // Notes are supplementary: report the failure without tearing down the
    // progress bar, which is what nextRetry() would do here.
    if (retries >= MAX_RETRIES) {
      this.toast = 'ERROR: Failed to load some release notes'
      return
    }

    const nextRetries = retries + 1
    this.toast = `ERROR: Release Notes Failed - Retry #${nextRetries}`
    await this.retryDelay(nextRetries)
    await this.fetchDescriptionBatch(session, releaseIds, nextRetries)
  }

  // Look up a release by id and set its descriptionHTML so the UI
  // re-renders that card with the rendered notes.
  private attachReleaseDescription(
    releaseId: string,
    description: string,
  ): void {
    const release = this.releasesIndex.get(releaseId)

    if (release) {
      release.data.descriptionHTML = description
    }
  }

  // Queue a repo-refresh batch onto the serialized chain so it runs
  // after earlier batches finish (GitHub's secondary rate limit).
  private enqueueRepoRefresh(session: number, repoIds: string[]): void {
    this.reposRefreshChain = this.runRefreshBatch(
      this.reposRefreshChain,
      session,
      repoIds,
    )
  }

  // Run one batch after `previous` settles. Belt-and-braces: an unexpected
  // throw becomes a clean abort rather than poisoning the chain.
  private async runRefreshBatch(
    previous: Promise<boolean>,
    session: number,
    repoIds: string[],
  ): Promise<boolean> {
    try {
      const aborted = await previous
      if (aborted || this.isStale(session)) return true

      return await this.refreshRepos(session, repoIds, 0)
    } catch (error) {
      console.error(error)
      // finishLoad bails on abort, so stop the spinner here.
      if (!this.isStale(session)) {
        this.toast = 'ERROR: Repeated Request Failures - Aborting'
        this.loading = false
      }
      return true
    }
  }

  // Refresh up to REFRESH_BATCH_SIZE repos via nodes(ids:...). Retries
  // up to 3× on transient errors; returns true to signal abort.
  private async refreshRepos(
    session: number,
    repoIds: string[],
    retries: number,
  ): Promise<boolean> {
    const { octokit } = this
    if (!octokit || this.isStale(session)) return true

    try {
      const startRequestTime = performance.now()
      const response = await graphqlAllowingPartials<GithubReposByIdsResponse>(
        octokit,
        reposByIdsQuery,
        { repoIds },
      )

      if (this.isStale(session)) return true

      this.totalRequestTime += performance.now() - startRequestTime

      if (response) {
        this.toast = ''

        // nodes(ids:...) returns null for unresolvable ids; trim resolved repos to the window.
        const resolvedById = new Map<string, GithubRepository>()
        for (const repo of response.nodes) {
          if (repo !== null) {
            repo.releases.nodes = repo.releases.nodes.filter(isReleaseInWindow)
            resolvedById.set(repo.id, repo)
          }
        }

        // Treat unresolvable ids as unstarred (delete from cache).
        await Promise.all(
          repoIds.map(async (id): Promise<void> => {
            const repo = resolvedById.get(id)
            await (repo ? idbPut('repos', repo, id) : idbDelete('repos', id))
          }),
        )

        // The IDB writes above are the last await; don't touch feed state
        // on behalf of a session that ended while they were in flight.
        if (this.isStale(session)) return true

        this.dropReleasesForRepos(new Set(repoIds))

        this.mergeReposIntoFeed(session, [...resolvedById.values()])

        // Advance by full batch size so progress reaches 100% even when ids resolve to null.
        this.reposProcessed += repoIds.length

        // Out of points: stop the chain here rather than burning every
        // remaining batch (and its retries) on certain failures.
        if (response.rateLimit.remaining <= 0) {
          this.toast = 'ERROR: Reached Github Rate Limit'
          this.loading = false
          return true
        }

        return false
      }
      // Missing response — fall through to retry.
    } catch (error: unknown) {
      console.error(error)
      if (this.handleAuthError(session, error)) return true
      // Fall through to retry on non-auth errors.
    }

    // A superseded session must not touch the live one's toast or spinner.
    if (this.isStale(session)) return true

    const nextRetries = this.nextRetry(retries)
    if (nextRetries === null) return true

    await this.retryDelay(nextRetries)
    return this.refreshRepos(session, repoIds, nextRetries)
  }

  // Drop in-memory Release entries (and index entries) belonging to
  // any of the given repos. Used before re-merging fresh repo data.
  private dropReleasesForRepos(repoIds: Set<string>): void {
    if (this.releases.length === 0 || repoIds.size === 0) return

    const toRemove = new Set<string>()
    for (const repoId of repoIds) {
      const repoReleaseIds = this.releasesByRepo.get(repoId)
      if (repoReleaseIds) {
        for (const releaseId of repoReleaseIds) toRemove.add(releaseId)
        this.releasesByRepo.delete(repoId)
      }
    }
    if (toRemove.size === 0) return

    this.releases = this.releases.filter(
      (r): boolean => !toRemove.has(r.data.id),
    )
    for (const releaseId of toRemove) {
      this.releasesIndex.delete(releaseId)
    }
  }

  // Detect a 401 and reset the session if so. Returns true when the
  // error was handled, false for other error types.
  private handleAuthError(session: number, error: unknown): boolean {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 401
    ) {
      // A stale 401 must not tear down the session that replaced it.
      if (!this.isStale(session)) {
        this.reset()
        this.toast = 'ERROR: API Token Invalid/Expired'
      }
      return true
    }
    return false
  }

  // Shared retry policy: returns the next retry count if more attempts
  // remain (and sets the retry toast), else null + surfaces the abort.
  private nextRetry(retries: number): number | null {
    if (retries < MAX_RETRIES) {
      const nextRetries = retries + 1
      this.toast = `ERROR: Request Failed - Retry #${nextRetries}`
      console.log(this.toast)
      return nextRetries
    }

    this.toast = 'ERROR: Repeated Request Failures - Aborting'
    this.loading = false
    return null
  }

  // Exponential backoff between attempts — retrying instantly is what
  // trips GitHub's secondary rate limit in the first place.
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private async retryDelay(retries: number): Promise<void> {
    await delay(RETRY_BASE_DELAY_MS * 2 ** (retries - 1))
  }

  // After the final manifest page: evict repos that disappeared from
  // the manifest, drain refresh batches, then wrap up the load.
  private async finishLoad(session: number): Promise<void> {
    await this.deleteUnstarredRepos()

    // Bail before clearing: a superseded session must not pull these out
    // from under the pipeline that replaced it.
    if (this.isStale(session)) return

    // Drop both collections so the GC can reclaim them while refreshes drain.
    this.cachedReposIndex = new Map()
    this.starredRepoIds = new Set()

    // Drain the refresh chain; true means an enqueued batch aborted.
    const aborted = await this.reposRefreshChain
    if (aborted || this.isStale(session)) return

    this.loading = false

    // Persist only; in-memory stays at session-start so the marker doesn't jump mid-session.
    localStorage.setItem('lastAccessedAt', new Date().toISOString())

    console.log(`Total Request Time: ${this.totalRequestTime.toFixed(2)} ms`)
    console.log(
      `Total Processing Time: ${this.totalProcessingTime.toFixed(2)} ms`,
    )

    await this.evictStaleData(session)
  }

  // Delete cached repos that no longer appear in the user's current
  // starred set (e.g. unstarred between sessions).
  private async deleteUnstarredRepos(): Promise<void> {
    const staleIds: string[] = []
    for (const cachedId of this.cachedReposIndex.keys()) {
      if (!this.starredRepoIds.has(cachedId)) {
        staleIds.push(cachedId)
      }
    }

    await Promise.all(
      staleIds.map(async (id): Promise<void> => {
        await idbDelete('repos', id)
      }),
    )
  }

  // Garbage-collect IDB after a completed load. The repos store is cleared
  // when the cache is disabled; the sweeps below run at most once a day.
  private async evictStaleData(session: number): Promise<void> {
    const { disableCache } = settings

    // Ungated: the snapshot this load ignored must not outlive it.
    if (disableCache) {
      await clearRepos()

      // Re-check after each await: a logout mustn't write past clearCache().
      if (this.isStale(session)) return
    }

    // Both sweeps below walk an entire store — once a day is plenty.
    const lastEvictedAtRaw = localStorage.getItem('lastEvictedAt')
    if (lastEvictedAtRaw !== null) {
      const elapsed = Date.now() - new Date(lastEvictedAtRaw).getTime()
      if (elapsed < 24 * 60 * 60 * 1000) return
    }

    // Skipped when the cache is disabled: the store was just cleared.
    if (!disableCache) {
      await this.evictStaleRepos(session)
      if (this.isStale(session)) return
    }

    await this.evictStaleDescriptions(session)

    if (this.isStale(session)) return

    localStorage.setItem('lastEvictedAt', new Date().toISOString())
  }

  // Trim aged-out releases from each cached repo. Never deletes rows —
  // deleteUnstarredRepos owns that.
  private async evictStaleRepos(session: number): Promise<void> {
    const allRepos = await idbGetAll('repos')

    // Bail before queueing writes so they don't land after reset()'s db.clear('repos').
    if (this.isStale(session)) return

    await Promise.all(
      allRepos.map(async (repo): Promise<void> => {
        const kept = repo.releases.nodes.filter(isReleaseInWindow)
        if (kept.length !== repo.releases.nodes.length) {
          const updated: GithubRepository = {
            ...repo,
            releases: { nodes: kept },
          }
          await idbPut('repos', updated, repo.id)
        }
      }),
    )
  }

  // Drop every cached description the finished feed no longer references.
  private async evictStaleDescriptions(session: number): Promise<void> {
    // The feed is the survivor set — this runs only after a full load.
    const survivorKeys = new Set<string>()
    for (const release of this.releases) {
      survivorKeys.add(descriptionKey(release.data.id, release.data.updatedAt))
    }

    const cachedKeys = await idbGetAllKeys('descriptions')

    // Bail before queueing deletes so they don't outlive a reset().
    if (this.isStale(session)) return

    await Promise.all(
      cachedKeys.map(async (key): Promise<void> => {
        if (!survivorKeys.has(key)) {
          await idbDelete('descriptions', key)
        }
      }),
    )
  }
}

const loader: Loader = new Loader()
export { loader }
