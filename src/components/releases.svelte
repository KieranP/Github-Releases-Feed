<script lang="ts">
  import { appState, lastSeenPublishedAt, settings } from '../state.svelte'
  import Release from './release.svelte'

  import type { ReleaseObj } from '../github'

  interface Props {
    allReleases: ReleaseObj[]
  }

  const { allReleases }: Props = $props()

  class ReleaseGroup {
    public repo!: string
    public releases: ReleaseObj[] = []
    public expanded: boolean = $state(false)

    public constructor(repo: string) {
      this.repo = repo
    }

    public get key(): string {
      return this.repo + this.releases[0]?.id
    }
  }

  let groupedReleases = $derived.by((): ReleaseGroup[] => {
    const groups: ReleaseGroup[] = []
    let currentGroup: ReleaseGroup | null = null

    for (const release of allReleases) {
      const repo = release.repo.fullName

      if (currentGroup && currentGroup.repo !== repo) {
        groups.push(currentGroup)
        currentGroup = new ReleaseGroup(repo)
      }

      currentGroup ??= new ReleaseGroup(repo)
      currentGroup.releases.push(release)
    }

    if (currentGroup) {
      groups.push(currentGroup)
    }

    return groups
  })

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

  const lastSeenId = $derived(appState.firstReleaseBeforeLastSeen?.id)
  function shouldDisplayCaughtUp(releases: ReleaseObj[]): boolean {
    return releases.some((release) => lastSeenId === release.id)
  }
</script>

<div id="releases">
  {#each groupedReleases as group (group.key)}
    {@const displayableReleases = group.releases.filter(shouldDisplayRelease)}

    {#if shouldDisplayCaughtUp(group.releases)}
      <div id="caught_up">You're All Caught Up</div>
    {/if}

    {#if displayableReleases.length > 0}
      {@const visibleReleases = group.expanded
        ? displayableReleases
        : displayableReleases.slice(0, 1)}
      {@const hiddenCount = displayableReleases.length - 1}

      <div class="release_group">
        {#each visibleReleases as release (release.id)}
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

    .release_group {
      display: flex;
      flex-direction: column;
      border: 1px solid #ccc;
      border-radius: 7px;
      background-color: #fdfdfd;
      filter: drop-shadow(3px 3px 3px #ccc);
      line-height: 20px;
      font-size: 15px;
      color: #333;

      .show_more {
        padding: 10px 20px;
        border: 0;
        border-top: 1px solid #ccc;
        background-color: #fdfdfd;
        border-radius: 0 0 7px 7px;
        font-size: 15px;
        color: #333;
        cursor: pointer;

        &:hover {
          background-color: #f6f6f6;
        }
      }
    }
  }
</style>
