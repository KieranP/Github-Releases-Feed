<script lang="ts">
  import loadingSvg from '../assets/loading.svg?raw'

  interface Props {
    progress: number
  }

  const { progress }: Props = $props()

  function barResizer(element: HTMLSpanElement): void {
    element.style.width = `${progress * 100}%`
  }
</script>

{#if progress > 0}
  <div
    id="progress"
    aria-label="Loading progress"
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={Math.round(progress * 100)}
    role="progressbar"
  >
    <span {@attach barResizer}></span>
  </div>
{:else}
  <div
    id="loading"
    aria-label="Loading releases"
    role="status"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html loadingSvg}
  </div>
{/if}

<style>
  #loading {
    position: fixed;
    inset: 0;
    margin: auto;
    width: fit-content;
    height: fit-content;

    /* The spinner animation lives here, not in the SVG: style-src blocks it. */
    :global {
      svg {
        width: 120px;
        fill: var(--svg-fill-color);

        .dot {
          animation: dot-bounce 1.05s infinite;
        }

        .delay-1 {
          animation-delay: 0.1s;
        }

        .delay-2 {
          animation-delay: 0.2s;
        }
      }
    }
  }

  @keyframes dot-bounce {
    0%,
    57.14% {
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
      transform: translate(0);
    }

    28.57% {
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
      transform: translateY(-6px);
    }

    100% {
      transform: translate(0);
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
