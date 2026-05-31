<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { connectWebSocket } from "./ws.js";
  import type { RenderCommand } from "./ws.js";
  import MermaidRenderer from "./renderers/Mermaid.svelte";
  import HtmlRenderer from "./renderers/Html.svelte";
  import KatexRenderer from "./renderers/Katex.svelte";
  import VegaLiteRenderer from "./renderers/VegaLite.svelte";

  type CanvasType = "mermaid" | "svg" | "html" | "katex" | "vega-lite";

  type CanvasState =
    | { type: "empty" }
    | { type: CanvasType; payload: string; stepFrames?: boolean; frameLabel?: string };

  let canvas: CanvasState = { type: "empty" };
  let disconnected = false;

  function handleCommand(cmd: RenderCommand) {
    if (cmd.action === "clear") {
      canvas = { type: "empty" };
    } else if (cmd.action === "replace") {
      canvas = {
        type: cmd.type as CanvasType,
        payload: cmd.payload,
        stepFrames: cmd.stepFrames,
        frameLabel: cmd.frameLabel,
      };
    }
  }

  let cleanup: (() => void) | null = null;

  function onDisconnected() { disconnected = true; }
  function onConnected() { disconnected = false; }

  onMount(() => {
    cleanup = connectWebSocket(handleCommand);
    window.addEventListener("ws:disconnected", onDisconnected);
    window.addEventListener("ws:connected", onConnected);
  });

  onDestroy(() => {
    cleanup?.();
    window.removeEventListener("ws:disconnected", onDisconnected);
    window.removeEventListener("ws:connected", onConnected);
  });

  // Step navigation — calls the server REST fallback to drive cursor.
  async function stepNav(direction: "next" | "prev") {
    await fetch("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
  }
</script>

<main>
  {#if disconnected}
    <div class="banner">
      Server disconnected. Restart <code>npm run dev</code>.
    </div>
  {/if}

  <div class="canvas">
    {#if canvas.type === "empty"}
      <p class="placeholder">Waiting for content…</p>
    {:else if canvas.type === "mermaid"}
      <MermaidRenderer source={canvas.payload} />
    {:else if canvas.type === "svg" || canvas.type === "html"}
      <HtmlRenderer source={canvas.payload} type={canvas.type} />
    {:else if canvas.type === "katex"}
      <KatexRenderer source={canvas.payload} />
    {:else if canvas.type === "vega-lite"}
      <VegaLiteRenderer source={canvas.payload} />
    {/if}
  </div>

  {#if canvas.type !== "empty" && canvas.stepFrames}
    <div class="step-bar">
      <button class="step-btn" on:click={() => stepNav("prev")} aria-label="Previous frame">&#8592; Prev</button>
      {#if canvas.frameLabel}
        <span class="step-label">{canvas.frameLabel}</span>
      {/if}
      <button class="step-btn" on:click={() => stepNav("next")} aria-label="Next frame">Next &#8594;</button>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #fff;
    font-family: sans-serif;
  }

  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .banner {
    background: #c0392b;
    color: #fff;
    padding: 10px 16px;
    font-size: 14px;
    text-align: center;
  }

  .banner code {
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .canvas {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .placeholder {
    color: #aaa;
    font-size: 16px;
    user-select: none;
  }

  .step-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 10px 16px;
    background: #f7f7f7;
    border-top: 1px solid #e0e0e0;
  }

  .step-btn {
    padding: 6px 16px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 14px;
  }

  .step-btn:hover {
    background: #f0f0f0;
  }

  .step-label {
    font-size: 14px;
    color: #444;
    flex: 1;
    text-align: center;
  }
</style>
