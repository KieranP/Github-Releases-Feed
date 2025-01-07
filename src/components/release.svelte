<script lang="ts">
  import { intlFormat, intlFormatDistance } from 'date-fns'

  import { settings } from '../state.svelte'

  import type { ReleaseObj } from 'src/github'

  interface Props {
    release: ReleaseObj
  }

  const { release }: Props = $props()

  let descriptionDiv = $state<HTMLDivElement>()
  let expandDescriptionDiv = $state<HTMLDivElement>()
  let oversized = $state(false)
  let menuOpen = $state(false)

  const repo = $derived(release.repo)
  const owner = $derived(repo.owner)
  const licenseInfo = $derived(repo.licenseInfo)
  const ignored = $derived(settings.ignoredRepos.has(repo.name))

  const starsFormatter = new Intl.NumberFormat('en', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumSignificantDigits: 3,
  })

  function expandDescription(): void {
    if (descriptionDiv) descriptionDiv.classList.remove('truncated')
    if (expandDescriptionDiv) expandDescriptionDiv.style.display = 'none'
  }

  function toggleMenu(): void {
    menuOpen = !menuOpen
  }

  function ignoreRepo(): void {
    settings.ignoredRepos.add(repo.name)
    persistIgnoredRepos()
    toggleMenu()
  }

  function unignoreRepo(): void {
    settings.ignoredRepos.delete(repo.name)
    persistIgnoredRepos()
    toggleMenu()
  }

  function persistIgnoredRepos(): void {
    localStorage.setItem(
      'ignoredRepos',
      JSON.stringify([...settings.ignoredRepos]),
    )
  }

  $effect(() => {
    if (release.descriptionHTML !== undefined && descriptionDiv) {
      const rect = descriptionDiv.getBoundingClientRect()
      oversized = rect.height > 150
    }
  })
</script>

<div class="release">
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
          {owner.login}/{repo.name}
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

    {#if ignored}
      <div>
        <img
          class="ignored"
          alt="Ignored Repository"
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
        {#if ignored}
          <button
            onclick={unignoreRepo}
            type="button">Unignore this repository</button
          >
        {:else}
          <button
            onclick={ignoreRepo}
            type="button">Ignore this repository</button
          >
        {/if}
      </div>
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

  {#if release.descriptionHTML === undefined || release.descriptionHTML !== ''}
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

<style lang="scss">
  .release {
    padding: 20px;
    border: 1px solid #ccc;
    border-radius: 7px;
    background-color: #fdfdfd;
    filter: drop-shadow(5px 5px 5px #ccc);
    line-height: 20px;
    font-size: 15px;
    color: #333;

    a {
      color: #333;
    }

    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 10px;
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
          border-radius: 7px;
        }
      }

      .repo {
        position: relative;

        .tooltip {
          display: none;
          position: absolute;
          z-index: 98;
          top: 25px;
          left: 5px;
          width: 350px;
          padding: 20px;
          border: 1px solid #ccc;
          border-radius: 7px;
          background-color: #fdfdfd;
          filter: drop-shadow(5px 5px 5px #ccc);
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
      border-radius: 7px;
      background-color: #fdfdfd;
      filter: drop-shadow(5px 5px 5px #ccc);

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
        top: -4px;
        left: 5px;
        font-weight: normal;
      }
    }

    .description {
      margin-block: 16px;
      padding: 16px;
      overflow-x: scroll;
      background-color: #f6f6f6;

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
        font-size: 15px;

        :first-child {
          margin-top: 0;
        }

        :last-child {
          margin-bottom: 0;
        }

        h1 {
          margin-block: 10px;
          line-height: 20px;
          font-size: 20px;
        }

        h2 {
          margin-block: 10px;
          line-height: 18px;
          font-size: 18px;
        }

        h3 {
          margin-block: 5px;
          line-height: 16px;
          font-size: 16px;
        }

        h4 {
          margin-block: 5px;
          line-height: 16px;
          font-size: 16px;
        }

        h5 {
          margin-block: 5px;
          line-height: 16px;
          font-size: 16px;
        }

        h6 {
          margin-block: 5px;
          line-height: 16px;
          font-size: 16px;
        }

        ul {
          padding-left: 25px;
        }

        a {
          color: #333 !important;
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
  }
</style>
