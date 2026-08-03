const now = new Date()
const startingDate = new Date(now)
startingDate.setMonth(now.getMonth() - 1)

// The visible feed window is one month. Fixed at module load, so the repo
// refresh, the feed merge, and the eviction sweep all trim to the same edge.
export function isReleaseInWindow(release: { publishedAt: string }): boolean {
  return new Date(release.publishedAt) >= startingDate
}
