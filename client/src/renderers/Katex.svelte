<script lang="ts">
  import "katex/dist/katex.min.css";
  import { onMount, afterUpdate } from "svelte";

  export let source: string;

  let container: HTMLDivElement;
  let errorMessage: string | null = null;
  let lastRendered: string | null = null;
  // Bumped on every render() call; a render whose token no longer matches by
  // the time the lazily-loaded library resolves has been superseded and must
  // not touch the DOM (same guard as Mermaid/VegaLite — B8).
  let renderToken = 0;

  // Loaded lazily on first use rather than eagerly bundled on initial page
  // paint (NF13) — cached after the first call so later renders don't re-import.
  type KatexInstance = typeof import("katex")["default"];
  let katexPromise: Promise<KatexInstance> | null = null;

  function loadKatex(): Promise<KatexInstance> {
    if (!katexPromise) {
      katexPromise = import("katex").then((mod) => mod.default);
    }
    return katexPromise;
  }

  async function render(src: string) {
    if (!container) return;
    const token = ++renderToken;
    errorMessage = null;
    try {
      const katex = await loadKatex();
      if (token !== renderToken) return; // superseded while the library was loading
      katex.render(src, container, {
        displayMode: true,
        throwOnError: true,
      });
    } catch (err) {
      if (token !== renderToken) return; // superseded while the library was loading
      errorMessage = err instanceof Error ? err.message : String(err);
      container.innerHTML = "";
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
</script>

<div class="katex-renderer">
  <div bind:this={container}></div>
  {#if errorMessage}
    <pre class="render-error">{errorMessage}</pre>
  {/if}
</div>

<style>
  .katex-renderer {
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
