<script lang="ts">
  interface Props {
    toast: string
  }

  const { toast }: Props = $props()
</script>

<div id="toast">
  {toast}
</div>

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
    border-radius: var(--box-border-radius);
    box-shadow: var(--box-shadow);
    background-color: var(--box-background-color);
    text-align: justify;
  }
</style>
