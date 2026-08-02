/* eslint-disable @typescript-eslint/member-ordering */
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
import { fetchAsDate, forget, persist, settings } from './state.svelte'

const now = new Date()
const startingDate = new Date(now)
startingDate.setMonth(now.getMonth() - 1)

// Not a valid "owner/name", so it can't collide with a real repo group.
const CAUGHT_UP_GROUP_REPO = '__caught_up__'

const REFRESH_BATCH_SIZE = 20
const DESCRIPTION_BATCH_SIZE = 20
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500
const EVICTION_INTERVAL_MS = 24 * 60 * 60 * 1000

// How a failing request narrates itself, and whether giving up ends the load.
interface RetryPolicy {
  retrying: string
  exhausted: string
  fatal: boolean
}

// Manifest pages and repo refreshes: the load can't complete without them.
const REQUEST_RETRY_POLICY: RetryPolicy = {
  retrying: 'Request Failed',
  exhausted: 'Repeated Request Failures - Aborting',
  fatal: true,
}

// Release notes are supplementary — report it, but leave the spinner alone.
const DESCRIPTION_RETRY_POLICY: RetryPolicy = {
  retrying: 'Release Notes Failed',
  exhausted: 'Failed to load some release notes',
  fatal: false,
}

// The visible feed window is one month.
function isReleaseInWindow(release: { publishedAt: string }): boolean {
  return new Date(release.publishedAt) >= startingDate
}

// Only reposFullQuery nodes carry `releases` — those need no refresh.
function isFullRepo(
  node: GithubRepoManifestNode | GithubRepository,
): node is GithubRepository {
  return 'releases' in node
}

// `updatedAt` bumps on any repo metadata write.
function repoNeedsRefresh(
  starredRepo: GithubRepoManifestNode,
  cached: GithubRepository | undefined,
): boolean {
  if (!cached) return true
  return cached.updatedAt !== starredRepo.updatedAt
}

// Drops releases that fall outside the feed window.
function extractReleases(repo: GithubRepository): Release[] {
  const { releases: releaseData, ...repoData } = repo

  const fullName = `${repoData.owner.login}/${repoData.name}`
  const releaseRepo = { ...repoData, fullName }

  return releaseData.nodes.filter(isReleaseInWindow).map(
    (releaseNode): Release =>
      new Release({
        repo: releaseRepo,
        ...releaseNode,
        publishedAt: new Date(releaseNode.publishedAt),
      }),
  )
}

// Newest first — the feed order mergeSorted maintains.
function releaseSortFn(a: Release, b: Release): number {
  return b.data.publishedAt.getTime() - a.data.publishedAt.getTime()
}

