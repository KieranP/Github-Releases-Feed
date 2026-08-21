const WINDOW_DAYS = 4 * 7 // 4 weeks
const startingDate = new Date()
startingDate.setDate(startingDate.getDate() - WINDOW_DAYS)

// Four weeks, fixed at module load so the refresh, the merge, and the eviction
// sweep all trim to the same edge. Narrows: a null date is a draft, never in.
export function isReleaseInWindow<T extends { publishedAt: string | null }>(
  release: T,
): release is T & { publishedAt: string } {
  if (release.publishedAt === null) return false
  return new Date(release.publishedAt) >= startingDate
}
