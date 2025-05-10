<script lang="ts">
  import { appState, lastSeenPublishedAt, settings } from '../state.svelte'

  import Release from './release.svelte'

  import type { ReleaseObj } from '../github'

  interface Props {
    allReleases: ReleaseObj[]
  }

  const { allReleases }: Props = $props()

  function shouldDisplayCaughtUp(release: ReleaseObj): boolean {
    return appState.firstReleaseBeforeLastSeen?.id === release.id
  }

  function shouldDisplayRelease(release: ReleaseObj): boolean {
    if (release.isPrerelease && settings.hidePrereleases) {
      return false
    }

    if (
      settings.hidePreviouslySeen &&
      release.publishedAt <= lastSeenPublishedAt
    ) {
      return false
    }

    const isIgnoredRepo = settings.ignoredRepos.has(release.repo.fullName)
    if (isIgnoredRepo && !settings.showIgnoredRepos) {
      return false
    }

    const isIgnoredPrerelease =
      release.isPrerelease &&
      settings.ignoredPrereleases.has(release.repo.fullName)
    if (isIgnoredPrerelease && !settings.showIgnoredPrereleases) {
      return false
    }

    return true
  }
</script>

<div id="releases">
  {#each allReleases as release (release.id)}
    {#if shouldDisplayCaughtUp(release)}
      <div id="caught_up">You're All Caught Up</div>
    {/if}

    {#if shouldDisplayRelease(release)}
      <Release {release} />
    {/if}
  {/each}
</div>

<style>
  #releases {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
    max-width: 1000px;
    margin: 20px auto;

    #caught_up {
      display: flex;
      flex-direction: row;
      font-size: 13px;
      color: #333;

      &:before,
      &:after {
        content: '';
        flex: 1 1;
        border-bottom: 1px solid #ccc;
        margin: auto;
      }

      &:before {
        margin-right: 10px;
      }

      &:after {
        margin-left: 10px;
      }
    }
  }
</style>
