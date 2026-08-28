import { afterEach, describe, expect, it } from 'vitest'

import { applySnapLock, fetchAsDate } from '../src/state.svelte'

const KEY = 'lastAccessedAt'

afterEach((): void => {
  localStorage.removeItem(KEY)
})

describe('fetchAsDate', () => {
  it('returns null when the key is absent', () => {
    expect(fetchAsDate(KEY)).toBeNull()
  })

  it('parses a stored ISO timestamp', () => {
    const stored = new Date('2026-08-14T09:30:00.000Z')
    localStorage.setItem(KEY, stored.toISOString())

    expect(fetchAsDate(KEY)?.getTime()).toBe(stored.getTime())
  })

  // An Invalid Date compares false against everything, which reads as "every
  // release is unseen" rather than as the corrupt value it is.
  it.each(['', 'not-a-date', '{}', 'NaN'])(
    'returns null for the corrupt value %j',
    (value) => {
      localStorage.setItem(KEY, value)

      expect(fetchAsDate(KEY)).toBeNull()
    },
  )
})

describe('applySnapLock', () => {
  // An empty value drops back to global.css; a literal would defeat it.
  it('clears the inline override when snapping is on', () => {
    applySnapLock(true)
    applySnapLock(false)

    expect(document.documentElement.style.scrollSnapType).toBe('')
  })

  it('writes an inline none when snapping is off', () => {
    applySnapLock(true)

    expect(document.documentElement.style.scrollSnapType).toBe('none')
  })
})
