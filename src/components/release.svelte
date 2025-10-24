<script lang="ts">
  import { intlFormat, intlFormatDistance } from 'date-fns'

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
      <div>
        <img
          class="ignored"
          alt="Ignored Repository/Prerelease"
          src="./ignored.svg"
        />
      </div>
    {/if}

    <div class="options">
      <button
        onclick={toggleMenu}
        type="button"
        ><img
          alt="Release Options"
          src="./three-dots.svg"
        /></button
      >
    </div>
  </div>

  {#if menuOpen}
    <div class="menu">
      <div>
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
      </div>

      {#if !ignoredRepo}
        <div>
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
        </div>
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
        <img
          alt="Loading..."
          src="./loading.svg"
        />
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

    a {
      color: #333;
      text-underline-offset: 2px;
    }

    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      background-color: #333;
      color: #fff;
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
          border-radius: 6px;
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
          border: 1px solid #ccc;
          border-radius: 6px;
          background-color: #fdfdfd;
          box-shadow:
            0px 1px 1px 0px #1f23280f,
            0px 1px 3px 0px #1f23280f;
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
        width: 20px;
        height: 20px;
      }

      .options {
        button {
          background-color: transparent;
          border: none;
          outline: none;
          cursor: pointer;

          img {
            width: 20px;
            height: 20px;
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
      padding: 5px;
      border: 1px solid #ccc;
      border-radius: 6px;
      background-color: #fdfdfd;
      box-shadow:
        0px 1px 1px 0px #1f23280f,
        0px 1px 3px 0px #1f23280f;

      button {
        display: block;
        width: 100%;
        padding: 10px 20px;
        text-align: left;
        background-color: transparent;
        border: 0;
        cursor: pointer;

        &:hover {
          background-color: #f6f6f6;
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
        color: #570987;
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
      overflow-x: scroll;
      background-color: #f6f8fa;
      font-size: 15px;

      &.truncated {
        position: relative;
        max-height: 150px;
        overflow: hidden;

        &:after {
          content: '';
          position: absolute;
          left: 0px;
          right: 0px;
          height: 75%;
          bottom: 0px;
          background: linear-gradient(
            180deg,
            rgba(139, 167, 32, 0) 0%,
            rgba(255, 255, 255, 1) 100%
          );
        }
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
          border-bottom: 1px solid #ccc;
          line-height: 20px;
          font-size: 20px;
        }

        h2 {
          margin-block: 24px 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #ccc;
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
          color: #333 !important;
          text-underline-offset: 2px;
        }

        hr {
          margin: 16px 0;
          height: 2px;
          outline: 0;
          border: 0;
          background-color: #ccc;
        }

        pre {
          padding: 16px;
          overflow: scroll;
          background-color: #818b981f;
        }

        code {
          padding: 2px 4px;
          background-color: #818b981f;
        }

        table {
          border-collapse: collapse;

          th,
          td {
            padding: 8px;
            border: 1px solid #ccc;
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
        border: none;
        background-color: transparent;
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
          background-color: #888;
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
