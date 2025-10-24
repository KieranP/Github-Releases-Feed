<script lang="ts">
  interface Props {
    toast: string
  }

  const { toast }: Props = $props()
</script>

{#if toast}
  <div id="toast">
    {toast}
  </div>
{/if}

<style>
  #toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 100;
    min-width: 250px;
    max-width: 500px;
    padding: 20px;
    border: 2px solid #f00;
    border-radius: 6px;
    box-shadow:
      0px 1px 1px 0px #1f23280f,
      0px 1px 3px 0px #1f23280f;
    background-color: #fdfdfd;
    text-align: justify;
  }
</style>
