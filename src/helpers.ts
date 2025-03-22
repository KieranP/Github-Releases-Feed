export const intersectionObserver: IntersectionObserver =
  new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.dispatchEvent(
        new CustomEvent('intersect', { detail: entry }),
      )
    })
  })
