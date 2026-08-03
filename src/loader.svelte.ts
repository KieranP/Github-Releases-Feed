import { CacheEviction } from './cache_eviction'
import { clearCache } from './db'
import { DescriptionSync } from './description_sync'
import { FeedStore } from './feed.svelte'
import { RepoSync } from './repo_sync'
import { RetryRunner } from './retry'
import { Session } from './session.svelte'
import { forget, persist, settings } from './state.svelte'
import { Status } from './status.svelte'

import type { ReleaseGroup } from './models/release_group.svelte'

// Wires the sync pipeline together and owns the three entry points the UI
// calls. Each collaborator is a flat sibling module; see IMPLEMENTATION.md.
class Loader {
  private readonly session = new Session()
  private readonly status = new Status()
  private readonly feed = new FeedStore()
  private readonly retry: RetryRunner
  private readonly descriptions: DescriptionSync
  private readonly repos: RepoSync
  private readonly eviction: CacheEviction

  public constructor() {
    this.retry = new RetryRunner({
      session: this.session,
      status: this.status,
      onAuthFailure: (): void => {
        this.reset()
      },
    })

    this.descriptions = new DescriptionSync({
      session: this.session,
      feed: this.feed,
      retry: this.retry,
    })

    this.repos = new RepoSync({
      session: this.session,
      status: this.status,
      feed: this.feed,
      descriptions: this.descriptions,
      retry: this.retry,
      onComplete: async (sessionId: number): Promise<void> => {
        await this.completeLoad(sessionId)
      },
    })

    this.eviction = new CacheEviction({
      session: this.session,
      feed: this.feed,
    })
  }

  public get loading(): boolean {
    return this.status.loading
  }

  public get progress(): number {
    return this.status.progress
  }

  public get groups(): ReleaseGroup[] {
    return this.feed.groups
  }

  public get toast(): string {
    return this.status.toast
  }

  // Login clears a leftover error before starting the next load.
  public set toast(value: string) {
    this.status.toast = value
  }

  // No-op if no GitHub token is configured.
  public start(): void {
    if (!this.session.octokit) return

    const sessionId = this.session.begin()
    this.clearState()
    this.status.loading = true

    void this.repos.run(sessionId)
  }

  // Called on explicit logout and on auth errors that invalidate the session.
  public reset(): void {
    forget('githubToken')
    settings.githubToken = null

    forget('lastAccessedAt')
    settings.lastAccessedAt = new Date(0)

    forget('lastEvictedAt')

    // Bump first to reject in-flight work; read the chain before clearState().
    const sessionId = this.session.begin()
    void this.wipeCache(sessionId, this.repos.pendingRefresh)

    this.status.loading = false
    this.status.toast = ''

    this.clearState()
  }

  // Cancels the running load first, else its in-flight writes repopulate the
  // stores as fast as they're cleared.
  public async clearCachedData(): Promise<void> {
    const { pendingRefresh } = this.repos

    const sessionId = this.session.begin()

    this.clearState()

    // Hold the spinner: the drain and reload take seconds with a blank feed.
    this.status.loading = this.session.octokit !== undefined

    await this.wipeCache(sessionId, pendingRefresh)

    // A second click, or a logout, superseded this wipe.
    if (this.session.isSuperseded(sessionId)) return

    this.start()
  }

  // Shared by start/reset/clearCachedData, so a second load can't double-merge.
  private clearState(): void {
    this.status.clear()
    this.feed.clear()
    this.repos.clear()
  }

  // Twice: the in-flight batch's already-queued puts outlive the first wipe.
  private async wipeCache(
    sessionId: number,
    pendingRefresh: Promise<boolean>,
  ): Promise<void> {
    await clearCache()
    await pendingRefresh
    // Skip the second pass if a new session has since repopulated IDB.
    if (this.session.isSuperseded(sessionId)) return
    await clearCache()
  }

  // Only a load that finished in full may move the caught-up divider.
  private async completeLoad(sessionId: number): Promise<void> {
    // Persist only: in-memory stays put so the marker can't jump mid-session.
    persist('lastAccessedAt', new Date())

    this.status.logTimings()

    await this.eviction.run(sessionId)
  }
}

const loader: Loader = new Loader()
export { loader }
