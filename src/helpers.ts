export const intersectionObserver: IntersectionObserver =
  new IntersectionObserver((entries): void => {
    entries.forEach((entry): void => {
      entry.target.dispatchEvent(
        new CustomEvent('intersect', { detail: entry }),
      )
    })
  })
