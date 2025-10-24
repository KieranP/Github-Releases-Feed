<script lang="ts">
  import { intlFormat, intlFormatDistance } from 'date-fns'

  import ignoredSvg from '../assets/ignored.svg?raw'
  import loadingSvg from '../assets/loading.svg?raw'
  import threeDotsSvg from '../assets/three-dots.svg?raw'
  import { intersectionObserver } from '../helpers'
  import { settings } from '../state.svelte'

  import type { ReleaseObj } from '../github'

  interface Props {
    release: ReleaseObj
  }

  const { release }: Props = $props()

  let loadDescription = $state(false)
  let descriptionDiv = $state<HTMLDivElement>()
  let expandDescriptionDiv = $state<HTMLDivElement>()
  let oversized = $state(false)
  let menuOpen = $state(false)

  let showDescription = $derived(
    loadDescription &&
      (release.descriptionHTML === undefined || release.descriptionHTML !== ''),
  )

  const repo = $derived(release.repo)
  const owner = $derived(repo.owner)
  const licenseInfo = $derived(repo.licenseInfo)
  const ignoredRepo = $derived(settings.ignoredRepos.has(repo.fullName))
  const ignoredPrerelease = $derived(
    settings.ignoredPrereleases.has(repo.fullName),
  )

  const starsFormatter = new Intl.NumberFormat('en', {
    compactDisplay: 'short',
    maximumSignificantDigits: 3,
    notation: 'compact',
  })

  function onintersect({
    detail: { isIntersecting, target },
  }: CustomEvent<IntersectionObserverEntry>): void {
    if (isIntersecting && !loadDescription) {
      loadDescription = true
      intersectionObserver.unobserve(target)
    }
  }

  function observe(element: Element): { destroy: () => void } {
    intersectionObserver.observe(element)

    return {
      destroy(): void {
        intersectionObserver.unobserve(element)
      },
    }
  }

  function expandDescription(): void {
    if (descriptionDiv) descriptionDiv.classList.remove('truncated')
    if (expandDescriptionDiv) expandDescriptionDiv.style.display = 'none'
  }

  function toggleMenu(): void {
    menuOpen = !menuOpen
  }

  function ignoreRepo(): void {
    settings.ignoredRepos.add(repo.fullName)
    persistIgnoredRepos()
    toggleMenu()
  }

  function unignoreRepo(): void {
    settings.ignoredRepos.delete(repo.fullName)
    persistIgnoredRepos()
    toggleMenu()
  }

  function persistIgnoredRepos(): void {
    localStorage.setItem(
      'ignoredRepos',
      JSON.stringify([...settings.ignoredRepos]),
    )
  }

  function ignorePrerelease(): void {
    settings.ignoredPrereleases.add(repo.fullName)
    persistIgnoredPrereleases()
    toggleMenu()
  }

  function unignorePrerelease(): void {
    settings.ignoredPrereleases.delete(repo.fullName)
    persistIgnoredPrereleases()
    toggleMenu()
  }

  function persistIgnoredPrereleases(): void {
    localStorage.setItem(
      'ignoredPrereleases',
      JSON.stringify([...settings.ignoredPrereleases]),
    )
  }

  $effect((): void => {
    if (release.descriptionHTML !== undefined && descriptionDiv) {
      const rect = descriptionDiv.getBoundingClientRect()
      oversized = rect.height > 150
    }
  })
</script>

<div
  class="release"
  {onintersect}
  use:observe
