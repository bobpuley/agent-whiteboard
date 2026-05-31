<script lang="ts">
  import katex from "katex";
  import "katex/dist/katex.min.css";
  import { onMount, afterUpdate } from "svelte";

  export let source: string;

  let container: HTMLDivElement;
  let errorMessage: string | null = null;
  let lastRendered: string | null = null;

  function render(src: string) {
    if (!container) return;
    errorMessage = null;
    try {
      katex.render(src, container, {
        displayMode: true,
        throwOnError: true,
      });
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      container.innerHTML = "";
    }
  }

  onMount(() => {
    render(source);
    lastRendered = source;
  });

  afterUpdate(() => {
    if (source !== lastRendered) {
      lastRendered = source;
      render(source);
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
