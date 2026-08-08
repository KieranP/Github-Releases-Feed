import { delay, formatRelativeTime } from './helpers'

import type { Session } from './session.svelte'
import type { Status } from './status.svelte'

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

// A longer wait than this reads as a hang; give up and name the time instead.
const MAX_RATE_LIMIT_WAIT_MS = 60 * 1000

// How a failing request narrates itself, and whether giving up ends the load.
export interface RetryPolicy {
  key: string
  retrying: string
  exhausted: string
  fatal: boolean
}

// Manifest pages: nothing can be enumerated without them.
export const MANIFEST_RETRY_POLICY: RetryPolicy = {
  key: 'manifest',
  retrying: 'Request Failed',
  exhausted: 'Repeated Request Failures - Aborting',
  fatal: true,
}

// Its own key: it runs alongside the manifest pass, and a landing page must
// not retract a batch's warning.
export const REFRESH_RETRY_POLICY: RetryPolicy = {
  key: 'refresh',
  retrying: 'Repo Refresh Failed',
  exhausted: 'Repeated Refresh Failures - Aborting',
  fatal: true,
}

// Release notes are supplementary — report it, but leave the spinner alone.
export const DESCRIPTION_RETRY_POLICY: RetryPolicy = {
  key: 'descriptions',
  retrying: 'Release Notes Failed',
  exhausted: 'Failed to load some release notes',
  fatal: false,
}

// Retrying instantly is what trips the secondary rate limit to begin with.
function backoffMs(retries: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** (retries - 1)
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

// Under `response` for a request error, on the error itself for a GraphQL one.
function errorHeaders(error: unknown): Record<string, string> | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const { response } = error as { response?: { headers?: unknown } }
  const headers = response?.headers ?? (error as { headers?: unknown }).headers

  if (typeof headers !== 'object' || headers === null) return undefined
  return headers as Record<string, string>
}

// Seconds in a header, as a positive number of milliseconds.
function headerSeconds(value: string | undefined): number | undefined {
  if (value === undefined) return undefined

  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined

  return seconds * 1000
}

// GitHub's own backoff: retry-after, or x-ratelimit-reset once points run out.
function rateLimitWaitMs(error: unknown, now: number): number | undefined {
  const headers = errorHeaders(error)
  if (!headers) return undefined

  const retryAfter = headerSeconds(headers['retry-after'])
  if (retryAfter !== undefined) return retryAfter

  if (headers['x-ratelimit-remaining'] !== '0') return undefined

  const resetAt = headerSeconds(headers['x-ratelimit-reset'])
  if (resetAt === undefined) return undefined

  const waitMs = resetAt - now
  return waitMs > 0 ? waitMs : undefined
}

// A rate-limited wait is worth naming: the user sees a countdown, not a stall.
function pendingToast(
  policy: RetryPolicy,
  retries: number,
  waitMs: number | undefined,
): string {
  if (waitMs === undefined) {
    return `ERROR: ${policy.retrying} - Retry #${retries}`
  }

  return `ERROR: Rate limited - retrying in ${Math.ceil(waitMs / 1000)}s`
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
      // Set only when GitHub asked for a specific wait.
      let waitMs: number | undefined = undefined

      try {
        const value = await attempt()
        if (value !== undefined) return value
      } catch (error: unknown) {
        // Bail before logging: a superseded session aborts its own requests.
        if (this.session.isStale(sessionId)) return undefined

        console.error(error)
        if (this.handleAuthError(sessionId, error)) return undefined
        waitMs = rateLimitWaitMs(error, Date.now())
      }

      // A superseded session must not touch the live one's toast or spinner.
      if (this.session.isStale(sessionId)) return undefined

      if (waitMs !== undefined && waitMs > MAX_RATE_LIMIT_WAIT_MS) {
        const lifts = formatRelativeTime(
          new Date(Date.now() + waitMs),
          new Date(),
        )
        this.giveUp(policy, `Rate limited - try again ${lifts}`)
        return undefined
      }

      if (retries >= MAX_RETRIES) {
        this.giveUp(policy, policy.exhausted)
        return undefined
      }

      const nextRetries = retries + 1
      this.status.notify(policy.key, pendingToast(policy, nextRetries, waitMs))
      await delay(waitMs ?? backoffMs(nextRetries))
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
      this.status.notify('auth', 'ERROR: API Token Invalid/Expired')
    }

    return true
  }

  private giveUp(policy: RetryPolicy, message: string): void {
    this.status.notify(policy.key, `ERROR: ${message}`)
    if (policy.fatal) this.status.loading = false
  }
}
