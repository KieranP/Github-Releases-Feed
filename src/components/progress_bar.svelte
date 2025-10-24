<script lang="ts">
  import loadingSvg from '../assets/loading.svg?raw'

  interface Props {
    loading: boolean
    progress: number
  }

  const { loading, progress }: Props = $props()

  let progressSpan = $state<HTMLSpanElement>()

  $effect((): void => {
    if (!progressSpan) return

    progressSpan.style.width = `${progress * 100}%`
  })
</script>

{#if loading}
  {#if progress > 0}
    <div id="progress">
      <span bind:this={progressSpan}></span>
    </div>
  {:else}
    <div id="loading">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html loadingSvg}
    </div>
  {/if}
{/if}

<style>
  #loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);

    :global {
      svg {
        width: 120px;
        fill: var(--svg-fill-color);
      }
    }
  }

  #progress {
    position: fixed;
    top: 0;
    left: 50%;
    z-index: 99;
    transform: translate(-50%, 0);
    margin: 0;
    width: 100%;
    max-width: 1000px;
    line-height: 0;
    background-color: var(--body-background-color);

    span {
      display: inline-block;
      margin: 0;
      height: 10px;
      background-color: var(--progress-bar-color);
    }
  }
</style>
