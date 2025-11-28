/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable svelte/prefer-destructured-store-props */
import { lastAccessedAt, settings } from '../state.svelte'

import type { ReleaseObj } from '../github'

export class Release {
  public data!: ReleaseObj

  public descriptionEnteredViewport: boolean = $state(false)
  public shouldDisplayDescription: boolean = $derived(
    this.descriptionEnteredViewport &&
      (this.data.descriptionHTML === undefined ||
        this.data.descriptionHTML !== ''),
  )

  public descriptionIsOversized: boolean = $state(false)
  public descriptionIsTruncated: boolean = $derived(
    this.descriptionIsOversized && !settings.expandDescriptions,
  )

  public constructor(data: ReleaseObj) {
    this.data = $state(data)
  }

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
}
