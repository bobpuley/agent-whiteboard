<script lang="ts">
  import DOMPurify from "dompurify";
  import { onMount, afterUpdate } from "svelte";

  export let source: string;
  export let type: "svg" | "html";

  let container: HTMLDivElement;
  let lastRendered: string | null = null;

  function render(src: string) {
    if (!container) return;
    // Silent sanitization: DOMPurify strips malicious markup; cleaned output is rendered.
    const clean = DOMPurify.sanitize(src, {
      // Allow SVG elements and attributes when type is svg.
      USE_PROFILES: type === "svg" ? { svg: true, svgFilters: true } : { html: true },
    });
    container.innerHTML = clean;
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

<div class="html-renderer" bind:this={container}></div>

<style>
  .html-renderer {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  .html-renderer :global(svg) {
    max-width: 100%;
    height: auto;
  }
</style>
