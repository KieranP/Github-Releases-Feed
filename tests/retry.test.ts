import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DESCRIPTION_RETRY_POLICY,
  REQUEST_RETRY_POLICY,
  RetryRunner,
} from '../src/retry'
import { Session } from '../src/session.svelte'
import { Status } from '../src/status.svelte'

const SESSION_ID = 1

interface Harness {
  runner: RetryRunner
  status: Status
  onAuthFailure: () => void
}

function noop(): void {
  // Every failure path here logs; the expected noise stays out of the run.
}

// No test sets the module-singleton token, so isStale would always be true.
function harness(): Harness {
  const session = new Session()
  vi.spyOn(session, 'isStale').mockReturnValue(false)

  const status = new Status()
  status.loading = true

  const onAuthFailure = vi.fn<() => void>()

  return {
    runner: new RetryRunner({ session, status, onAuthFailure }),
    status,
    onAuthFailure,
  }
}

function attemptStub(): ReturnType<typeof vi.fn<() => Promise<string>>> {
  return vi.fn<() => Promise<string>>()
}

// Entries, not a literal: the naming rule bars kebab-case property names.
type Header = [name: string, value: string]

// The two shapes octokit throws headers in.
function requestError(...headers: Header[]): unknown {
  return { response: { headers: Object.fromEntries(headers) } }
}

function graphqlError(...headers: Header[]): unknown {
  return { headers: Object.fromEntries(headers) }
}

function epochSeconds(iso: string): string {
  return String(Math.floor(Date.parse(iso) / 1000))
}

describe('RetryRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.spyOn(console, 'error').mockImplementation(noop)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the first value without raising a toast', async () => {
    const { runner, status } = harness()
    const attempt = attemptStub()
    attempt.mockResolvedValue('ok')

    await expect(
      runner.run(SESSION_ID, REQUEST_RETRY_POLICY, attempt),
    ).resolves.toBe('ok')
    expect(status.toasts).toEqual([])
  })

  it('keeps a failing policy to a single toast', async () => {
    const { runner, status } = harness()
    const attempt = attemptStub()
    attempt.mockRejectedValue(new Error('boom'))

    const running = runner.run(SESSION_ID, DESCRIPTION_RETRY_POLICY, attempt)
    await vi.runAllTimersAsync()

    await expect(running).resolves.toBeUndefined()
    // The initial go, plus MAX_RETRIES.
    expect(attempt).toHaveBeenCalledTimes(4)
    expect(status.toasts).toEqual([
      {
        key: 'descriptions',
        message: `ERROR: ${DESCRIPTION_RETRY_POLICY.exhausted}`,
      },
    ])
  })

  it('leaves the spinner up for a non-fatal policy', async () => {
    const { runner, status } = harness()
    const attempt = attemptStub()
    attempt.mockRejectedValue(new Error('boom'))

    const running = runner.run(SESSION_ID, DESCRIPTION_RETRY_POLICY, attempt)
    await vi.runAllTimersAsync()
    await running

    expect(status.loading).toBe(true)
  })

  it('stops the spinner for a fatal one', async () => {
    const { runner, status } = harness()
    const attempt = attemptStub()
    attempt.mockRejectedValue(new Error('boom'))

    const running = runner.run(SESSION_ID, REQUEST_RETRY_POLICY, attempt)
    await vi.runAllTimersAsync()
    await running

    expect(status.loading).toBe(false)
  })

  it('waits out retry-after instead of the exponential ladder', async () => {
    const { runner, status } = harness()
    const attempt = attemptStub()
    attempt.mockRejectedValueOnce(requestError(['retry-after', '2']))
    attempt.mockResolvedValue('ok')

    const running = runner.run(SESSION_ID, REQUEST_RETRY_POLICY, attempt)

    await vi.advanceTimersByTimeAsync(500)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(status.toasts).toEqual([
      { key: 'request', message: 'ERROR: Rate limited - retrying in 2s' },
    ])

    await vi.advanceTimersByTimeAsync(1500)
    expect(attempt).toHaveBeenCalledTimes(2)
    await expect(running).resolves.toBe('ok')
  })

  it('waits until x-ratelimit-reset once the points are spent', async () => {
    const { runner, status } = harness()
    const attempt = attemptStub()
    attempt.mockRejectedValueOnce(
      graphqlError(
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-reset', epochSeconds('2026-01-01T00:00:30Z')],
      ),
    )
    attempt.mockResolvedValue('ok')

    const running = runner.run(SESSION_ID, REQUEST_RETRY_POLICY, attempt)

    await vi.advanceTimersByTimeAsync(1000)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(status.toasts).toEqual([
      { key: 'request', message: 'ERROR: Rate limited - retrying in 30s' },
    ])

    await vi.advanceTimersByTimeAsync(29_000)
    await expect(running).resolves.toBe('ok')
  })

  it('ignores a reset stamp while quota remains', async () => {
    const { runner, status } = harness()
    const attempt = attemptStub()
    attempt.mockRejectedValueOnce(
      graphqlError(
        ['x-ratelimit-remaining', '4000'],
        ['x-ratelimit-reset', epochSeconds('2026-01-01T00:00:30Z')],
      ),
    )
    attempt.mockResolvedValue('ok')

    const running = runner.run(SESSION_ID, REQUEST_RETRY_POLICY, attempt)

    await vi.advanceTimersByTimeAsync(500)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(status.toasts).toEqual([
      {
        key: 'request',
        message: `ERROR: ${REQUEST_RETRY_POLICY.retrying} - Retry #1`,
      },
    ])

    await expect(running).resolves.toBe('ok')
  })

  it('gives up rather than wait past the cap', async () => {
    const { runner, status } = harness()
    const attempt = attemptStub()
    attempt.mockRejectedValue(
      graphqlError(
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-reset', epochSeconds('2026-01-01T00:10:00Z')],
      ),
    )

    await expect(
      runner.run(SESSION_ID, REQUEST_RETRY_POLICY, attempt),
    ).resolves.toBeUndefined()

    expect(attempt).toHaveBeenCalledTimes(1)
    expect(status.toasts).toEqual([
      {
        key: 'request',
        message: 'ERROR: Rate limited - try again in 10 minutes',
      },
    ])
    expect(status.loading).toBe(false)
  })

  it('tears the session down on a 401 without retrying', async () => {
    const { runner, status, onAuthFailure } = harness()
    const attempt = attemptStub()
    attempt.mockRejectedValue({ status: 401 })

    await expect(
      runner.run(SESSION_ID, REQUEST_RETRY_POLICY, attempt),
    ).resolves.toBeUndefined()

    expect(attempt).toHaveBeenCalledTimes(1)
    expect(onAuthFailure).toHaveBeenCalledTimes(1)
    expect(status.toasts).toEqual([
      { key: 'auth', message: 'ERROR: API Token Invalid/Expired' },
    ])
  })
})
