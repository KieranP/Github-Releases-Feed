<script lang="ts">
  interface Props {
    loading: boolean
    progress: number
  }

  const { loading, progress }: Props = $props()

  let progressSpan = $state<HTMLSpanElement>()

  $effect(() => {
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
      <img
        alt="Loading..."
        src="./loading.svg"
      />
    </div>
  {/if}
{/if}

<style lang="scss">
  #loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);

    img {
      width: 120px;
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
    background-color: #fafafa;

    span {
      display: inline-block;
      margin: 0;
      height: 10px;
      background-color: green;
    }
  }
</style>
