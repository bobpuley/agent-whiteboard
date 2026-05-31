<script lang="ts">
  import mermaid from "mermaid";
  import { afterUpdate, onDestroy, onMount } from "svelte";

  export let source: string;

  let wrapper: HTMLDivElement;
  let container: HTMLDivElement;
  let errorMessage: string | null = null;
  let lastRendered: string | null = null;

  // ── Zoom / pan state ────────────────────────────────────────────────────────
  let scale = 1;
  let tx = 0; // translate X
  let ty = 0; // translate Y
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginTx = 0;
  let dragOriginTy = 0;

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;
  const ZOOM_FACTOR = 0.001; // scale delta per wheel pixel

  function resetTransform() {
    scale = 1;
    tx = 0;
    ty = 0;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_FACTOR;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta * scale));

    // Zoom toward the cursor position inside the wrapper.
    const rect = wrapper.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Adjust translation so the point under the cursor stays fixed.
    tx = cursorX - (cursorX - tx) * (newScale / scale);
    ty = cursorY - (cursorY - ty) * (newScale / scale);
    scale = newScale;
  }

  function onMousedown(e: MouseEvent) {
    if (e.button !== 0) return; // left button only
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginTx = tx;
    dragOriginTy = ty;
    e.preventDefault();
  }

  function onMousemove(e: MouseEvent) {
    if (!dragging) return;
    tx = dragOriginTx + (e.clientX - dragStartX);
    ty = dragOriginTy + (e.clientY - dragStartY);
  }

  function onMouseup() {
    dragging = false;
  }

  // ── Mermaid rendering ───────────────────────────────────────────────────────
  mermaid.initialize({ startOnLoad: false, theme: "default" });

  async function renderDiagram(src: string) {
    errorMessage = null;
    resetTransform();
    if (!src) {
      if (container) container.innerHTML = "";
      return;
    }
    try {
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

    window.addEventListener("mousemove", onMousemove);
    window.addEventListener("mouseup", onMouseup);
  });

  afterUpdate(() => {
    if (source !== lastRendered) {
      lastRendered = source;
      void renderDiagram(source);
    }
  });

  onDestroy(() => {
    window.removeEventListener("mousemove", onMousemove);
    window.removeEventListener("mouseup", onMouseup);
  });

  $: transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  $: cursor = dragging ? "grabbing" : "grab";
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="mermaid-wrapper"
  bind:this={wrapper}
  on:wheel={onWheel}
  on:mousedown={onMousedown}
  title="Scroll to zoom · Drag to pan · Double-click to reset"
  on:dblclick={resetTransform}
  style="cursor: {cursor}"
>
  <div
    class="mermaid-canvas"
    style="transform: {transform}; transform-origin: 0 0;"
  >
    <div bind:this={container} class="mermaid-container"></div>
  </div>

  {#if errorMessage}
    <pre class="render-error">{errorMessage}</pre>
  {/if}

  <div class="zoom-hint">scroll to zoom · drag to pan · dbl-click to reset</div>
</div>

<style>
  .mermaid-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    user-select: none;
  }

  .mermaid-canvas {
    position: absolute;
    top: 0;
    left: 0;
    /* transition intentionally omitted — real-time pan/zoom feels snappier without it */
  }

  .mermaid-container {
    /* Let the SVG size itself naturally */
  }

  .render-error {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
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
    z-index: 10;
  }

  .zoom-hint {
    position: absolute;
    bottom: 8px;
    right: 12px;
    font-size: 11px;
    color: #bbb;
    pointer-events: none;
    user-select: none;
  }
</style>
