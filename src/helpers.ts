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

  for (const [unit, ms] of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return relativeTimeFormatter.format(Math.round(diffMs / ms), unit)
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
  if (existing.length === 0) return newItems

  const result = [...existing]
  if (newItems.length === 0) return result

  newItems.sort(sortFn)

  let searchEnd = result.length
  for (let i = newItems.length - 1; i >= 0; i -= 1) {
    const item = newItems[i] as T
    let low = 0
    let high = searchEnd

    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      if (sortFn(result[mid] as T, item) <= 0) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    result.splice(low, 0, item)
    searchEnd = low
  }

  return result
}
