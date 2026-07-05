<script lang="ts">
  import { onMount, afterUpdate, onDestroy } from "svelte";

  export let source: string;

  let container: HTMLDivElement;
  let errorMessage: string | null = null;
  let lastRendered: string | null = null;
  let cleanup: (() => void) | null = null;
  // Bumped on every render() call; a render whose token no longer matches
  // by the time its async work resolves has been superseded (B8).
  let renderToken = 0;

  // Loaded lazily on first use rather than eagerly bundled on initial page
  // paint (NF13) — cached after the first call so later renders don't re-import.
  type VegaEmbed = typeof import("vega-embed")["default"];
  let vegaEmbedPromise: Promise<VegaEmbed> | null = null;

  function loadVegaEmbed(): Promise<VegaEmbed> {
    if (!vegaEmbedPromise) {
      vegaEmbedPromise = import("vega-embed").then((mod) => mod.default);
    }
    return vegaEmbedPromise;
  }

  async function render(src: string) {
    if (!container) return;
    const token = ++renderToken;
    errorMessage = null;

    // Dispose previous vega view before rendering a new one.
    cleanup?.();
    cleanup = null;

    try {
      const spec = JSON.parse(src);
      const embed = await loadVegaEmbed();
      if (token !== renderToken) return; // superseded while the library was loading
      const result = await embed(container, spec, {
        actions: false,
        renderer: "svg",
      });
      if (token !== renderToken) {
        result.view.finalize(); // superseded — discard, don't leak the view
        return;
      }
      cleanup = () => result.view.finalize();
    } catch (err) {
      if (token !== renderToken) return; // superseded by a newer render
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