>
  <div class="info">
    <div class="avatar">
      <img
        alt="Avatar"
        loading="lazy"
        src={owner.avatarUrl}
      />
    </div>

    <div>
      <div class="repo">
        <a
          href={repo.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {repo.fullName}
        </a>
        released

        <div class="tooltip">
          <p>{repo.description}</p>

          <div class="metrics">
            {#if repo.primaryLanguage}
              <div>
                <span>&#164;</span>
                {repo.primaryLanguage.name}
              </div>
            {/if}

            <div>
              <span>&#10025;</span>
              {starsFormatter.format(repo.stargazerCount)}
            </div>

            <div>
              <span>&#169;</span>

              {#if licenseInfo}
                {#if licenseInfo.spdxId === 'NOASSERTION'}
                  Unspecified
                {:else}
                  {licenseInfo.spdxId}
                {/if}
              {:else}
                Unknown
              {/if}
            </div>
          </div>
        </div>
      </div>

      <div
        class="time"
        title={intlFormat(release.publishedAt, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          timeZoneName: 'short',
        })}
      >
        {intlFormatDistance(release.publishedAt, new Date())}
      </div>
    </div>

    <div class="spacer"></div>

    {#if ignoredRepo || (ignoredPrerelease && release.isPrerelease)}
      <div class="ignored">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html ignoredSvg}
      </div>
    {/if}

    <div class="options">
      <button
        onclick={toggleMenu}
        type="button"
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html threeDotsSvg}
      </button>
    </div>
  </div>

  {#if menuOpen}
    <div class="menu">
      {#if ignoredRepo}
        <button
          onclick={unignoreRepo}
          type="button">Unignore all releases from this repo</button
        >
      {:else}
        <button
          onclick={ignoreRepo}
          type="button">Ignore all releases from this repo</button
        >
      {/if}

      {#if !ignoredRepo}
        {#if ignoredPrerelease}
          <button
            onclick={unignorePrerelease}
            type="button">Unignore prereleases from this repo</button
          >
        {:else}
          <button
            onclick={ignorePrerelease}
            type="button">Ignore prereleases from this repo</button
          >
        {/if}
      {/if}
    </div>
  {/if}

  <div class="name">
    <a
      href={release.url}
      rel="noopener noreferrer"
      target="_blank">{release.name || release.tagName}</a
    >

    {#if release.isPrerelease || release.isDraft}
      <span class="pill status">
        {#if release.isPrerelease}
          Prerelease
        {:else if release.isDraft}
          Draft
        {/if}
      </span>
    {/if}
  </div>

  {#if showDescription}
    <div
      bind:this={descriptionDiv}
      class="description"
      class:truncated={oversized && !settings.expandDescriptions}
    >
      {#if release.descriptionHTML !== undefined}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html release.descriptionHTML}
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html loadingSvg}
      {/if}
    </div>

    {#if oversized && !settings.expandDescriptions}
      <div
        bind:this={expandDescriptionDiv}
        class="expand_description"
      >
        <button
          onclick={expandDescription}
          type="button">Read more</button
        >
      </div>
    {/if}
  {/if}

  {#if settings.showLanguages}
    <div class="meta">
      {#each repo.languages.nodes as languageNode (languageNode.id)}
        {@const secondary = languageNode.id !== repo.primaryLanguage?.id}
        <div
          class="pill lang"
          class:secondary
        >
          {languageNode.name}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .release {
    position: relative;
    padding: 20px;

    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: var(--box-border-radius);
      background-color: var(--pill-background-color-primary);
      color: var(--pill-font-color);
      line-height: 13px;
      font-size: 13px;
    }

    .info {
      display: flex;
      gap: 10px;

      .avatar {
        img {
          width: 40px;
          height: 40px;
          border-radius: var(--box-border-radius);
        }
      }

      .repo {
        position: relative;

        .tooltip {
          display: none;
          position: absolute;
          z-index: 98;
          top: 25px;
          left: 0px;
          width: 350px;
          padding: 20px;
          border: 1px solid var(--box-border-color);
          border-radius: var(--box-border-radius);
          background-color: var(--box-background-color);
          box-shadow: var(--box-shadow);
          line-height: 20px;
          font-size: 14px;

          p {
            margin-block: 0 10px;
          }

          .metrics {
            display: flex;
            gap: 20px;

            span {
              font-size: 18px;
              vertical-align: top;
            }
          }
        }

        a:hover {
          & + .tooltip {
            display: block;
          }
        }
      }

      .time {
        font-size: 13px;
      }

      .spacer {
        flex-grow: 1;
      }

      .ignored {
        :global {
          svg {
            width: 20px;
            height: 20px;
            fill: var(--svg-fill-color);
          }
        }
      }

      .options {
        button {
          :global {
            svg {
              width: 20px;
              height: 20px;
              fill: var(--svg-fill-color);
            }
          }
        }
      }
    }

    .menu {
      position: absolute;
      top: 50px;
      right: 20px;
      z-index: 100;
      width: 300px;
      border: 1px solid var(--box-border-color);
      border-radius: var(--box-border-radius);
      background-color: var(--box-background-color);
      box-shadow: var(--box-shadow);

      button {
        display: block;
        width: 100%;
        padding: 12px 20px;
        text-align: left;

        &:hover {
          background-color: var(--box-hover-color);
        }

        &:first-of-type {
          border-top-left-radius: var(--box-border-radius);
          border-top-right-radius: var(--box-border-radius);
        }

        &:last-of-type {
          border-bottom-left-radius: var(--box-border-radius);
          border-bottom-right-radius: var(--box-border-radius);
        }
      }
    }

    .name {
      clear: both;
      margin-block: 16px;
      line-height: 20px;
      font-size: 20px;
      font-weight: bold;

      a:visited {
        color: var(--link-color-visited);
      }

      .status {
        position: relative;
        top: -2px;
        left: 5px;
        font-weight: normal;
      }
    }

    .description {
      margin-block: 16px;
      padding: 16px;
      overflow-x: auto;
      scrollbar-color: var(--body-font-color)
        var(--release-description-background-color);
      background-color: var(--release-description-background-color);
      font-size: 15px;

      &.truncated {
        position: relative;
        max-height: 150px;
        overflow: hidden;
        mask-image: linear-gradient(to bottom, black 20%, transparent 100%);
      }

      :global {
        :first-child {
          margin-top: 0;
        }

        :last-child {
          margin-bottom: 0;
        }

        h1 {
          margin-block: 24px 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--box-border-color);
          line-height: 20px;
          font-size: 20px;
        }

        h2 {
          margin-block: 24px 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--box-border-color);
          line-height: 18px;
          font-size: 18px;
        }

        h3 {
          margin-block: 24px 12px;
          line-height: 16px;
          font-size: 16px;
        }

        h4 {
          margin-block: 16px 8px;
          line-height: 16px;
          font-size: 16px;
        }

        h5 {
          margin-block: 16px 8px;
          line-height: 16px;
          font-size: 16px;
        }

        h6 {
          margin-block: 16px 8px;
          line-height: 16px;
          font-size: 16px;
        }

        p {
          margin-bottom: 12px;
        }

        ul,
        ol {
          margin-bottom: 16px;
          padding-left: 28px;

          li {
            margin-bottom: 4px;
          }
        }

        a {
          color: var(--link-color) !important;
        }

        hr {
          margin: 16px 0;
          height: 2px;
          outline: 0;
          border: 0;
          background-color: var(--box-border-color);
        }

        pre {
          padding: 16px;
          overflow: scroll;
          background-color: var(--release-description-pre-background-color);
        }

        code {
          padding: 2px 4px;
          background-color: var(--release-description-code-background-color);
        }

        table {
          border-collapse: collapse;

          th,
          td {
            padding: 8px;
            border: 1px solid var(--box-border-color);
          }
        }

        div.markdown-alert {
          padding-left: 16px;

          .markdown-alert-title {
            display: flex;

            svg {
              margin-right: 8px;
            }
          }

          &.markdown-alert-note {
            border-left: 3px solid #0969da;

            .markdown-alert-title {
              color: #0969da;

              svg {
                fill: #0969da;
              }
            }
          }
        }
      }
    }

    .expand_description {
      margin: 20px 0;

      button {
        font-size: 15px;
        font-weight: bold;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    }

    .meta {
      .lang {
        margin-right: 5px;
        font-size: 11px;

        &.secondary {
          background-color: var(--pill-background-color-secondary);
        }
      }
    }

    :last-child {
      margin-bottom: 0;
    }

    :global {
      &:has(+ .release) {
        padding-bottom: 0;

        + .release {
          .info,
          .menu {
            display: none;
          }
        }
      }
    }
  }
</style>
