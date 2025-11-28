<script lang="ts">
  import Release from './release.svelte'

  import type { ReleaseGroup } from '../models/release_group.svelte'

  interface Props {
    releaseGroups: ReleaseGroup[]
  }

  const { releaseGroups }: Props = $props()
</script>

<div id="releases">
  {#each releaseGroups as group (group.key)}
    {@const { displayableReleases } = group}

    {#if group.showCaughtUp}
      <div id="caught_up">You're All Caught Up</div>
    {/if}

    {#if displayableReleases.length > 0}
      {@const visibleReleases = group.expanded
        ? displayableReleases
        : displayableReleases.slice(0, 1)}
      {@const hiddenCount = displayableReleases.length - 1}

      <div class="release_group">
        {#each visibleReleases as release (release.data.id)}
          <Release {release} />
        {/each}

        {#if hiddenCount > 0}
          {#if group.expanded}
            <button
              class="show_more"
              onclick={(): void => {
                group.expanded = false
              }}
              type="button"
            >
              Show less
            </button>
          {:else}
            <button
              class="show_more"
              onclick={(): void => {
                group.expanded = true
              }}
              type="button"
            >
              Show {hiddenCount} more
            </button>
          {/if}
        {/if}
      </div>
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

      &:before,
      &:after {
        content: '';
        flex: 1 1;
        border-bottom: 1px solid var(--box-border-color);
        margin: auto;
      }

      &:before {
        margin-right: 10px;
      }

      &:after {
        margin-left: 10px;
      }
    }

    .release_group {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--box-border-color);
      border-radius: var(--box-border-radius);
      background-color: var(--box-background-color);
      box-shadow: var(--box-shadow);
      line-height: 20px;
      font-size: 15px;

      .show_more {
        padding: 10px 20px;
        border-top: 1px solid var(--box-border-color);
        background-color: var(--box-background-color);
        border-radius: 0 0 var(--box-border-radius) var(--box-border-radius);
        font-size: 15px;

        &:hover {
          background-color: var(--box-hover-color);
        }
      }
    }
  }
</style>
