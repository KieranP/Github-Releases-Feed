import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CacheEviction } from '../src/cache_eviction'
import {
  clearCache,
  descriptionKey,
  idbGet,
  idbGetAllKeys,
  idbPut,
} from '../src/db'
import { FeedStore } from '../src/feed.svelte'
import { forget, persist, settings } from '../src/state.svelte'
import { IN_WINDOW, liveSession, OUT_OF_WINDOW, repoFixture } from './fixtures'

import type { GithubRepository } from '../src/github'

const SESSION_ID = 1

interface Harness {
  eviction: CacheEviction
  feed: FeedStore
}

function harness(): Harness {
  const { session } = liveSession()
  const feed = new FeedStore()
  return { eviction: new CacheEviction({ session, feed }), feed }
}

function withAgedRelease(repo: GithubRepository): GithubRepository {
  const [current] = repo.releases.nodes
  if (!current) throw new Error('fixture has no release')

  return {
    ...repo,
    releases: {
      nodes: [
        current,
        {
          ...current,
          id: `${repo.id}-old`,
          publishedAt: OUT_OF_WINDOW.toISOString(),
        },
      ],
    },
  }
}

describe('CacheEviction', () => {
  beforeEach(async () => {
    await clearCache()
  })

  afterEach(() => {
    settings.disableCache = false
    forget('lastEvictedAt')
    vi.restoreAllMocks()
  })

  it('trims cached releases that fell out of the window', async () => {
    const { eviction } = harness()
    await idbPut('repos', withAgedRelease(repoFixture('a')), 'a')

    await eviction.run(SESSION_ID)

    const stored = await idbGet('repos', 'a')
    expect(stored?.releases.nodes.map((r) => r.id)).toEqual(['a-rel'])
  })

  it('drops cached descriptions the feed no longer references', async () => {
    const { eviction, feed } = harness()
    feed.merge([repoFixture('a')])
    const kept = descriptionKey('a-rel', IN_WINDOW.toISOString())
    await idbPut('descriptions', '<p>kept</p>', kept)
    await idbPut('descriptions', '<p>gone</p>', 'orphan-key')

    await eviction.run(SESSION_ID)

    expect(await idbGetAllKeys('descriptions')).toEqual([kept])
  })

  it('skips both sweeps within a day of the last', async () => {
    const { eviction } = harness()
    persist('lastEvictedAt', new Date())
    await idbPut('repos', withAgedRelease(repoFixture('a')), 'a')
    await idbPut('descriptions', '<p>gone</p>', 'orphan-key')

    await eviction.run(SESSION_ID)

    const stored = await idbGet('repos', 'a')
    expect(stored?.releases.nodes).toHaveLength(2)
    expect(await idbGetAllKeys('descriptions')).toEqual(['orphan-key'])
  })

  it('clears the repos store on every run with the cache disabled', async () => {
    const { eviction } = harness()
    settings.disableCache = true
    persist('lastEvictedAt', new Date())
    await idbPut('repos', repoFixture('a'), 'a')

    await eviction.run(SESSION_ID)

    expect(await idbGetAllKeys('repos')).toEqual([])
  })

  it('records when it last swept', async () => {
    const { eviction } = harness()

    await eviction.run(SESSION_ID)

    expect(localStorage.getItem('lastEvictedAt')).not.toBeNull()
  })
})
