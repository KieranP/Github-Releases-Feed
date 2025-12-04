import type { Release } from './release.svelte'

export class ReleaseGroup {
  public repo!: string
  public releases: Release[] = []
  public expanded: boolean = $state(false)
  public showCaughtUp = false

  public constructor(repo: string) {
    this.repo = repo
  }

  public get key(): string {
    return this.repo + this.releases[0]?.data.id
  }

  public get displayableReleases(): Release[] {
    return this.releases.filter((r) => r.isDisplayable)
  }

  public dump(): object {
    return {
      repo: this.repo,
      expanded: this.expanded,
      showCaughtUp: this.showCaughtUp,
      releases: this.releases.map((r) => r.dump()),
    }
  }
}
