<script lang="ts">
  import { onMount } from 'svelte'

  import Login from './components/login.svelte'
  import ProgressBar from './components/progress_bar.svelte'
  import Releases from './components/releases.svelte'
  import Settings from './components/settings.svelte'
  import Toasts from './components/toasts.svelte'
  import { loader } from './loader.svelte'
  import { persist, settings } from './state.svelte'

  const loading = $derived(loader.loading)
  const progress = $derived(loader.progress)
  const releaseGroups = $derived(loader.groups)
  const toasts = $derived(loader.toasts)

  function saveGithubToken(inputValue: string): boolean {
    if (!inputValue) return false

    settings.githubToken = inputValue
    persist('githubToken', inputValue)
    return true
  }

  function onlogin(inputValue: string): void {
    if (!inputValue) return

    if (saveGithubToken(inputValue)) {
      loader.clearToasts()
      loader.start()
    }
  }

  function onlogout(): void {
    loader.reset()
  }

  // Wired here so no component below has to know the singleton exists.
  function onreload(): void {
    loader.start()
  }

  function onclearcache(): void {
    void loader.clearCachedData()
  }

  function ondismisstoast(key: string): void {
    loader.dismissToast(key)
  }

  function ondebug(): void {
    console.log(
      JSON.stringify({
        loading,
        progress,
        toasts,
        settings: {
          ...settings,
          githubToken: settings.githubToken?.slice(0, 11),
        },
        groups: releaseGroups.map((g) => g.dump()),
      }),
    )
  }

  onMount((): void => {
    if (settings.githubToken !== null) {
      loader.start()
    }
  })
</script>

<Settings
  {onclearcache}
  {ondebug}
  {onlogout}
  {onreload}
/>

{#if settings.githubToken}
  {#if loading}
    <ProgressBar {progress} />
  {/if}

  <Releases {releaseGroups} />
{:else}
  <Login {onlogin} />
{/if}

<Toasts
  {ondismisstoast}
  {toasts}
/>
