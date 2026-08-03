import { descriptionKey } from './db'
import { mergeSorted } from './helpers'
import { Release } from './models/release.svelte'
import { ReleaseGroup } from './models/release_group.svelte'
import { isReleaseInWindow } from './release_window'
import { settings } from './state.svelte'

import type { GithubRepository } from './github'

// Not a valid "owner/name", so it can't collide with a real repo group.
const CAUGHT_UP_GROUP_REPO = '__caught_up__'

// Drops releases that fall outside the feed window.
function extractReleases(repo: GithubRepository): Release[] {
  const { releases: releaseData, ...repoData } = repo

  const fullName = `${repoData.owner.login}/${repoData.name}`
  const releaseRepo = { ...repoData, fullName }

  return releaseData.nodes.filter(isReleaseInWindow).map(
    (releaseNode): Release =>
      new Release({
        repo: releaseRepo,
        ...releaseNode,
        publishedAt: new Date(releaseNode.publishedAt),
      }),
  )
}

// Newest first — the feed order mergeSorted maintains.
function releaseSortFn(a: Release, b: Release): number {
  return b.data.publishedAt.getTime() - a.data.publishedAt.getTime()
}

// The sorted release list the UI renders, plus the indexes that keep
// re-merging a refreshed repo cheap.
export class FeedStore {
  public groups: ReleaseGroup[] = $derived.by(() => {
    const groups: ReleaseGroup[] = []
    let currentGroup: ReleaseGroup | null = null
    let caughtUpDividerPlaced = false

    for (const release of this.releases) {
      // Skip hidden releases before grouping so they don't split a repo's run.
      if (!release.isDisplayable) continue

      const repo = release.data.repo.fullName

      // The divider goes above the first displayable previously-seen release.
      const wasPreviouslySeen =
        release.data.publishedAt <= settings.lastAccessedAt
      const isCaughtUpBoundary = !caughtUpDividerPlaced && wasPreviouslySeen

      if (currentGroup && (currentGroup.repo !== repo || isCaughtUpBoundary)) {
        groups.push(currentGroup)
        currentGroup = null
      }

      currentGroup ??= new ReleaseGroup(repo)

      if (isCaughtUpBoundary) {
        currentGroup.showCaughtUp = true
        caughtUpDividerPlaced = true
      }

      currentGroup.releases.push(release)
    }

    if (currentGroup) {
      groups.push(currentGroup)
    }

    // First visit, or every seen release hidden: put the divider at the end.
    if (!caughtUpDividerPlaced && this.releases.length > 0) {
      const caughtUpGroup = new ReleaseGroup(CAUGHT_UP_GROUP_REPO)
      caughtUpGroup.showCaughtUp = true
      groups.push(caughtUpGroup)
    }

    return groups
  })

  private releases = $state<Release[]>([])
  private releasesIndex = new Map<string, Release>()
  // repo id → its release ids, so dropForRepos is O(batch) not O(feed).
  private releasesByRepo = new Map<string, Set<string>>()

  public clear(): void {
    this.releases = []
    this.releasesIndex = new Map()
    this.releasesByRepo = new Map()
  }

  // How a description batch reaches the card it belongs to.
  public find(releaseId: string): Release | undefined {
    return this.releasesIndex.get(releaseId)
  }

  // Setting descriptionHTML re-renders that card. No-ops once a refresh has
  // replaced the release this description was fetched for.
  public attachDescription(releaseId: string, description: string): void {
    const release = this.releasesIndex.get(releaseId)

    if (release) {
      release.data.descriptionHTML = description
    }
  }

  // Merges into the sorted feed and indexes by id; returns what landed, so the
  // caller can fetch notes for exactly those releases.
  public merge(repos: GithubRepository[]): Release[] {
    const newReleases: Release[] = []

    for (const repo of repos) {
      newReleases.push(...extractReleases(repo))
    }

    if (newReleases.length === 0) return newReleases

    this.releases = mergeSorted(this.releases, newReleases, releaseSortFn)

    for (const release of newReleases) {
      this.releasesIndex.set(release.data.id, release)
      const repoId = release.data.repo.id
      let repoReleaseIds = this.releasesByRepo.get(repoId)
      if (!repoReleaseIds) {
        repoReleaseIds = new Set()
        this.releasesByRepo.set(repoId, repoReleaseIds)
      }
      repoReleaseIds.add(release.data.id)
    }

    return newReleases
  }

  // Used before re-merging fresh repo data.
  public dropForRepos(repoIds: Set<string>): void {
    if (this.releases.length === 0 || repoIds.size === 0) return

    const toRemove = new Set<string>()
    for (const repoId of repoIds) {
      const repoReleaseIds = this.releasesByRepo.get(repoId)
      if (repoReleaseIds) {
        for (const releaseId of repoReleaseIds) toRemove.add(releaseId)
        this.releasesByRepo.delete(repoId)
      }
    }
    if (toRemove.size === 0) return

    this.releases = this.releases.filter(
      (r): boolean => !toRemove.has(r.data.id),
    )
    for (const releaseId of toRemove) {
      this.releasesIndex.delete(releaseId)
    }
  }

  // The survivor set for description eviction — from the feed, not the `repos`
  // store, which is empty on a cache-disabled load and would evict everything.
  public descriptionKeys(): Set<string> {
    const keys = new Set<string>()
    for (const release of this.releases) {
      keys.add(descriptionKey(release.data.id, release.data.updatedAt))
    }
    return keys
  }
}
