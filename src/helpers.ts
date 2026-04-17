export const intersectionObserver: IntersectionObserver =
  new IntersectionObserver((entries): void => {
    entries.forEach((entry): void => {
      entry.target.dispatchEvent(
        new CustomEvent('intersect', { detail: entry }),
      )
    })
  })

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

export function sortSplice<T>(
  existing: T[],
  newItems: T[],
  sortFn: (a: T, b: T) => number,
): T[] {
  newItems.sort(sortFn)

  let searchIndex = 0
  for (const item of newItems) {
    let inserted = false
    for (let i = searchIndex; i < existing.length; i += 1) {
      const current = existing[i]
      if (current !== undefined && sortFn(item, current) <= 0) {
        existing.splice(i, 0, item)
        searchIndex = i + 1
        inserted = true
        break
      }
    }
    if (!inserted) {
      existing.push(item)
      searchIndex = existing.length
    }
  }

  return existing
}
