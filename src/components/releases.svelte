<script lang="ts">
  import Release from './release.svelte'

  import { settings } from '../state.svelte'

  import type { ReleaseObj } from 'src/github'

  interface Props {
    allReleases: ReleaseObj[]
  }

  const { allReleases }: Props = $props()
</script>

<div id="releases">
  {#each allReleases as release (release.id)}
    {@const ignored = settings.ignoredRepos.has(release.repo.name)}
    {#if settings.showIgnoredRepos || !ignored}
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
  }
</style>
