import { describe, expect, it } from 'vitest'

import { FeedStore } from '../src/feed.svelte'
import { Session } from '../src/session.svelte'
import { Status } from '../src/status.svelte'

import type { GithubRepository } from '../src/github'

function repoFixture(id: string, publishedAt: Date): GithubRepository {
  return {
    id,
    description: 'desc',
    languages: { nodes: [] },
    name: id,
    owner: { avatarUrl: '', login: 'owner', url: '' },
    releases: {
      nodes: [
        {
          id: `${id}-rel`,
          isPrerelease: false,
          name: 'v1',
          publishedAt: publishedAt.toISOString(),
          tagName: 'v1',
          updatedAt: publishedAt.toISOString(),
          url: '',
        },
      ],
    },
    stargazerCount: 1,
    updatedAt: publishedAt.toISOString(),
    url: '',
  }
}

// Proves tests/setup.ts gave db.ts a working IndexedDB rather than just
// silencing its open failure — the cache paths are unreachable without it.
describe('db wrappers', () => {
  it('round-trips through the descriptions store', async () => {
    const { idbGet, idbPut } = await import('../src/db')

    await idbPut('descriptions', '<p>notes</p>', 'k')
    expect(await idbGet('descriptions', 'k')).toBe('<p>notes</p>')
  })
})

describe('Status', () => {
  it('reads progress before any state is touched', () => {
    expect(new Status().progress).toBe(0)
  })

  it('derives progress from the counters', () => {
    const status = new Status()
    status.countRepos(10)
    status.advance(5)
    expect(status.progress).toBe(0.5)
  })

  it('ignores repeated totals and clamps overshoot', () => {
    const status = new Status()
    status.countRepos(10)
    status.countRepos(999)
    status.advance(50)
    expect(status.progress).toBe(1)
  })

  it('clears the counters', () => {
    const status = new Status()
    status.countRepos(10)
    status.advance(5)
    status.clear()
    expect(status.progress).toBe(0)
  })
})

describe('Session', () => {
  it('bumps the id and supersedes earlier ones', () => {
    const session = new Session()
    const first = session.begin()
    expect(session.isSuperseded(first)).toBe(false)

    const second = session.begin()
    expect(session.isSuperseded(first)).toBe(true)
    expect(session.isSuperseded(second)).toBe(false)
  })

  // Relies on no test in this file configuring settings.githubToken, which is a
  // module singleton every Session reads through.
  it('treats a missing token as stale even for the current id', () => {
    const session = new Session()
    const id = session.begin()
    expect(session.isStale(id)).toBe(true)
    expect(session.isSuperseded(id)).toBe(false)
  })
})

describe('FeedStore', () => {
  const inWindow = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const outOfWindow = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  it('reads groups before anything is merged', () => {
    expect(new FeedStore().groups).toEqual([])
  })

  it('merges, indexes, and groups in-window releases', () => {
    const feed = new FeedStore()
    const merged = feed.merge([repoFixture('a', inWindow)])

    expect(merged).toHaveLength(1)
    expect(feed.find('a-rel')).toBe(merged[0])
    expect(feed.groups.some((g) => g.repo === 'owner/a')).toBe(true)
  })

  it('drops out-of-window releases', () => {
    const feed = new FeedStore()
    expect(feed.merge([repoFixture('a', outOfWindow)])).toHaveLength(0)
    expect(feed.find('a-rel')).toBeUndefined()
  })

  it('drops a repo release set before a re-merge', () => {
    const feed = new FeedStore()
    feed.merge([repoFixture('a', inWindow), repoFixture('b', inWindow)])

    feed.dropForRepos(new Set(['a']))

    expect(feed.find('a-rel')).toBeUndefined()
    expect(feed.find('b-rel')).toBeDefined()
    expect(feed.groups.some((g) => g.repo === 'owner/a')).toBe(false)
  })

  it('attaches a description to the indexed release', () => {
    const feed = new FeedStore()
    feed.merge([repoFixture('a', inWindow)])

    feed.attachDescription('a-rel', '<p>notes</p>')
    expect(feed.find('a-rel')?.data.descriptionHTML).toBe('<p>notes</p>')

    // Must not throw for a release a refresh already dropped.
    expect(() => {
      feed.attachDescription('gone', '<p>x</p>')
    }).not.toThrow()
  })

  it('reports survivor description keys from the feed', () => {
    const feed = new FeedStore()
    feed.merge([repoFixture('a', inWindow)])

    expect(feed.descriptionKeys()).toEqual(
      new Set([`a-rel-${inWindow.toISOString()}`]),
    )
  })

  it('clears everything', () => {
    const feed = new FeedStore()
    feed.merge([repoFixture('a', inWindow)])
    feed.clear()

    expect(feed.groups).toEqual([])
    expect(feed.find('a-rel')).toBeUndefined()
    expect(feed.descriptionKeys()).toEqual(new Set())
  })
})

describe('loader wiring', () => {
  it('constructs the pipeline and exposes the UI surface', async () => {
    const { loader } = await import('../src/loader.svelte')

    expect(loader.loading).toBe(false)
    expect(loader.progress).toBe(0)
    expect(loader.groups).toEqual([])
    expect(loader.toast).toBe('')

    loader.toast = 'hello'
    expect(loader.toast).toBe('hello')
    loader.toast = ''

    // No token configured, so this must be a no-op rather than a throw.
    loader.start()
    expect(loader.loading).toBe(false)
  })
})
