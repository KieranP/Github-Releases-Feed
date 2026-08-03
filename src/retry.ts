import { delay } from './helpers'

import type { Session } from './session.svelte'
import type { Status } from './status.svelte'

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

// How a failing request narrates itself, and whether giving up ends the load.
export interface RetryPolicy {
  retrying: string
  exhausted: string
  fatal: boolean
}

// Manifest pages and repo refreshes: the load can't complete without them.
export const REQUEST_RETRY_POLICY: RetryPolicy = {
  retrying: 'Request Failed',
  exhausted: 'Repeated Request Failures - Aborting',
  fatal: true,
}

// Release notes are supplementary — report it, but leave the spinner alone.
export const DESCRIPTION_RETRY_POLICY: RetryPolicy = {
  retrying: 'Release Notes Failed',
  exhausted: 'Failed to load some release notes',
  fatal: false,
}

// Retrying instantly is what trips the secondary rate limit to begin with.
async function retryDelay(retries: number): Promise<void> {
  await delay(RETRY_BASE_DELAY_MS * 2 ** (retries - 1))
}

// The token is gone or expired; no number of retries will fix it.
function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 401
  )
}

interface RetryRunnerDeps {
  session: Session
  status: Status
  // A 401 invalidates the stored token, so the whole session has to go.
  onAuthFailure: () => void
}

// The single retry/backoff path. Owns the toast and spinner side effects of
// failing, so callers only decide whether an attempt wants another go.
export class RetryRunner {
  private readonly session: Session
  private readonly status: Status
  private readonly onAuthFailure: () => void

  public constructor(deps: RetryRunnerDeps) {
    this.session = deps.session
    this.status = deps.status
    this.onAuthFailure = deps.onAuthFailure
  }

  // Retry `attempt` until it returns a value, MAX_RETRIES are spent, or the
  // session goes stale. It asks for another go with undefined, as does a throw.
  public async run<T>(
    sessionId: number,
    policy: RetryPolicy,
    attempt: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    // Sequential by definition — backing off is the point.
    /* eslint-disable no-await-in-loop */
    for (let retries = 0; ; retries += 1) {
      try {
        const value = await attempt()
        if (value !== undefined) return value
      } catch (error: unknown) {
        console.error(error)
        if (this.handleAuthError(sessionId, error)) return undefined
      }

      // A superseded session must not touch the live one's toast or spinner.
      if (this.session.isStale(sessionId)) return undefined

      if (retries >= MAX_RETRIES) {
        this.status.toast = `ERROR: ${policy.exhausted}`
        if (policy.fatal) this.status.loading = false
        return undefined
      }

      const nextRetries = retries + 1
      this.status.toast = `ERROR: ${policy.retrying} - Retry #${nextRetries}`
      await retryDelay(nextRetries)
      if (this.session.isStale(sessionId)) return undefined
    }
    /* eslint-enable no-await-in-loop */
  }

  // True when the error was a 401 and the session has been torn down.
  private handleAuthError(sessionId: number, error: unknown): boolean {
    if (!isUnauthorized(error)) return false

    // A stale 401 must not tear down the session that replaced it.
    if (!this.session.isStale(sessionId)) {
      this.onAuthFailure()
      this.status.toast = 'ERROR: API Token Invalid/Expired'
    }

    return true
  }
}
