import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearCache, descriptionKey, idbGet, idbPut } from '../src/db'
import { DescriptionSync } from '../src/description_sync'
import { FeedStore } from '../src/feed.svelte'
import { RetryRunner } from '../src/retry'
import { Status } from '../src/status.svelte'
import {
  type GraphqlStub,
  liveSession,
  noop,
  RATE_LIMIT,
  repoFixture,
} from './fixtures'

import type { Release } from '../src/models/release.svelte'

const SESSION_ID = 1

interface Harness {
  sync: DescriptionSync
  feed: FeedStore
  status: Status
  graphql: GraphqlStub
  goStale: () => void
}

function harness(): Harness {
  const { session, graphql, goStale } = liveSession()
  const status = new Status()
  const feed = new FeedStore()
  const retry = new RetryRunner({ session, status, onAuthFailure: noop })

  return {
    sync: new DescriptionSync({ session, feed, retry }),
    feed,
    status,
    graphql,
    goStale,
  }
}

function mergeReleases(feed: FeedStore, ...repoIds: string[]): Release[] {
  return feed.merge(repoIds.map((id) => repoFixture(id)))
}

function respondWithNotes(graphql: GraphqlStub): void {
  graphql.mockImplementation((_query, variables) => {
    const releaseIds = variables['releaseIds'] as string[]
    return {
      nodes: releaseIds.map((id) => ({ id, descriptionHTML: `<p>${id}</p>` })),
      rateLimit: RATE_LIMIT,
    }
  })
}

function keyOf(release: Release): string {
  return descriptionKey(release.data.id, release.data.updatedAt)
}

describe('DescriptionSync', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(noop)
    vi.spyOn(console, 'warn').mockImplementation(noop)
    await clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('attaches fetched notes and caches them', async () => {
    const { sync, feed, graphql } = harness()
    respondWithNotes(graphql)
    const [release] = mergeReleases(feed, 'a')
    if (!release) throw new Error('fixture merged nothing')

    await sync.load(SESSION_ID, [release])

    expect(release.data.descriptionHTML).toBe('<p>a-rel</p>')
    expect(await idbGet('descriptions', keyOf(release))).toBe('<p>a-rel</p>')
  })

  it('serves cached notes without a request', async () => {
    const { sync, feed, graphql } = harness()
    const [release] = mergeReleases(feed, 'a')
    if (!release) throw new Error('fixture merged nothing')
    await idbPut('descriptions', '<p>cached</p>', keyOf(release))

    await sync.load(SESSION_ID, [release])

    expect(release.data.descriptionHTML).toBe('<p>cached</p>')
    expect(graphql).not.toHaveBeenCalled()
  })

  it('blanks a release whose node no longer resolves', async () => {
    const { sync, feed, graphql } = harness()
    graphql.mockResolvedValue({ nodes: [null], rateLimit: RATE_LIMIT })
    const [release] = mergeReleases(feed, 'a')
    if (!release) throw new Error('fixture merged nothing')

    await sync.load(SESSION_ID, [release])

    expect(release.data.descriptionHTML).toBe('')
  })

  it('blanks the batch once its retries are spent', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const { sync, feed, graphql, status } = harness()
    graphql.mockRejectedValue(new Error('boom'))
    const releases = mergeReleases(feed, 'a', 'b')

    const loading = sync.load(SESSION_ID, releases)
    await vi.waitFor(async () => {
      await vi.runAllTimersAsync()
      expect(graphql).toHaveBeenCalledTimes(4)
    })
    await loading

    expect(releases.map((r) => r.data.descriptionHTML)).toEqual(['', ''])
    expect(status.toasts.map((t) => t.key)).toEqual(['descriptions'])
  })

  it('leaves releases alone once the session is superseded', async () => {
    const { sync, feed, graphql, goStale } = harness()
    graphql.mockImplementation(() => {
      goStale()
      throw new Error('aborted')
    })
    const [release] = mergeReleases(feed, 'a')
    if (!release) throw new Error('fixture merged nothing')

    await sync.load(SESSION_ID, [release])

    expect(release.data.descriptionHTML).toBeUndefined()
  })

  it('leaves releases alone when superseded during the cache read', async () => {
    const { sync, feed, goStale } = harness()
    const [release] = mergeReleases(feed, 'a')
    if (!release) throw new Error('fixture merged nothing')
    await idbPut('descriptions', '<p>cached</p>', keyOf(release))

    const loading = sync.load(SESSION_ID, [release])
    goStale()
    await loading

    expect(release.data.descriptionHTML).toBeUndefined()
  })

  it('fetches a release once when the prefetch and the viewport overlap', async () => {
    const { sync, feed, graphql } = harness()
    respondWithNotes(graphql)
    const [release] = mergeReleases(feed, 'a')
    if (!release) throw new Error('fixture merged nothing')

    const prefetch = sync.load(SESSION_ID, [release])
    sync.enqueue(SESSION_ID, release)
    await prefetch

    await vi.waitFor(() => {
      expect(release.data.descriptionHTML).toBe('<p>a-rel</p>')
    })
    expect(graphql).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of viewport requests into one batch', async () => {
    const { sync, feed, graphql } = harness()
    respondWithNotes(graphql)
    const releases = mergeReleases(feed, 'a', 'b', 'c')

    for (const release of releases) sync.enqueue(SESSION_ID, release)

    await vi.waitFor(() => {
      expect(releases.every((r) => r.data.descriptionHTML !== undefined)).toBe(
        true,
      )
    })
    expect(graphql).toHaveBeenCalledTimes(1)
    expect(graphql.mock.calls[0]?.[1]).toEqual({
      releaseIds: ['a-rel', 'b-rel', 'c-rel'],
    })
  })
})
