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
