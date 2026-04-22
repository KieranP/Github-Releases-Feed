import { describe, expect, it } from 'vitest'

import { formatRelativeTime, mergeSorted } from './helpers'

interface Item {
  key: number
  source: string
}

function numAsc(a: number, b: number): number {
  return a - b
}

function numDesc(a: number, b: number): number {
  return b - a
}

function cmpByKey(a: Item, b: Item): number {
  return a.key - b.key
}

describe('mergeSorted', () => {
  it.each([
    { label: 'both empty', existing: [], newItems: [], expected: [] },
    {
      label: 'empty existing',
      existing: [],
      newItems: [3, 1, 2],
      expected: [1, 2, 3],
    },
    {
      label: 'empty newItems',
      existing: [1, 2, 3],
      newItems: [],
      expected: [1, 2, 3],
    },
    {
      label: 'insert before all',
      existing: [2, 3, 4],
      newItems: [1],
      expected: [1, 2, 3, 4],
    },
    {
      label: 'insert in the middle',
      existing: [1, 3, 5],
      newItems: [4],
      expected: [1, 3, 4, 5],
    },
    {
      label: 'insert after all',
      existing: [1, 2, 3],
      newItems: [4],
      expected: [1, 2, 3, 4],
    },
    {
      label: 'insert into single-element existing',
      existing: [5],
      newItems: [3],
      expected: [3, 5],
    },
    {
      label: 'multiple items spanning full range',
      existing: [2, 6, 10],
      newItems: [1, 4, 8, 12],
      expected: [1, 2, 4, 6, 8, 10, 12],
    },
    {
      label: 'all newItems before existing',
      existing: [10, 20, 30],
      newItems: [1, 2, 3],
      expected: [1, 2, 3, 10, 20, 30],
    },
    {
      label: 'all newItems after existing',
      existing: [1, 2, 3],
      newItems: [10, 20, 30],
      expected: [1, 2, 3, 10, 20, 30],
    },
    {
      label: 'unsorted newItems',
      existing: [1, 5, 9],
      newItems: [7, 3],
      expected: [1, 3, 5, 7, 9],
    },
    {
      label: 'consecutive newItems at the same position',
      existing: [1, 10],
      newItems: [4, 5, 6],
      expected: [1, 4, 5, 6, 10],
    },
    {
      label: 'duplicates across arrays',
      existing: [1, 3, 5],
      newItems: [3, 5],
      expected: [1, 3, 3, 5, 5],
    },
    {
      label: 'identical newItems',
      existing: [1, 3, 5],
      newItems: [3, 3, 3],
      expected: [1, 3, 3, 3, 3, 5],
    },
  ])('$label', ({ existing, newItems, expected }) => {
    expect(mergeSorted(existing, newItems, numAsc)).toEqual(expected)
  })

  it('returns the same reference when newItems is empty', () => {
    const existing = [1, 2, 3]
    expect(mergeSorted(existing, [], numAsc)).toBe(existing)
  })

  it('does not mutate the existing array', () => {
    const existing: readonly number[] = Object.freeze([1, 3, 5])
    mergeSorted(existing, [2, 4], numAsc)
    expect(existing).toEqual([1, 3, 5])
  })

  it('works with a descending comparator', () => {
    expect(mergeSorted([9, 5, 1], [7, 3], numDesc)).toEqual([9, 7, 5, 3, 1])
  })

  it('preserves existing-before-new order for equal keys', () => {
    const result = mergeSorted(
      [
        { key: 1, source: 'old' },
        { key: 2, source: 'old' },
      ],
      [
        { key: 2, source: 'new-a' },
        { key: 2, source: 'new-b' },
      ],
      cmpByKey,
    )

    expect(result.filter((i) => i.key === 2).map((i) => i.source)).toEqual([
      'old',
      'new-a',
      'new-b',
    ])
  })

  it('handles a large existing array', () => {
    const existing = Array.from({ length: 1000 }, (_, i) => i * 2)
    const newItems = [-1, 1, 501, 999, 1999]
    const expected = [...existing, ...newItems].toSorted(numAsc)
    expect(mergeSorted(existing, newItems, numAsc)).toEqual(expected)
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2025-01-15T12:00:00Z')

  function ago(ms: number): Date {
    return new Date(now.getTime() - ms)
  }

  function fromNow(ms: number): Date {
    return new Date(now.getTime() + ms)
  }

  const SECOND = 1000
  const MINUTE = 60 * SECOND
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR
  const WEEK = 7 * DAY
  const MONTH = 30 * DAY
  const YEAR = 365 * DAY

  it.each([
    { label: 'identical dates', date: now, expected: 'in 0 seconds' },
    { label: '30s ago', date: ago(30 * SECOND), expected: '30 seconds ago' },
    { label: 'in 30s', date: fromNow(30 * SECOND), expected: 'in 30 seconds' },
    { label: '1 minute ago', date: ago(MINUTE), expected: '1 minute ago' },
    {
      label: '5 minutes ago',
      date: ago(5 * MINUTE),
      expected: '5 minutes ago',
    },
    {
      label: 'in 5 minutes',
      date: fromNow(5 * MINUTE),
      expected: 'in 5 minutes',
    },
    { label: '1 hour ago', date: ago(HOUR), expected: '1 hour ago' },
    { label: '3 hours ago', date: ago(3 * HOUR), expected: '3 hours ago' },
    { label: 'in 3 hours', date: fromNow(3 * HOUR), expected: 'in 3 hours' },
    { label: '1 day ago', date: ago(DAY), expected: '1 day ago' },
    { label: '2 days ago', date: ago(2 * DAY), expected: '2 days ago' },
    { label: 'in 2 days', date: fromNow(2 * DAY), expected: 'in 2 days' },
    {
      label: '1d23h rounds to 2 days',
      date: ago(DAY + 23 * HOUR),
      expected: '2 days ago',
    },
    { label: '2 weeks ago', date: ago(2 * WEEK), expected: '2 weeks ago' },
    { label: '3 months ago', date: ago(3 * MONTH), expected: '3 months ago' },
    { label: '2 years ago', date: ago(2 * YEAR), expected: '2 years ago' },
  ])('$label → $expected', ({ date, expected }) => {
    expect(formatRelativeTime(date, now)).toBe(expected)
  })
})
