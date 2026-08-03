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

// Release notes for a batch of freshly merged releases: IDB first, then one
// GraphQL round trip per 20 misses. Failures leave a card blank, never abort
// the load.
export class DescriptionSync {
  private readonly session: Session
  private readonly feed: FeedStore
  private readonly retry: RetryRunner

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

  // Attach cached entries from IDB, then batch-fetch the rest.
  private async fetchAll(
    sessionId: number,
    releases: Release[],
  ): Promise<void> {
    if (this.session.isStale(sessionId) || releases.length === 0) return

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
