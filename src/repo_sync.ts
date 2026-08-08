import { idbDelete, idbGetAll, idbPut } from './db'
import {
  type GithubRepoManifestNode,
  type GithubReposByIdsResponse,
  type GithubRepository,
  type GithubStarredReposResponse,
  graphqlAllowingPartials,
  reposByIdsQuery,
  reposFullQuery,
  reposManifestQuery,
} from './github'
import { chunk, formatRelativeTime } from './helpers'
import { isReleaseInWindow } from './release_window'
import {
  MANIFEST_RETRY_POLICY,
  REFRESH_RETRY_POLICY,
  type RetryPolicy,
  type RetryRunner,
} from './retry'
import { settings } from './state.svelte'

import type { DescriptionSync } from './description_sync'
import type { FeedStore } from './feed.svelte'
import type { Session } from './session.svelte'
import type { Status } from './status.svelte'

const REFRESH_BATCH_SIZE = 20

// Raised from two places: a spent manifest page and a spent refresh batch.
const RATE_LIMIT_TOAST_KEY = 'rate-limit'

function rateLimitToast(resetAt: string): string {
  const lifts = formatRelativeTime(new Date(resetAt), new Date())
  return `ERROR: Reached Github Rate Limit - resets ${lifts}`
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

interface RepoSyncDeps {
  session: Session
  status: Status
  feed: FeedStore
  descriptions: DescriptionSync
  retry: RetryRunner
  // Runs only once a load has completed in full.
  onComplete: (sessionId: number) => Promise<void>
}

// Walks the starred-repo manifest, hydrates what the cache has, and refetches
// the rest one serialized batch at a time. Methods below `run()` are ordered
// DFS from it — preserve that.
export class RepoSync {
  private readonly session: Session
  private readonly status: Status
  private readonly feed: FeedStore
  private readonly descriptions: DescriptionSync
  private readonly retry: RetryRunner
  private readonly onComplete: (sessionId: number) => Promise<void>

  private starredRepoIds = new Set<string>()
  private cachedReposIndex = new Map<string, GithubRepository>()
  private refreshChain: Promise<boolean> = Promise.resolve(false)

  public constructor(deps: RepoSyncDeps) {
    this.session = deps.session
    this.status = deps.status
    this.feed = deps.feed
    this.descriptions = deps.descriptions
    this.retry = deps.retry
    this.onComplete = deps.onComplete
  }

  // The in-flight batch, whose already-queued IDB puts outlive a cache wipe.
  public get pendingRefresh(): Promise<boolean> {
    return this.refreshChain
  }

  public clear(): void {
    this.starredRepoIds = new Set()
    this.cachedReposIndex = new Map()
    // A chain left resolved `true` would short-circuit the next load's batches.
    this.refreshChain = Promise.resolve(false)
  }

  // Hydrate the cached-repo lookup from IDB, then paginate the manifest.
  public async run(sessionId: number): Promise<void> {
    if (!settings.disableCache) {
      const cachedRepos = await idbGetAll('repos')
      if (this.session.isStale(sessionId)) return
      for (const repo of cachedRepos) {
        this.cachedReposIndex.set(repo.id, repo)
      }
    }

    await this.fetchStarredReposPage(sessionId)
  }

  // Hydrate cached repos, enqueue refreshes for the rest, then recurse.
  private async fetchStarredReposPage(
    sessionId: number,
    cursor: string | null = null,
  ): Promise<void> {
    if (this.session.isStale(sessionId)) {
      console.error('ERROR: Session no longer active. Aborting...')
      return
    }

    // Guard the request only: a throw while processing would fork pagination.
    const response = await this.requestStarredReposPage(sessionId, cursor)
    if (!response) return

    // Entered with `void`, so an escaping throw is an unhandled rejection.
    try {
      await this.processStarredReposPage(sessionId, response)
    } catch (error) {
      this.abortLoad(sessionId, MANIFEST_RETRY_POLICY, error)
    }
  }

  // Undefined once the attempts are spent, or the session was superseded.
  private async requestStarredReposPage(
    sessionId: number,
    cursor: string | null,
  ): Promise<GithubStarredReposResponse | undefined> {
    // Cache disabled: skip the manifest and pull whole repos up front.
    const query = settings.disableCache ? reposFullQuery : reposManifestQuery

    const page = await this.retry.run(
      sessionId,
      MANIFEST_RETRY_POLICY,
      async (): Promise<GithubStarredReposResponse | undefined> => {
        const { octokit } = this.session
        if (!octokit) return undefined

        const startRequestTime = performance.now()
        const response = await octokit.graphql<
          GithubStarredReposResponse | undefined
        >(query, { cursor })

        // Don't bill a superseded session's request to the current load.
        if (this.session.isStale(sessionId)) return undefined

        this.status.addRequestTime(performance.now() - startRequestTime)

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
    sessionId: number,
    response: GithubStarredReposResponse,
  ): Promise<void> {
    if (this.session.isStale(sessionId)) {
      console.error('ERROR: Session no longer active. Aborting...')
      return
    }

    const {
      pageInfo,
      totalCount,
      nodes: starredRepos,
    } = response.viewer.starredRepositories

    this.status.countRepos(totalCount)

    // A page landed: retract the manifest warning, and nothing else.
    this.status.dismiss(MANIFEST_RETRY_POLICY.key)

    const shouldContinue =
      pageInfo.hasNextPage && response.rateLimit.remaining > 0
    if (shouldContinue) {
      void this.fetchStarredReposPage(sessionId, pageInfo.endCursor)
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
      this.mergeIntoFeed(sessionId, readyRepos)
    }

    for (const batch of chunk(repoIdsToRefresh, REFRESH_BATCH_SIZE)) {
      this.enqueueRefresh(sessionId, batch)
    }

    // Ready repos count as done; pending refreshes advance the rest.
    this.status.advance(readyRepos.length)

    if (pageInfo.hasNextPage && response.rateLimit.remaining <= 0) {
      // Incomplete: drain batches, but skip pruning + the caught-up marker.
      this.status.notify(
        RATE_LIMIT_TOAST_KEY,
        rateLimitToast(response.rateLimit.resetAt),
      )
      await this.refreshChain
      if (this.session.isStale(sessionId)) return
      this.status.loading = false
    } else if (!shouldContinue) {
      await this.finishLoad(sessionId)
    }
  }

  // Merge into the sorted feed, then prefetch notes for the cards that render.
  private mergeIntoFeed(sessionId: number, repos: GithubRepository[]): void {
    const startProcessingTime = performance.now()

    const displayable = this.feed
      .merge(repos)
      .filter((release): boolean => release.isDisplayable)

    if (displayable.length > 0) {
      void this.descriptions.load(sessionId, displayable)
    }

    this.status.addProcessingTime(performance.now() - startProcessingTime)
  }

  // Serialized: concurrent batches trip GitHub's secondary rate limit.
  private enqueueRefresh(sessionId: number, repoIds: string[]): void {
    this.refreshChain = this.runRefreshBatch(
      this.refreshChain,
      sessionId,
      repoIds,
    )
  }

  // Belt-and-braces: an unexpected throw aborts cleanly instead of
  // poisoning the chain.
  private async runRefreshBatch(
    previous: Promise<boolean>,
    sessionId: number,
    repoIds: string[],
  ): Promise<boolean> {
    try {
      const aborted = await previous
      if (aborted || this.session.isStale(sessionId)) return true

      return await this.refreshRepos(sessionId, repoIds)
    } catch (error) {
      this.abortLoad(sessionId, REFRESH_RETRY_POLICY, error)
      return true
    }
  }

  // Refresh one batch via nodes(ids:...). True signals abort.
  private async refreshRepos(
    sessionId: number,
    repoIds: string[],
  ): Promise<boolean> {
    const aborted = await this.retry.run(
      sessionId,
      REFRESH_RETRY_POLICY,
      async (): Promise<boolean | undefined> => {
        const { octokit } = this.session
        if (!octokit || this.session.isStale(sessionId)) return true

        const startRequestTime = performance.now()
        const response =
          await graphqlAllowingPartials<GithubReposByIdsResponse>(
            octokit,
            reposByIdsQuery,
            { repoIds },
          )

        if (this.session.isStale(sessionId)) return true

        this.status.addRequestTime(performance.now() - startRequestTime)

        // Missing response — retry.
        if (!response) return undefined

        this.status.dismiss(REFRESH_RETRY_POLICY.key)

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

        // Last await: leave feed state alone if the session ended mid-write.
        if (this.session.isStale(sessionId)) return true

        this.feed.dropForRepos(new Set(repoIds))

        this.mergeIntoFeed(sessionId, [...resolvedById.values()])

        // Full batch size, so progress hits 100% even when ids resolve to null.
        this.status.advance(repoIds.length)

        // Out of points: stop rather than burn every batch left on failures.
        if (response.rateLimit.remaining <= 0) {
          this.status.notify(
            RATE_LIMIT_TOAST_KEY,
            rateLimitToast(response.rateLimit.resetAt),
          )
          this.status.loading = false
          return true
        }

        return false
      },
    )

    // Spent retries abort the chain, same as an explicit true.
    return aborted ?? true
  }

  // Evict repos that vanished from the manifest, drain batches, wrap up.
  private async finishLoad(sessionId: number): Promise<void> {
    await this.deleteUnstarredRepos()

    // Bail first: a superseded session mustn't pull these from its successor.
    if (this.session.isStale(sessionId)) return

    // Drop both collections so the GC can reclaim them while refreshes drain.
    this.cachedReposIndex = new Map()
    this.starredRepoIds = new Set()

    // Drain the refresh chain; true means an enqueued batch aborted.
    const aborted = await this.refreshChain
    if (aborted || this.session.isStale(sessionId)) return

    this.status.loading = false

    await this.onComplete(sessionId)
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

  // Last by DFS. The only report for a throw escaping a fire-and-forget chain.
  private abortLoad(
    sessionId: number,
    policy: RetryPolicy,
    error: unknown,
  ): void {
    console.error(error)

    if (this.session.isStale(sessionId)) return

    this.status.notify(policy.key, `ERROR: ${policy.exhausted}`)
    // finishLoad bails on abort, so stop the spinner here.
    this.status.loading = false
  }
}
