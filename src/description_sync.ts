import { descriptionKey, idbGet, idbPut } from './db'
import {
  descriptionQuery,
  type GithubReleaseResponse,
  graphqlAllowingPartials,
} from './github'
import { chunk } from './helpers'
import { DESCRIPTION_RETRY_POLICY, type RetryRunner } from './retry'

import type { FeedStore } from './feed.svelte'
import type { Release } from './models/release.svelte'
import type { Session } from './session.svelte'

const DESCRIPTION_BATCH_SIZE = 20

interface DescriptionSyncDeps {
  session: Session
  feed: FeedStore
  retry: RetryRunner
}

// Release notes: IDB first, then one GraphQL round trip per 20 misses. Reached
// by the prefetch and by the viewport. A failure leaves a card blank, never
// aborts the load.
export class DescriptionSync {
  private readonly session: Session
  private readonly feed: FeedStore
  private readonly retry: RetryRunner

  private queued: Release[] = []
  private flushQueued = false

  public constructor(deps: DescriptionSyncDeps) {
    this.session = deps.session
    this.feed = deps.feed
    this.retry = deps.retry
  }

  // Fire-and-forget: nothing must escape as an unhandled rejection.
  public async load(sessionId: number, releases: Release[]): Promise<void> {
    try {
      await this.fetchAll(sessionId, releases)
    } catch (error) {
      console.error('Failed to fetch release descriptions', error)
    }
  }

  // One card at a time; a request each would trip the rate limit.
  public enqueue(sessionId: number, release: Release): void {
    this.queued.push(release)
    if (this.flushQueued) return

    this.flushQueued = true
    void this.flush(sessionId)
  }

  // The burst has finished by the time this resumes.
  private async flush(sessionId: number): Promise<void> {
    await Promise.resolve()

    const releases = this.queued
    this.queued = []
    this.flushQueued = false

    await this.load(sessionId, releases)
  }

  // Attach cached entries from IDB, then batch-fetch the rest.
  private async fetchAll(
    sessionId: number,
    releases: Release[],
  ): Promise<void> {
    if (this.session.isStale(sessionId)) return

    // Claim before the first await, so an overlapping call can't take them too.
    const pending = releases.filter(
      (release): boolean => !release.descriptionRequested,
    )
    if (pending.length === 0) return

    for (const release of pending) release.descriptionRequested = true

    const uncachedReleaseIds: string[] = []

    // A miss and a failed read are the same thing here: refetch it.
    await Promise.all(
      pending.map(async (release): Promise<void> => {
        const description = await idbGet(
          'descriptions',
          descriptionKey(release.data.id, release.data.updatedAt),
        )

        if (description === undefined) {
          uncachedReleaseIds.push(release.data.id)
        } else {
          this.feed.attachDescription(release.data.id, description)
        }
      }),
    )

    if (uncachedReleaseIds.length === 0) return

    const batches = chunk(uncachedReleaseIds, DESCRIPTION_BATCH_SIZE)

    await Promise.all(
      batches.map(async (releaseIds): Promise<void> => {
        await this.fetchBatch(sessionId, releaseIds)
      }),
    )
  }

  // Retries rather than leaving the cards permanently blank.
  private async fetchBatch(
    sessionId: number,
    releaseIds: string[],
  ): Promise<void> {
    await this.retry.run(
      sessionId,
      DESCRIPTION_RETRY_POLICY,
      async (): Promise<boolean | undefined> => {
        const { octokit } = this.session
        if (!octokit || this.session.isStale(sessionId)) return true

        const response = await graphqlAllowingPartials<GithubReleaseResponse>(
          octokit,
          descriptionQuery,
          { releaseIds },
        )

        if (this.session.isStale(sessionId)) return true

        // Missing response — retry.
        if (!response) return undefined

        for (const releaseNode of response.nodes) {
          if (!releaseNode) continue

          const release = this.feed.find(releaseNode.id)
          if (!release) continue

          // Key on the release's own updatedAt; reads and eviction use that.
          void idbPut(
            'descriptions',
            releaseNode.descriptionHTML,
            descriptionKey(release.data.id, release.data.updatedAt),
          )

          this.feed.attachDescription(
            releaseNode.id,
            releaseNode.descriptionHTML,
          )
        }

        return true
      },
    )
  }
}
