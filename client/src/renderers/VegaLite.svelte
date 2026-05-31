<script lang="ts">
  import embed from "vega-embed";
  import { onMount, afterUpdate, onDestroy } from "svelte";

  export let source: string;

  let container: HTMLDivElement;
  let errorMessage: string | null = null;
  let lastRendered: string | null = null;
  let cleanup: (() => void) | null = null;

  async function render(src: string) {
    if (!container) return;
    errorMessage = null;

    // Dispose previous vega view before rendering a new one.
    cleanup?.();
    cleanup = null;

    try {
      const spec = JSON.parse(src);
      const result = await embed(container, spec, {
        actions: false,
        renderer: "svg",
      });
      cleanup = () => result.view.finalize();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(() => {
    void render(source);
    lastRendered = source;
  });

  afterUpdate(() => {
    if (source !== lastRendered) {
      lastRendered = source;
      void render(source);
    }
  });

  onDestroy(() => {
    cleanup?.();
  });
</script>

<div class="vegalite-renderer">
  <div bind:this={container}></div>
  {#if errorMessage}
    <pre class="render-error">{errorMessage}</pre>
  {/if}
</div>

<style>
  .vegalite-renderer {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .render-error {
    color: #c0392b;
    background: #fdf2f2;
    border: 1px solid #e74c3c;
    border-radius: 4px;
    padding: 12px 16px;
    font-family: monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 80%;
    margin-top: 12px;
  }
</style>
