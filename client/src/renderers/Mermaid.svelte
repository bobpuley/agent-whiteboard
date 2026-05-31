<script lang="ts">
  import mermaid from "mermaid";
  import { afterUpdate, onMount } from "svelte";

  export let source: string;

  let container: HTMLDivElement;
  let errorMessage: string | null = null;
  let lastRendered: string | null = null;

  mermaid.initialize({ startOnLoad: false, theme: "default" });

  async function renderDiagram(src: string) {
    errorMessage = null;
    if (!src) {
      if (container) container.innerHTML = "";
      return;
    }
    try {
      // mermaid.render requires a unique id each call.
      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, src);
      if (container) container.innerHTML = svg;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      if (container) container.innerHTML = "";
    }
  }

  onMount(() => {
    void renderDiagram(source);
    lastRendered = source;
  });

  afterUpdate(() => {
    if (source !== lastRendered) {
      lastRendered = source;
      void renderDiagram(source);
    }
  });
</script>

<div class="mermaid-wrapper">
  <div bind:this={container} class="mermaid-container"></div>
  {#if errorMessage}
    <pre class="render-error">{errorMessage}</pre>
  {/if}
</div>

<style>
  .mermaid-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .mermaid-container {
    width: 100%;
    overflow: auto;
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
    max-width: 100%;
  }
</style>
