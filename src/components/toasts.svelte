<script lang="ts">
  import type { Toast } from '../status.svelte'

  interface Props {
    ondismisstoast: (key: string) => void
    toasts: Toast[]
  }

  const { ondismisstoast, toasts }: Props = $props()
</script>

{#if toasts.length > 0}
  <div id="toasts">
    {#each toasts as toast (toast.key)}
      <div
        class="toast"
        role="alert"
      >
        <span>{toast.message}</span>

        <button
          aria-label="Dismiss {toast.message}"
          onclick={(): void => {
            ondismisstoast(toast.key)
          }}
          type="button">&#10005;</button
        >
      </div>
    {/each}
  </div>
{/if}

<style>
  #toasts {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(400px, calc(100% - 40px));

    .toast {
      display: flex;
      align-items: flex-start;
      gap: 15px;
      padding: 20px;
      border: 2px solid #f00;
      border-radius: var(--box-border-radius);
      box-shadow: var(--box-shadow);
      background-color: var(--box-background-color);
      text-align: justify;

      span {
        flex-grow: 1;
      }

      button {
        line-height: 20px;
        font-size: 16px;

        &:hover {
          color: #f00;
        }
      }
    }
  }
</style>
