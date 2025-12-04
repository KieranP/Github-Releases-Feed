<script lang="ts">
  import { onMount } from 'svelte'

  import Login from './components/login.svelte'
  import ProgressBar from './components/progress_bar.svelte'
  import Releases from './components/releases.svelte'
  import Settings from './components/settings.svelte'
  import Toast from './components/toast.svelte'
  import { loader } from './loader.svelte'
  import { lastAccessedAt, settings } from './state.svelte'

  const loading = $derived(loader.loading)
  const progress = $derived(loader.progress)
  const releaseGroups = $derived(loader.groups)
  const toast = $derived(loader.toast)

  function saveGithubToken(inputValue: string): boolean {
    if (!inputValue) return false

    localStorage.setItem('githubToken', inputValue)
    settings.githubToken = inputValue
    return true
  }

  function clearGithubToken(): void {
    localStorage.removeItem('githubToken')
    settings.githubToken = null
  }

  function onlogin(inputValue: string): void {
    if (!inputValue) return

    if (saveGithubToken(inputValue)) {
      loader.start()
    }
  }

  function onlogout(): void {
    clearGithubToken()
    loader.reset()
  }

  function ondebug(): void {
    console.log(
      JSON.stringify({
        loading,
        progress,
        toast,
        settings: {
          ...settings,
          lastAccessedAt,
          githubToken: settings.githubToken?.slice(0, 11),
        },
        groups: releaseGroups.map((g) => g.dump()),
      }),
    )
  }

  onMount((): void => {
    if (settings.darkMode) {
      document.body.classList.add('dark-mode')
    }

    if (settings.githubToken !== null) {
      loader.start()
    }
  })
</script>

<Settings
  {ondebug}
  {onlogout}
/>

{#if settings.githubToken}
  {#if loading}
    <ProgressBar {progress} />
  {/if}

  <Releases {releaseGroups} />
{:else}
  <Login {onlogin} />
{/if}

{#if toast}
  <Toast {toast} />
{/if}
