<script lang="ts">
  import { appState, settings } from '../state.svelte'

  import Release from './release.svelte'

  import type { ReleaseObj } from '../github'

  interface Props {
    allReleases: ReleaseObj[]
  }

  const { allReleases }: Props = $props()

  const lastSeenPublishedAt = localStorage.getItem('lastSeenPublishedAt')

  function shouldDisplayCaughtUp(release: ReleaseObj): boolean {
    return appState.firstReleaseBeforeLastSeen?.id === release.id
  }

  function shouldDisplayRelease(release: ReleaseObj): boolean {
    if (release.isPrerelease && settings.hidePrereleases) {
      return false
    }

    if (
      settings.hidePreviouslySeen &&
      lastSeenPublishedAt !== null &&
      release.publishedAt <= lastSeenPublishedAt
    ) {
      return false
    }

    const isIgnored = settings.ignoredRepos.has(release.repo.fullName)
    if (isIgnored && !settings.showIgnoredRepos) {
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

<style lang="scss">
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