// Retrying instantly is what trips the secondary rate limit to begin with.
async function retryDelay(retries: number): Promise<void> {
  await delay(RETRY_BASE_DELAY_MS * 2 ** (retries - 1))
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

    // First visit, or every seen release hidden: put the divider at the end.
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
  // Bumped on every start/reset: a token check alone can't tell a stale chain
  // from a fresh one once a new token has been pasted in.
  private session = 0

  // No-op if no GitHub token is configured.
  public start(): void {
    if (!this.octokit) return

    this.session += 1
    this.resetFeedState()
    this.loading = true

    void this.run(this.session)
  }

  // Called on explicit logout and on auth errors that invalidate the session.
  public reset(): void {
    forget('githubToken')
    settings.githubToken = null

    forget('lastAccessedAt')
    settings.lastAccessedAt = new Date(0)

    forget('lastEvictedAt')

    // Bump first so isStale() rejects every in-flight continuation.
    this.session += 1
    void this.wipeCache(this.session, this.reposRefreshChain)

    this.loading = false
    this.toast = ''

    this.resetFeedState()
  }

  // Cancels the running load first, else its in-flight writes repopulate the
  // stores as fast as they're cleared.
  public async clearCachedData(): Promise<void> {
    const pendingRefresh = this.reposRefreshChain

    this.session += 1
    const { session } = this

    this.resetFeedState()

    // Hold the spinner: the drain and reload take seconds with a blank feed.
    this.loading = this.octokit !== undefined

    await this.wipeCache(session, pendingRefresh)

    // A second click, or a logout, superseded this wipe.
    if (session !== this.session) return

    this.start()
  }

  // Shared by start/reset/clearCachedData, so a second load can't double-merge.
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
    // A chain left resolved `true` would short-circuit the next load's batches.
    this.reposRefreshChain = Promise.resolve(false)
  }

  // Twice: the in-flight batch's already-queued puts outlive the first wipe.
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

  // Every continuation after an await must bail on this.
  private isStale(session: number): boolean {
    return session !== this.session || !this.octokit
  }

  // Hydrate the cached-repo lookup from IDB, then paginate the manifest.
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

  // Hydrate cached repos, enqueue refreshes for the rest, then recurse.
  private async fetchStarredReposPage(
    session: number,
    cursor: string | null = null,
  ): Promise<void> {
    if (this.isStale(session)) {
      console.error('ERROR: Session no longer active. Aborting...')
      return
    }

    // Only the request is guarded: a throw while processing must not re-issue
    // this page and fork the pagination chain.
    const response = await this.requestStarredReposPage(session, cursor)
    if (!response) return

    await this.processStarredReposPage(session, response)
  }

  // Undefined once the attempts are spent, or the session was superseded.
  private async requestStarredReposPage(
    session: number,
    cursor: string | null,
  ): Promise<GithubStarredReposResponse | undefined> {
    // Cache disabled: skip the manifest and pull whole repos up front.
    const query = settings.disableCache ? reposFullQuery : reposManifestQuery

    const page = await this.withRetries(
      session,
      REQUEST_RETRY_POLICY,
      async (): Promise<GithubStarredReposResponse | undefined> => {
        const { octokit } = this
        if (!octokit) return undefined

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
      },
    )

    return page
  }

  // Merge ready repos, enqueue refreshes for the rest, then advance or wrap up.
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
        if (repoNeedsRefresh(starredRepo, cached)) {
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

  // Merge into the sorted feed, index by id, then fetch descriptions.
  private mergeReposIntoFeed(session: number, repos: GithubRepository[]): void {
    const startProcessingTime = performance.now()
    const newReleases: Release[] = []

    for (const repo of repos) {
      newReleases.push(...extractReleases(repo))
    }

    if (newReleases.length > 0) {
      this.releases = mergeSorted(this.releases, newReleases, releaseSortFn)

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

  // Fire-and-forget: nothing must escape as an unhandled rejection.
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

  // Attach cached entries from IDB, then batch-fetch the rest.
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
        await this.fetchDescriptionBatch(session, releaseIds)
      }),
    )
  }

  // Retries rather than leaving the cards permanently blank.
  private async fetchDescriptionBatch(
    session: number,
    releaseIds: string[],
  ): Promise<void> {
    await this.withRetries(
      session,
      DESCRIPTION_RETRY_POLICY,
      async (): Promise<boolean | undefined> => {
        const { octokit } = this
        if (!octokit || this.isStale(session)) return true

        const response = await graphqlAllowingPartials<GithubReleaseResponse>(
          octokit,
          descriptionQuery,
          { releaseIds },
        )

        if (this.isStale(session)) return true

        // Missing response — retry.
        if (!response) return undefined

        for (const releaseNode of response.nodes) {
          if (!releaseNode) continue

          // Key on the release's own updatedAt; reads and eviction use that.
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

        return true
      },
    )
  }

  // Setting descriptionHTML re-renders that card.
  private attachReleaseDescription(
    releaseId: string,
    description: string,
  ): void {
    const release = this.releasesIndex.get(releaseId)

    if (release) {
      release.data.descriptionHTML = description
    }
  }

  // Serialized: concurrent batches trip GitHub's secondary rate limit.
  private enqueueRepoRefresh(session: number, repoIds: string[]): void {
    this.reposRefreshChain = this.runRefreshBatch(
      this.reposRefreshChain,
      session,
      repoIds,
    )
  }

  // Belt-and-braces: an unexpected throw aborts cleanly instead of
  // poisoning the chain.
  private async runRefreshBatch(
    previous: Promise<boolean>,
    session: number,
    repoIds: string[],
  ): Promise<boolean> {
    try {
      const aborted = await previous
      if (aborted || this.isStale(session)) return true

      return await this.refreshRepos(session, repoIds)
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

  // Refresh one batch via nodes(ids:...). True signals abort.
  private async refreshRepos(
    session: number,
    repoIds: string[],
  ): Promise<boolean> {
    const aborted = await this.withRetries(
      session,
      REQUEST_RETRY_POLICY,
      async (): Promise<boolean | undefined> => {
        const { octokit } = this
        if (!octokit || this.isStale(session)) return true

        const startRequestTime = performance.now()
        const response =
          await graphqlAllowingPartials<GithubReposByIdsResponse>(
            octokit,
            reposByIdsQuery,
            { repoIds },
          )

        if (this.isStale(session)) return true

        this.totalRequestTime += performance.now() - startRequestTime

        // Missing response — retry.
        if (!response) return undefined

        this.toast = ''

        // Unresolvable ids come back null; trim the rest to the window.
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

        // Last await: don't touch feed state for a session that ended mid-write.
        if (this.isStale(session)) return true

        this.dropReleasesForRepos(new Set(repoIds))

        this.mergeReposIntoFeed(session, [...resolvedById.values()])

        // Full batch size, so progress hits 100% even when ids resolve to null.
        this.reposProcessed += repoIds.length

        // Out of points: stop rather than burn every remaining batch on failures.
        if (response.rateLimit.remaining <= 0) {
          this.toast = 'ERROR: Reached Github Rate Limit'
          this.loading = false
          return true
        }

        return false
      },
    )

    // Spent retries abort the chain, same as an explicit true.
    return aborted ?? true
  }

  // Used before re-merging fresh repo data.
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

  // True when the error was a 401 and the session has been reset.
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

  // Retry `attempt` until it returns a value, MAX_RETRIES are spent, or the
  // session goes stale. It asks for another go with undefined, as does a throw.
  private async withRetries<T>(
    session: number,
    policy: RetryPolicy,
    attempt: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    // Sequential by definition — backing off is the point.
    /* eslint-disable no-await-in-loop */
    for (let retries = 0; ; retries += 1) {
      try {
        const value = await attempt()
        if (value !== undefined) return value
      } catch (error: unknown) {
        console.error(error)
        if (this.handleAuthError(session, error)) return undefined
      }

      // A superseded session must not touch the live one's toast or spinner.
      if (this.isStale(session)) return undefined

      if (retries >= MAX_RETRIES) {
        this.toast = `ERROR: ${policy.exhausted}`
        if (policy.fatal) this.loading = false
        return undefined
      }

      const nextRetries = retries + 1
      this.toast = `ERROR: ${policy.retrying} - Retry #${nextRetries}`
      await retryDelay(nextRetries)
      if (this.isStale(session)) return undefined
    }
    /* eslint-enable no-await-in-loop */
  }

  // Evict repos that vanished from the manifest, drain batches, wrap up.
  private async finishLoad(session: number): Promise<void> {
    await this.deleteUnstarredRepos()

    // Bail first: a superseded session mustn't pull these from its successor.
    if (this.isStale(session)) return

    // Drop both collections so the GC can reclaim them while refreshes drain.
    this.cachedReposIndex = new Map()
    this.starredRepoIds = new Set()

    // Drain the refresh chain; true means an enqueued batch aborted.
    const aborted = await this.reposRefreshChain
    if (aborted || this.isStale(session)) return

    this.loading = false

    // Persist only: in-memory stays put so the marker can't jump mid-session.
    persist('lastAccessedAt', new Date())

    console.log(`Total Request Time: ${this.totalRequestTime.toFixed(2)} ms`)
    console.log(
      `Total Processing Time: ${this.totalProcessingTime.toFixed(2)} ms`,
    )

    await this.evictStaleData(session)
  }

  // Repos unstarred between sessions.
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

  // GC after a completed load; the sweeps below run at most once a day.
  private async evictStaleData(session: number): Promise<void> {
    const { disableCache } = settings

    // Ungated: the snapshot this load ignored must not outlive it.
    if (disableCache) {
      await clearRepos()

      // Re-check after each await: a logout mustn't write past clearCache().
      if (this.isStale(session)) return
    }

    // Both sweeps below walk an entire store — once a day is plenty.
    const lastEvictedAt = fetchAsDate('lastEvictedAt')
    if (lastEvictedAt !== null) {
      const elapsed = Date.now() - lastEvictedAt.getTime()
      if (elapsed < EVICTION_INTERVAL_MS) return
    }

    // Skipped when the cache is disabled: the store was just cleared.
    if (!disableCache) {
      await this.evictStaleRepos(session)
      if (this.isStale(session)) return
    }

    await this.evictStaleDescriptions(session)

    if (this.isStale(session)) return

    persist('lastEvictedAt', new Date())
  }

  // Never deletes rows — deleteUnstarredRepos owns that.
  private async evictStaleRepos(session: number): Promise<void> {
    const allRepos = await idbGetAll('repos')

    // Bail before queueing writes; they'd land after reset()'s clear.
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
