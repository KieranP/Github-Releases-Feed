import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearCache, idbGet, idbPut } from '../src/db'
import { DescriptionSync } from '../src/description_sync'
import { FeedStore } from '../src/feed.svelte'
import {
  descriptionQuery,
  type GithubRepoManifestNode,
  type GithubRepository,
  reposByIdsQuery,
  reposManifestQuery,
} from '../src/github'
import { delay } from '../src/helpers'
import { RepoSync } from '../src/repo_sync'
import { REFRESH_RETRY_POLICY, RetryRunner } from '../src/retry'
import { Status } from '../src/status.svelte'
import {
  type GraphqlStub,
  liveSession,
  noop,
  RATE_LIMIT,
  repoFixture,
} from './fixtures'

const SESSION_ID = 1

interface FakeGithub {
  pages: GithubRepoManifestNode[][]
  repos: Map<string, GithubRepository>
  manifestRemaining?: number
  refresh?: (repoIds: string[]) => Promise<void> | void
}

interface Harness {
  sync: RepoSync
  feed: FeedStore
  status: Status
  graphql: GraphqlStub
  onComplete: ReturnType<typeof vi.fn<(sessionId: number) => Promise<void>>>
  goStale: () => void
}

function manifestNode(repo: GithubRepository): GithubRepoManifestNode {
  return {
    id: repo.id,
    name: repo.name,
    owner: { login: repo.owner.login },
    updatedAt: repo.updatedAt,
  }
}

function edited(repo: GithubRepository): GithubRepository {
  return { ...repo, updatedAt: new Date().toISOString() }
}

function manifestPage(github: FakeGithub, cursor: unknown): unknown {
  const index = cursor === null ? 0 : Number(cursor)
  const hasNextPage = index + 1 < github.pages.length

  return {
    viewer: {
      starredRepositories: {
        totalCount: github.pages.flat().length,
        pageInfo: { endCursor: String(index + 1), hasNextPage },
        nodes: github.pages[index] ?? [],
      },
    },
    rateLimit: {
      ...RATE_LIMIT,
      remaining: github.manifestRemaining ?? RATE_LIMIT.remaining,
    },
  }
}

async function reposByIds(
  github: FakeGithub,
  repoIds: string[],
): Promise<unknown> {
  await github.refresh?.(repoIds)

  return {
    nodes: repoIds.map((id) => {
      const repo = github.repos.get(id)
      return repo ? structuredClone(repo) : null
    }),
    rateLimit: RATE_LIMIT,
  }
}

function serve(graphql: GraphqlStub, github: FakeGithub): void {
  graphql.mockImplementation((query, variables) => {
    if (query === reposManifestQuery) {
      return manifestPage(github, variables['cursor'])
    }
    if (query === reposByIdsQuery) {
      return reposByIds(github, variables['repoIds'] as string[])
    }
    if (query === descriptionQuery) {
      return { nodes: [], rateLimit: RATE_LIMIT }
    }
    throw new Error('unexpected query')
  })
}

function harness(github: FakeGithub): Harness {
  const { session, graphql, goStale } = liveSession()
  serve(graphql, github)

  const status = new Status()
  status.loading = true
  const feed = new FeedStore()
  const retry = new RetryRunner({ session, status, onAuthFailure: noop })
  const descriptions = new DescriptionSync({ session, feed, retry })
  const onComplete = vi.fn<(sessionId: number) => Promise<void>>()

  return {
    sync: new RepoSync({
      session,
      status,
      feed,
      descriptions,
      retry,
      onComplete,
    }),
    feed,
    status,
    graphql,
    onComplete,
    goStale,
  }
}

function refreshCalls(graphql: GraphqlStub): unknown[] {
  return graphql.mock.calls
    .filter(([query]) => query === reposByIdsQuery)
    .map(([, variables]) => variables['repoIds'])
}

async function cache(...repos: GithubRepository[]): Promise<void> {
  await Promise.all(
    repos.map(async (repo) => {
      await idbPut('repos', repo, repo.id)
    }),
  )
}

async function untilSettled(status: Status): Promise<void> {
  await vi.waitFor(() => {
    expect(status.loading).toBe(false)
  })
}

