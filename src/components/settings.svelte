<script lang="ts">
  import { db } from '../db'
  import { settings } from '../state.svelte'

  interface Props {
    githubToken: string | null
    logout: () => void
  }

  let { logout, githubToken }: Props = $props()

  let settingsOpen = $state(false)

  function toggleSettings(): void {
    settingsOpen = !settingsOpen
  }

  function saveBooleanSetting(
    setting: KeysWithValsOfType<typeof settings, boolean>,
    value: boolean,
  ): void {
    localStorage.setItem(setting, value.toString())
    settings[setting] = value
  }
</script>

<div id="settings_btn">
  <button
    onclick={(): void => {
      window.open('https://github.com/KieranP/Github-Releases-Feed', '_blank')
    }}
    type="button"
  >
    <img
      alt="Github"
      src="./github.svg"
    /></button
  >

  <button
    onclick={toggleSettings}
    type="button"
  >
    <img
      alt="Settings"
      src="./gear.svg"
    /></button
  >
</div>

{#if settingsOpen}
  <div id="settings">
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

    <div id="buttons">
      <button
        onclick={(): void => {
          void db?.clear('descriptions')
        }}
        type="button">Clear Cache</button
      >

      {#if githubToken}
        <button
          onclick={(): void => {
            logout()
            toggleSettings()
          }}
          type="button">Logout</button
        >
      {/if}
    </div>
  </div>
{/if}

<style>
  #settings_btn {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 100;

    button {
      margin: 0;
      padding: 5px 8px;
      line-height: 15px;
      cursor: pointer;

      img {
        width: 15px;
        height: 15px;
      }
    }
  }

  #settings {
    position: fixed;
    top: 60px;
    right: 20px;
    z-index: 100;
    width: 300px;
    padding: 20px;
    border: 1px solid #ccc;
    border-radius: 7px;
    background-color: #fdfdfd;
    filter: drop-shadow(5px 5px 5px #ccc);

    #buttons {
      margin-top: 20px;
      text-align: center;

      button {
        padding: 0 5px;
        font-size: 14px;
      }
    }
  }
</style>
