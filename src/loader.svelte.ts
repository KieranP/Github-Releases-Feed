/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/unbound-method */
import { Octokit } from '@octokit/core'

import { clearCache, descriptionKey, getDb } from './db'
import {
  descriptionQuery,
  type GithubReleaseResponse,
  type GithubRepoManifestNode,
  type GithubReposByIdsResponse,
  type GithubRepository,
  type GithubReposManifestResponse,
  reposByIdsQuery,
  reposManifestQuery,
} from './github'
import { chunk, mergeSorted } from './helpers'
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

// True if release.publishedAt falls within the visible one-month feed window.
function isReleaseInWindow(release: { publishedAt: string }): boolean {
  return new Date(release.publishedAt) >= startingDate
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
      const wasPreviouslySeen = release.data.publishedAt <= settings.lastAccessedAt
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

  // Kick off a load: marks loading active and starts the async pipeline.
  // No-op if no GitHub token is configured.
  public start(): void {
    if (!this.octokit) return

    this.loading = true
    this.totalRequestTime = 0
    this.totalProcessingTime = 0

    void this.run()
  }

  // Wipe the token, IDB stores, and all in-memory state. Called on
  // explicit logout and on auth errors that invalidate the session.
  public reset(): void {
    localStorage.removeItem('githubToken')
    settings.githubToken = null

    localStorage.removeItem('lastAccessedAt')
    settings.lastAccessedAt = new Date(0)

    localStorage.removeItem('lastEvictedAt')

    void clearCache()

    this.loading = false
    this.toast = ''

    this.totalRepos = 0
    this.reposProcessed = 0
    this.releases = []
    this.releasesIndex = new Map()
    this.releasesByRepo = new Map()
    this.starredRepoIds = new Set()
    this.cachedReposIndex = new Map()
    this.reposRefreshChain = Promise.resolve(false)
  }

  // Top-level load pipeline: populate the in-memory cached-repo lookup
  // from IDB, then start paginating the GitHub manifest.
  private async run(): Promise<void> {
    const idb = getDb()
    if (idb) {
      const cachedRepos = await idb.getAll('repos')
      for (const repo of cachedRepos) {
        this.cachedReposIndex.set(repo.id, repo)
      }
    }

    await this.fetchStarredReposPage()
  }

  // Fetch one page of starred repos (id + updatedAt). Hydrate cached
  // ones, enqueue refreshes for new/changed, then recurse to next page.
  private async fetchStarredReposPage(
    cursor: string | null = null,
    retries = 0,
  ): Promise<void> {
    if (!this.octokit) {
      console.log('ERROR: Missing Github API Token. Aborting...')
      return
    }

    try {
      const startRequestTime = performance.now()
      const response = await this.octokit.graphql<
        GithubReposManifestResponse | undefined
      >(reposManifestQuery, { cursor })
      this.totalRequestTime += performance.now() - startRequestTime

      // eslint-disable-next-line
      if (!this.octokit) {
        console.log('ERROR: Missing Github API Token. Aborting...')
        return
      }

      if (!response) {
        throw new Error('Invalid GraphQL Response')
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
        void this.fetchStarredReposPage(pageInfo.endCursor)
      }

      const cachedRepos: GithubRepository[] = []
      const repoIdsToRefresh: string[] = []
      for (const starredRepo of starredRepos) {
        // Skip duplicate nodes (concurrent star changes) repeated across pages.
        if (!this.starredRepoIds.has(starredRepo.id)) {
          this.starredRepoIds.add(starredRepo.id)
          const cached = this.cachedReposIndex.get(starredRepo.id)
          if (this.repoNeedsRefresh(starredRepo, cached)) {
            repoIdsToRefresh.push(starredRepo.id)
          } else if (cached) {
            cachedRepos.push(cached)
          }
        }
      }

      if (cachedRepos.length > 0) {
        this.mergeReposIntoFeed(cachedRepos)
      }

      for (const batch of chunk(repoIdsToRefresh, REFRESH_BATCH_SIZE)) {
        this.enqueueRepoRefresh(batch)
      }

      // Fresh-cached repos count as done; pending refreshes advance the rest.
      this.reposProcessed += cachedRepos.length

      if (pageInfo.hasNextPage && response.rateLimit.remaining <= 0) {
        // Incomplete: drain batches, but skip unstarred-pruning + caught-up marker.
        this.toast = 'ERROR: Reached Github Rate Limit'
        await this.reposRefreshChain
        this.loading = false
      } else if (!shouldContinue) {
        await this.finishLoad()
      }
    } catch (error: unknown) {
      this.handleFetchError(error, retries, (nextRetries): void => {
        void this.fetchStarredReposPage(cursor, nextRetries)
      })
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
  private mergeReposIntoFeed(repos: GithubRepository[]): void {
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

      void this.fetchReleaseDescriptions(newReleases)
    }

    this.totalProcessingTime += performance.now() - startProcessingTime
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
  private async fetchReleaseDescriptions(releases: Release[]): Promise<void> {
    if (!this.octokit || releases.length === 0) return

    const uncachedReleaseIds: string[] = []

    const idb = getDb()
    if (idb) {
      await Promise.all(
        releases.map(async (release): Promise<void> => {
          const description = await idb.get(
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
    } else {
      for (const release of releases) {
        uncachedReleaseIds.push(release.data.id)
      }
    }

    if (uncachedReleaseIds.length === 0) return

    const batches = chunk(uncachedReleaseIds, DESCRIPTION_BATCH_SIZE)

    await Promise.all(
      batches.map(async (releaseIds): Promise<void> => {
        if (!this.octokit) return

        const response = await this.octokit.graphql<
          GithubReleaseResponse | undefined
        >(descriptionQuery, { releaseIds })

        // eslint-disable-next-line
        if (!this.octokit) return

        if (!response) return

        response.nodes.forEach((releaseNode): void => {
          if (!releaseNode) return

          if (idb) {
            void idb.put(
              'descriptions',
              releaseNode.descriptionHTML,
              descriptionKey(releaseNode.id, releaseNode.updatedAt),
            )
          }

          this.attachReleaseDescription(
            releaseNode.id,
            releaseNode.descriptionHTML,
          )
        })
      }),
    )
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
  private enqueueRepoRefresh(repoIds: string[]): void {
    this.reposRefreshChain = this.reposRefreshChain
      // oxlint-disable-next-line promise/prefer-await-to-then
      .then((aborted): boolean | Promise<boolean> => {
        if (aborted) return true
        if (!this.octokit) return true
        return this.refreshRepos(repoIds, 0)
      })
      // Belt-and-braces: any unexpected throw becomes a clean abort
      // rather than poisoning the chain for all later batches.
      // oxlint-disable-next-line promise/prefer-await-to-then
      .catch((): boolean => true)
  }

  // Refresh up to REFRESH_BATCH_SIZE repos via nodes(ids:...). Retries
  // up to 3× on transient errors; returns true to signal abort.
  private async refreshRepos(
    repoIds: string[],
    retries: number,
  ): Promise<boolean> {
    if (!this.octokit) return true

    try {
      const startRequestTime = performance.now()
      const response = await this.octokit.graphql<
        GithubReposByIdsResponse | undefined
      >(reposByIdsQuery, { repoIds })
      this.totalRequestTime += performance.now() - startRequestTime

      // eslint-disable-next-line
      if (!this.octokit) return true

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

        const idb = getDb()
        if (idb) {
          // Treat unresolvable ids as unstarred (delete from cache).
          await Promise.all(
            repoIds.map(async (id): Promise<void> => {
              const repo = resolvedById.get(id)
              await (repo
                ? idb.put('repos', repo, id)
                : idb.delete('repos', id))
            }),
          )
        }

        this.dropReleasesForRepos(new Set(repoIds))

        this.mergeReposIntoFeed([...resolvedById.values()])

        // Advance by full batch size so progress reaches 100% even when ids resolve to null.
        this.reposProcessed += repoIds.length
        return false
      }
      // Missing response — fall through to retry.
    } catch (error: unknown) {
      console.log(error)
      if (this.handleAuthError(error)) return true
      // Fall through to retry on non-auth errors.
    }

    const nextRetries = this.nextRetry(retries)
    if (nextRetries !== null) return this.refreshRepos(repoIds, nextRetries)
    return true
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
  private handleAuthError(error: unknown): boolean {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 401
    ) {
      this.reset()
      this.toast = 'ERROR: API Token Invalid/Expired'
      return true
    }
    return false
  }

  // Standard error path for fetchStarredReposPage: short-circuit on
  // auth errors, otherwise retry up to 3× then surface the failure.
  private handleFetchError(
    error: unknown,
    retries: number,
    retry: (nextRetries: number) => void,
  ): void {
    console.log(error)

    if (this.handleAuthError(error)) return

    const nextRetries = this.nextRetry(retries)
    if (nextRetries !== null) retry(nextRetries)
  }

  // Shared retry policy: returns the next retry count if more attempts
  // remain (and sets the retry toast), else null + surfaces the abort.
  private nextRetry(retries: number): number | null {
    if (retries < 3) {
      const nextRetries = retries + 1
      this.toast = `ERROR: Request Failed - Retry #${nextRetries}`
      console.log(this.toast)
      return nextRetries
    }

    this.toast = 'ERROR: Repeated Request Failures - Aborting'
    this.loading = false
    return null
  }

  // After the final manifest page: evict repos that disappeared from
  // the manifest, drain refresh batches, then wrap up the load.
  private async finishLoad(): Promise<void> {
    try {
      await this.deleteUnstarredRepos()
    } catch (error) {
      console.error('Failed to delete unstarred repos from IDB', error)
    }

    // Drop both collections so the GC can reclaim them while refreshes drain.
    this.cachedReposIndex = new Map()
    this.starredRepoIds = new Set()

    // Drain the refresh chain; true means an enqueued batch aborted.
    const aborted = await this.reposRefreshChain
    if (aborted) return

    this.loading = false

    // Persist only; in-memory stays at session-start so the marker doesn't jump mid-session.
    localStorage.setItem('lastAccessedAt', new Date().toISOString())

    console.log(`Total Request Time: ${this.totalRequestTime.toFixed(2)} ms`)
    console.log(
      `Total Processing Time: ${this.totalProcessingTime.toFixed(2)} ms`,
    )

    try {
      await this.evictStaleData()
    } catch (error) {
      console.error('Failed to evict stale IDB data', error)
    }
  }

  // Delete cached repos that no longer appear in the user's current
  // starred set (e.g. unstarred between sessions).
  private async deleteUnstarredRepos(): Promise<void> {
    const idb = getDb()
    if (!idb) return

    const staleIds: string[] = []
    for (const cachedId of this.cachedReposIndex.keys()) {
      if (!this.starredRepoIds.has(cachedId)) {
        staleIds.push(cachedId)
      }
    }

    await Promise.all(
      staleIds.map(async (id): Promise<void> => {
        await idb.delete('repos', id)
      }),
    )
  }

  // Garbage-collect IDB: drop releases that aged out of the one-month
  // window and any description entries whose release no longer exists.
  private async evictStaleData(): Promise<void> {
    const idb = getDb()
    if (!idb) return

    const lastEvictedAtRaw = localStorage.getItem('lastEvictedAt')
    if (lastEvictedAtRaw !== null) {
      const elapsed = Date.now() - new Date(lastEvictedAtRaw).getTime()
      if (elapsed < 24 * 60 * 60 * 1000) return
    }

    const allRepos = await idb.getAll('repos')

    // Bail before queueing writes so they don't land after reset()'s db.clear('repos').
    if (!this.octokit) return

    const survivorDescriptionKeys = new Set<string>()

    await Promise.all(
      allRepos.map(async (repo): Promise<void> => {
        const kept = repo.releases.nodes.filter(isReleaseInWindow)
        for (const release of kept) {
          survivorDescriptionKeys.add(
            descriptionKey(release.id, release.updatedAt),
          )
        }
        if (kept.length !== repo.releases.nodes.length) {
          const updated: GithubRepository = {
            ...repo,
            releases: { nodes: kept },
          }
          await idb.put('repos', updated, repo.id)
        }
      }),
    )

    // Re-check after each await: a logout mid-eviction mustn't write past clearCache().
    // eslint-disable-next-line
    if (!this.octokit) return

    const descriptionKeys = await idb.getAllKeys('descriptions')

    // eslint-disable-next-line
    if (!this.octokit) return

    await Promise.all(
      descriptionKeys.map(async (key): Promise<void> => {
        if (!survivorDescriptionKeys.has(key)) {
          await idb.delete('descriptions', key)
        }
      }),
    )

    // eslint-disable-next-line
    if (!this.octokit) return

    localStorage.setItem('lastEvictedAt', new Date().toISOString())
  }
}

const loader: Loader = new Loader()
export { loader }