describe('RepoSync', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(noop)
    vi.spyOn(console, 'warn').mockImplementation(noop)
    await clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('refetches only the repos whose updatedAt moved', async () => {
    const unchanged = repoFixture('a')
    const stale = repoFixture('b')
    const fresh = edited(stale)
    await cache(unchanged, stale)

    const { sync, feed, status, graphql, onComplete } = harness({
      pages: [[manifestNode(unchanged), manifestNode(fresh)]],
      repos: new Map([['b', fresh]]),
    })
    await sync.run(SESSION_ID)
    await untilSettled(status)

    expect(refreshCalls(graphql)).toEqual([['b']])
    expect(feed.find('a-rel')).toBeDefined()
    expect(feed.find('b-rel')).toBeDefined()
    const stored = await idbGet('repos', 'b')
    expect(stored?.updatedAt).toBe(fresh.updatedAt)
    expect(onComplete).toHaveBeenCalledWith(SESSION_ID)
    expect(status.progress).toBe(1)
    expect(status.completed).toBe(true)
  })

  it('deletes a cached repo that is no longer starred', async () => {
    const kept = repoFixture('a')
    const unstarred = repoFixture('c')
    await cache(kept, unstarred)

    const { sync, status } = harness({
      pages: [[manifestNode(kept)]],
      repos: new Map(),
    })
    await sync.run(SESSION_ID)
    await untilSettled(status)

    expect(await idbGet('repos', 'a')).toBeDefined()
    expect(await idbGet('repos', 'c')).toBeUndefined()
  })

  it('drops a repo whose id no longer resolves', async () => {
    const gone = repoFixture('a')
    await cache({ ...gone, updatedAt: 'older' })

    const { sync, feed, status, onComplete } = harness({
      pages: [[manifestNode(gone)]],
      repos: new Map(),
    })
    await sync.run(SESSION_ID)
    await untilSettled(status)

    expect(await idbGet('repos', 'a')).toBeUndefined()
    expect(feed.find('a-rel')).toBeUndefined()
    expect(onComplete).toHaveBeenCalled()
  })

  it('runs refresh batches one at a time', async () => {
    const repos = Array.from({ length: 45 }, (_, i) => repoFixture(`r${i}`))
    let inFlight = 0
    let maxInFlight = 0

    const { sync, status, graphql } = harness({
      pages: [repos.map((repo) => manifestNode(repo))],
      repos: new Map(repos.map((repo) => [repo.id, repo])),
      refresh: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await delay(5)
        inFlight -= 1
      },
    })
    await sync.run(SESSION_ID)
    await untilSettled(status)

    expect(
      refreshCalls(graphql).map((ids) => (ids as string[]).length),
    ).toEqual([20, 20, 5])
    expect(maxInFlight).toBe(1)
  })

  it('abandons the chain when a batch spends its retries', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const repos = Array.from({ length: 25 }, (_, i) => repoFixture(`r${i}`))

    const { sync, status, graphql, onComplete } = harness({
      pages: [repos.map((repo) => manifestNode(repo))],
      repos: new Map(),
      refresh: () => {
        throw new Error('boom')
      },
    })
    const running = sync.run(SESSION_ID)
    await vi.waitFor(async () => {
      await vi.runAllTimersAsync()
      expect(status.loading).toBe(false)
    })
    await running

    expect(refreshCalls(graphql)).toHaveLength(4)
    expect(status.toasts).toEqual([
      {
        key: REFRESH_RETRY_POLICY.key,
        message: `ERROR: ${REFRESH_RETRY_POLICY.exhausted}`,
      },
    ])
    expect(onComplete).not.toHaveBeenCalled()
    expect(status.completed).toBe(false)
  })

  it('stops paging without pruning once the manifest runs out of points', async () => {
    const first = repoFixture('a')
    const second = repoFixture('b')
    const unstarred = repoFixture('c')
    await cache(first, second, unstarred)

    const { sync, status, graphql, onComplete } = harness({
      pages: [[manifestNode(first)], [manifestNode(second)]],
      repos: new Map(),
      manifestRemaining: 0,
    })
    await sync.run(SESSION_ID)
    await untilSettled(status)

    const manifestCalls = graphql.mock.calls.filter(
      ([query]) => query === reposManifestQuery,
    )
    expect(manifestCalls).toHaveLength(1)
    expect(status.toasts.map((t) => t.key)).toEqual(['rate-limit'])
    expect(await idbGet('repos', 'c')).toBeDefined()
    expect(onComplete).not.toHaveBeenCalled()
    expect(status.completed).toBe(false)
  })

  it('leaves the feed alone when a refresh lands after the session ends', async () => {
    const repo = repoFixture('a')

    const { sync, feed, graphql, onComplete, goStale } = harness({
      pages: [[manifestNode(repo)]],
      repos: new Map([['a', repo]]),
      refresh: () => {
        goStale()
      },
    })
    await sync.run(SESSION_ID)
    await vi.waitFor(() => {
      expect(refreshCalls(graphql)).toHaveLength(1)
    })
    await sync.pendingRefresh

    expect(feed.find('a-rel')).toBeUndefined()
    expect(await idbGet('repos', 'a')).toBeUndefined()
    expect(onComplete).not.toHaveBeenCalled()
  })
})
