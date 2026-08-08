const now = new Date()
const startingDate = new Date(now)
startingDate.setMonth(now.getMonth() - 1)

// One month, fixed at module load so the refresh, the merge, and the eviction
// sweep all trim to the same edge. Narrows: a null date is a draft, never in.
export function isReleaseInWindow<T extends { publishedAt: string | null }>(
  release: T,
): release is T & { publishedAt: string } {
  if (release.publishedAt === null) return false
  return new Date(release.publishedAt) >= startingDate
}
