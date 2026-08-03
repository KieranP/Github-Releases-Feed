import { clearRepos, idbDelete, idbGetAll, idbGetAllKeys, idbPut } from './db'
import { isReleaseInWindow } from './release_window'
import { fetchAsDate, persist, settings } from './state.svelte'

import type { FeedStore } from './feed.svelte'
import type { GithubRepository } from './github'
import type { Session } from './session.svelte'

const EVICTION_INTERVAL_MS = 24 * 60 * 60 * 1000

interface CacheEvictionDeps {
  session: Session
  feed: FeedStore
}

// GC for both IDB stores, run after a completed load. Each sweep below walks
// an entire store, so they sit behind a once-a-day gate.
export class CacheEviction {
  private readonly session: Session
  private readonly feed: FeedStore

  public constructor(deps: CacheEvictionDeps) {
    this.session = deps.session
    this.feed = deps.feed
  }

  public async run(sessionId: number): Promise<void> {
    const { disableCache } = settings

    // Ungated: the snapshot this load ignored must not outlive it.
    if (disableCache) {
      await clearRepos()

      // Re-check after each await: a logout mustn't write past its own wipe.
      if (this.session.isStale(sessionId)) return
    }

    // Both sweeps below walk an entire store — once a day is plenty.
    const lastEvictedAt = fetchAsDate('lastEvictedAt')
    if (lastEvictedAt !== null) {
      const elapsed = Date.now() - lastEvictedAt.getTime()
      if (elapsed < EVICTION_INTERVAL_MS) return
    }

    // Skipped when the cache is disabled: the store was just cleared.
    if (!disableCache) {
      await this.evictStaleRepos(sessionId)
      if (this.session.isStale(sessionId)) return
    }

    await this.evictStaleDescriptions(sessionId)

    if (this.session.isStale(sessionId)) return

    persist('lastEvictedAt', new Date())
  }

  // Never deletes rows — RepoSync.deleteUnstarredRepos owns that.
  private async evictStaleRepos(sessionId: number): Promise<void> {
    const allRepos = await idbGetAll('repos')

    // Bail before queueing writes; they'd land after reset()'s clear.
    if (this.session.isStale(sessionId)) return

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
  private async evictStaleDescriptions(sessionId: number): Promise<void> {
    // The feed is the survivor set — this runs only after a full load.
    const survivorKeys = this.feed.descriptionKeys()

    const cachedKeys = await idbGetAllKeys('descriptions')

    // Bail before queueing deletes so they don't outlive a reset().
    if (this.session.isStale(sessionId)) return

    await Promise.all(
      cachedKeys.map(async (key): Promise<void> => {
        if (!survivorKeys.has(key)) {
          await idbDelete('descriptions', key)
        }
      }),
    )
  }
}
