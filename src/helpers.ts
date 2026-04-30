export const intersectionObserver: IntersectionObserver =
  new IntersectionObserver(
    (entries): void => {
      entries.forEach((entry): void => {
        entry.target.dispatchEvent(
          new CustomEvent('intersect', { detail: entry }),
        )
      })
    },
    { rootMargin: '50%' },
  )

export const dateTimeFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(
  'en',
  {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZoneName: 'short',
  },
)

const relativeTimeFormatter: Intl.RelativeTimeFormat =
  new Intl.RelativeTimeFormat('en', { numeric: 'always' })

const RELATIVE_TIME_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
]

export function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime()
  const absDiffMs = Math.abs(diffMs)
  const decimalUnits = new Set(['year', 'month', 'week'])

  for (const [unit, ms] of RELATIVE_TIME_UNITS) {
    if (absDiffMs >= ms) {
      const value = diffMs / ms
      const roundedValue = decimalUnits.has(unit)
        ? Math.round(value * 10) / 10 // round to 1 decimal place
        : Math.round(value) // round to whole number
      return relativeTimeFormatter.format(roundedValue, unit)
    }
  }

  return relativeTimeFormatter.format(0, 'second')
}

export const starsFormatter: Intl.NumberFormat = new Intl.NumberFormat('en', {
  compactDisplay: 'short',
  maximumSignificantDigits: 3,
  notation: 'compact',
})

export function mergeSorted<T>(
  existing: readonly T[],
  newItems: T[],
  sortFn: (a: T, b: T) => number,
): T[] {
  newItems.sort(sortFn)

  if (existing.length === 0) return newItems
  if (newItems.length === 0) return existing as T[]

  const result = [...existing]

  let searchStart = 0

  for (const item of newItems) {
    let low = searchStart
    let high = result.length

    while (low < high) {
      // eslint-disable-next-line no-bitwise
      const mid = (low + high) >>> 1
      if (sortFn(result[mid] as T, item) <= 0) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    result.splice(low, 0, item)
    searchStart = low + 1
  }

  return result
}
