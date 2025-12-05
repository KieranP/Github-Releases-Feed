/* eslint-disable @typescript-eslint/member-ordering */
import { lastAccessedAt, settings } from '../state.svelte'

import type { ReleaseObj } from '../github'

export class Release {
  public data!: ReleaseObj

  public descriptionEnteredViewport: boolean = $state(false)

  private readonly descriptionIsLoading: boolean = $derived(
    this.data.descriptionHTML === undefined,
  )

  private readonly descriptionHasContent: boolean = $derived(
    this.data.descriptionHTML !== '',
  )

  public shouldDisplayDescription: boolean = $derived(
    this.descriptionEnteredViewport &&
      (this.descriptionIsLoading || this.descriptionHasContent),
  )

  public descriptionHeight: number = $state(0)

  private readonly descriptionIsOversized: boolean = $derived(
    this.descriptionHeight > 150,
  )

  public descriptionIsTruncated: boolean = $derived(
    this.descriptionIsOversized && !settings.expandDescriptions,
  )

  public isIgnoredRepo: boolean = $derived(
    settings.ignoredRepos.has(this.data.repo.fullName),
  )

  public isIgnoredPrerelease: boolean = $derived(
    this.data.isPrerelease &&
      settings.ignoredPrereleases.has(this.data.repo.fullName),
  )

  public isDisplayable: boolean = $derived.by(() => {
    if (this.data.isPrerelease && settings.hidePrereleases) {
      return false
    }

    if (
      settings.hidePreviouslySeen &&
      this.data.publishedAt <= lastAccessedAt
    ) {
      return false
    }

    if (this.isIgnoredRepo && !settings.showIgnoredRepos) {
      return false
    }

    if (this.isIgnoredPrerelease && !settings.showIgnoredPrereleases) {
      return false
    }

    return true
  })

  public constructor(data: ReleaseObj) {
    this.data = $state(data)
  }

  public dump(): object {
    return {
      publishedAt: this.data.publishedAt,
      isPrerelease: this.data.isPrerelease,
      descriptionHTML: this.data.descriptionHTML?.length,
      descriptionEnteredViewport: this.descriptionEnteredViewport,
      descriptionIsLoading: this.descriptionIsLoading,
      descriptionHasContent: this.descriptionHasContent,
      shouldDisplayDescription: this.shouldDisplayDescription,
      descriptionHeight: this.descriptionHeight,
      descriptionIsOversized: this.descriptionIsOversized,
      descriptionIsTruncated: this.descriptionIsTruncated,
      isIgnoredRepo: this.isIgnoredRepo,
      isIgnoredPrerelease: this.isIgnoredPrerelease,
      isDisplayable: this.isDisplayable,
    }
  }
}
