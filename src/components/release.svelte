<script lang="ts">
  import ignoredSvg from '../assets/ignored.svg?raw'
  import loadingSvg from '../assets/loading.svg?raw'
  import threeDotsSvg from '../assets/three-dots.svg?raw'
  import {
    dateTimeFormatter,
    formatRelativeTime,
    intersectionObserver,
    starsFormatter,
  } from '../helpers'
  import { persist, settings } from '../state.svelte'

  import type { Release } from '../models/release.svelte'

  interface Props {
    release: Release
  }

  const { release }: Props = $props()

  let popoverElement: HTMLDivElement | undefined = $state()

  const data = $derived(release.data)
  const repo = $derived(data.repo)
  const owner = $derived(repo.owner)
  const licenseInfo = $derived(repo.licenseInfo)

  const title = $derived(
    data.name === null || data.name === '' ? data.tagName : data.name,
  )

  // isIgnoredPrerelease is false on a stable release, so the menu can't use it.
  const prereleasesIgnored = $derived(
    settings.ignoredPrereleases.has(repo.fullName),
  )

  function onintersect({
    detail: { isIntersecting, target },
  }: CustomEvent<IntersectionObserverEntry>): void {
    if (isIntersecting) {
      release.descriptionEnteredViewport = true
      intersectionObserver.unobserve(target)
    }
  }

  function observeIntersect(element: Element): () => void {
    intersectionObserver.observe(element)

    return () => {
      intersectionObserver.unobserve(element)
    }
  }

  // Close synchronously: popovertargetaction no-ops as the button re-renders.
  function closeMenu(): void {
    popoverElement?.hidePopover()
  }

  function toggleIgnored(key: 'ignoredPrereleases' | 'ignoredRepos'): void {
    const ignored = settings[key]

    if (ignored.has(repo.fullName)) {
      ignored.delete(repo.fullName)
    } else {
      ignored.add(repo.fullName)
    }

    persist(key, ignored)
    closeMenu()
  }

  function observeSize(element: HTMLDivElement): () => void {
    release.descriptionHeight = element.scrollHeight

    const observer = new ResizeObserver(() => {
      release.descriptionHeight = element.scrollHeight
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }

  function expandDescription(): void {
    release.descriptionIsTruncated = false
  }
</script>

<div
  class="release"
  {@attach observeIntersect}
  {onintersect}
>
  <div class="info">
    <div class="avatar">
      <img
        alt="{owner.login} avatar"
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
          {#if repo.description}
            <p>{repo.description}</p>
          {/if}

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
        title={dateTimeFormatter.format(data.publishedAt)}
      >
        {formatRelativeTime(data.publishedAt, new Date())}
      </div>
    </div>

    <div class="spacer"></div>

    {#if release.isIgnoredRepo || release.isIgnoredPrerelease}
      <div
        class="ignored"
        aria-label="Ignored"
        role="img"
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html ignoredSvg}
      </div>
    {/if}

    <div class="options">
      <button
        aria-label="Release options"
        popovertarget="release-menu-{data.id}"
        type="button"
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html threeDotsSvg}
      </button>
    </div>
  </div>

  <div
    bind:this={popoverElement}
    id="release-menu-{data.id}"
    class="menu"
    popover
  >
    <button
      onclick={(): void => {
        toggleIgnored('ignoredRepos')
      }}
      type="button"
      >{release.isIgnoredRepo ? 'Unignore' : 'Ignore'} all releases from this repo</button
    >

    {#if !release.isIgnoredRepo}
      <button
        onclick={(): void => {
          toggleIgnored('ignoredPrereleases')
        }}
        type="button"
        >{prereleasesIgnored ? 'Unignore' : 'Ignore'} prereleases from this repo</button
      >
    {/if}
  </div>

  <div class="name">
    <a
      href={data.url}
      rel="noopener noreferrer"
      target="_blank">{title}</a
    >

    {#if data.isPrerelease}
      <span class="pill status">Prerelease</span>
    {/if}
  </div>

  {#if release.shouldDisplayDescription}
    <div
      class="description"
      class:truncated={release.descriptionIsTruncated}
      {@attach observeSize}
    >
      {#if data.descriptionHTML !== undefined}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html data.descriptionHTML}
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html loadingSvg}
      {/if}
    </div>

    {#if release.descriptionIsTruncated}
      <div class="expand_description">
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
        {const secondary = $derived(
          languageNode.id !== repo.primaryLanguage?.id,
        )}
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

        /* Focus too, or the tooltip is keyboard-unreachable. */
        a:is(:hover, :focus-visible) {
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
      position-area: bottom span-left;
      margin-top: 10px;
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
