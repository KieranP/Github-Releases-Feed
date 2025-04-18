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
    border-radius: 7px;
    filter: drop-shadow(5px 5px 5px #ccc);
    background-color: #fdfdfd;
    text-align: justify;
  }
</style>
