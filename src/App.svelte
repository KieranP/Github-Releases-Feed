<script lang="ts">
  import { onMount } from 'svelte'

  import Login from './components/login.svelte'
  import ProgressBar from './components/progress_bar.svelte'
  import Releases from './components/releases.svelte'
  import Settings from './components/settings.svelte'
  import Toasts from './components/toasts.svelte'
  import { loader } from './loader.svelte'
  import { persist, settings } from './state.svelte'

  import type { Release } from './models/release.svelte'

  const loading = $derived(loader.loading)
  const progress = $derived(loader.progress)
  const releaseGroups = $derived(loader.groups)
  const toasts = $derived(loader.toasts)

  function onlogin(inputValue: string): void {
    if (!inputValue) return

    settings.githubToken = inputValue
    persist('githubToken', inputValue)

    loader.clearToasts()
    loader.start()
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

  function onshowdescription(release: Release): void {
    loader.loadDescription(release)
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

  <Releases
    {onshowdescription}
    {releaseGroups}
  />
{:else}
  <Login {onlogin} />
{/if}

<Toasts
  {ondismisstoast}
  {toasts}
/>
