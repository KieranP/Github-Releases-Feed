<script lang="ts">
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
          bind:checked={settings.expandDescriptions}
        />
        Expand Descriptions
      </label>
    </div>

    <div>
      <label>
        <input
          type="checkbox"
          bind:checked={settings.showLanguages}
        />
        Show Languages
      </label>
    </div>

    {#if githubToken}
      <div id="logout">
        <button
          onclick={(): void => {
            logout()
            toggleSettings()
          }}
          type="button">Logout</button
        >
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  #settings_btn {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 100;

    button {
      margin: 0;
      padding: 5px 8px;
      line-height: 15px;

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

    #logout {
      margin-top: 20px;
      text-align: center;
    }
  }
</style>
