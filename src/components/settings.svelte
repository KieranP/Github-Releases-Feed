<script lang="ts">
  import settingsSvg from '../assets/gear.svg?raw'
  import githubSvg from '../assets/github.svg?raw'
  import themeSvg from '../assets/theme.svg?raw'
  import { loader } from '../loader.svelte'
  import { applyColorScheme, persist, settings } from '../state.svelte'

  interface Props {
    ondebug: () => void
    onlogout: () => void
  }

  let { ondebug, onlogout }: Props = $props()

  let popoverElement: HTMLDivElement | undefined = $state()

  function toggleDarkMode(): void {
    const darkMode = !settings.darkMode
    applyColorScheme(darkMode)
    saveBooleanSetting('darkMode', darkMode)
  }

  function saveBooleanSetting(
    setting: KeysWithValsOfType<typeof settings, boolean>,
    value: boolean,
  ): void {
    settings[setting] = value
    persist(setting, value)
  }
</script>

<header id="settings_btn">
  <button
    aria-label="Settings"
    popovertarget="settings-popover"
    type="button"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html settingsSvg}
  </button>

  <button
    aria-label="Toggle dark mode"
    onclick={toggleDarkMode}
    type="button"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html themeSvg}
  </button>

  <a
    aria-label="View source on GitHub"
    href="https://github.com/KieranP/Github-Releases-Feed"
    rel="noopener noreferrer"
    target="_blank"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html githubSvg}
  </a>
</header>

<div
  bind:this={popoverElement}
  id="settings-popover"
  popover
>
  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={
          (): boolean => settings.expandDescriptions,
          (v: boolean): void => {
            saveBooleanSetting('expandDescriptions', v)
          }
        }
      />
      Expand Descriptions
    </label>
  </div>

  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={
          (): boolean => settings.hidePrereleases,
          (v: boolean): void => {
            saveBooleanSetting('hidePrereleases', v)
          }
        }
      />
      Hide All Prereleases
    </label>
  </div>

  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={
          (): boolean => settings.hidePreviouslySeen,
          (v: boolean): void => {
            saveBooleanSetting('hidePreviouslySeen', v)
          }
        }
      />
      Hide Previously Seen
    </label>
  </div>

  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={
          (): boolean => settings.showIgnoredRepos,
          (v: boolean): void => {
            saveBooleanSetting('showIgnoredRepos', v)
          }
        }
      />
      Show Ignored Repositories
    </label>
  </div>

  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={
          (): boolean => settings.showIgnoredPrereleases,
          (v: boolean): void => {
            saveBooleanSetting('showIgnoredPrereleases', v)
          }
        }
      />
      Show Ignored Prereleases
    </label>
  </div>

  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={
          (): boolean => settings.showLanguages,
          (v: boolean): void => {
            saveBooleanSetting('showLanguages', v)
          }
        }
      />
      Show Languages
    </label>
  </div>

  <div>
    <label>
      <input
        type="checkbox"
        bind:checked={
          (): boolean => settings.disableCache,
          (v: boolean): void => {
            saveBooleanSetting('disableCache', v)
            // The flag picks the pipeline per request, so reload to apply it.
            loader.start()
          }
        }
      />
      Disable Repo Cache
    </label>
  </div>

  <div id="buttons">
    <button
      onclick={(): void => {
        ondebug()
      }}
      type="button">Debug</button
    >

    <button
      onclick={(): void => {
        void loader.clearCachedData()
      }}
      type="button">Clear Cache</button
    >

    {#if settings.githubToken}
      <button
        onclick={(): void => {
          onlogout()
          popoverElement?.hidePopover()
        }}
        type="button">Logout</button
      >
    {/if}
  </div>
</div>

<style>
  #settings_btn {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 12px;

    button,
    a {
      margin: 0;
      line-height: 15px;

      :global {
        svg {
          width: 18px;
          height: 18px;
          fill: var(--svg-fill-color);
        }
      }
    }
  }

  #settings-popover {
    position-area: span-bottom left;
    margin-right: 10px;
    width: 300px;
    padding: 20px;
    border: 1px solid var(--box-border-color);
    border-radius: var(--box-border-radius);
    background-color: var(--box-background-color);
    box-shadow: var(--box-shadow);

    #buttons {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 20px;

      button {
        padding: 4px 8px;
        border: 1px solid var(--box-border-color);
        border-radius: var(--box-border-radius);
        background-color: var(--box-background-color);
        box-shadow: var(--box-shadow);
        font-size: 14px;

        &:hover {
          background-color: var(--box-hover-color);
        }
      }
    }
  }
</style>
