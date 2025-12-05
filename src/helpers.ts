export const intersectionObserver: IntersectionObserver =
  new IntersectionObserver((entries): void => {
    entries.forEach((entry): void => {
      entry.target.dispatchEvent(
        new CustomEvent('intersect', { detail: entry }),
      )
    })
  })

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
