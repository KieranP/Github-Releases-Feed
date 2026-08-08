import { Octokit } from '@octokit/core'

import { settings } from './state.svelte'

// The pipeline's cancellation token. A load captures the id `begin()` handed
// it and re-checks that id after every await: a bare token check can't tell a
// superseded chain from a live one once a new token has been pasted in.
export class Session {
  // Rebuilt on a token or controller change, so requests carry the live signal.
  public readonly octokit: Octokit | undefined = $derived.by(() => {
    if (settings.githubToken === null) return undefined
    return new Octokit({
      auth: settings.githubToken,
      request: { signal: this.controller.signal },
    })
  })

  private id = 0
  private controller: AbortController = $state(new AbortController())

  // A viewport fetch joins the running session, it doesn't start one.
  public get current(): number {
    return this.id
  }

  // Supersedes every in-flight continuation and returns the new id.
  public begin(): number {
    // Else superseded requests still finish, and still cost rate limit.
    this.controller.abort()
    this.controller = new AbortController()

    this.id += 1
    return this.id
  }

  // Every continuation after an await must bail on this.
  public isStale(id: number): boolean {
    return this.isSuperseded(id) || !this.octokit
  }

  // For the teardown paths, which run with the token already cleared and so
  // can't use isStale: a logout must still finish the wipe it started.
  public isSuperseded(id: number): boolean {
    return id !== this.id
  }
}
