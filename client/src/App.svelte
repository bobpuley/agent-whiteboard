<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { connectWebSocket } from "./ws.js";
  import type { RenderCommand } from "./ws.js";
  import MermaidRenderer from "./renderers/Mermaid.svelte";
  import HtmlRenderer from "./renderers/Html.svelte";
  import KatexRenderer from "./renderers/Katex.svelte";
  import VegaLiteRenderer from "./renderers/VegaLite.svelte";
  import HistoryPanel from "./HistoryPanel.svelte";

  type CanvasType = "mermaid" | "svg" | "html" | "katex" | "vega-lite";

  type CanvasState =
    | { type: "empty" }
    | { type: "step-frames-placeholder"; frameCount: number; title?: string }
    | {
        type: CanvasType;
        payload: string;
        title?: string;
        stepFrames?: boolean;
        frameLabel?: string;
        currentFrame?: number;
        totalFrames?: number;
        nodeToFrame?: Record<string, number>;
      };

  let canvas: CanvasState = { type: "empty" };
  let disconnected = false;
  let clickable = false;
  let nodeActions: Record<string, string[]> | undefined = undefined;
  // nodeToFrameEnabled is set true on replace with nodeToFrame, and set false when
  // set_node_actions enabled:true arrives (wait_click overrides it). It is NOT
  // restored when set_node_actions enabled:false arrives — agent must re-render.
  let nodeToFrameEnabled = false;

  function handleCommand(cmd: RenderCommand) {
    if (cmd.action === "clear") {
      canvas = { type: "empty" };
      clickable = false;
      nodeActions = undefined;
      nodeToFrameEnabled = false;
    } else if (cmd.action === "replace" && cmd.type === "step-frames-placeholder") {
      canvas = { type: "step-frames-placeholder", frameCount: cmd.frameCount, title: cmd.title };
      nodeToFrameEnabled = false;
    } else if (cmd.action === "replace") {
      canvas = {
        type: cmd.type as CanvasType,
        payload: cmd.payload,
        title: cmd.title,
        stepFrames: cmd.stepFrames,
        frameLabel: cmd.frameLabel,
        currentFrame: cmd.currentFrame,
        totalFrames: cmd.totalFrames,
        nodeToFrame: cmd.nodeToFrame,
      };
      nodeToFrameEnabled = cmd.nodeToFrame !== undefined;
    } else if (cmd.action === "set_node_actions") {
      clickable = cmd.enabled;
      nodeActions = cmd.enabled ? (cmd.node_actions ?? {}) : undefined;
      if (cmd.enabled) nodeToFrameEnabled = false;
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

  let historyOpen = false;

  // Done button — signals Claude Code via the channel server that the user finished exploring.
  let doneSent = false;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleDone() {
    if (doneSent) return;
    await fetch("/user-done", { method: "POST" });
    doneSent = true;
    if (doneTimer) clearTimeout(doneTimer);
    doneTimer = setTimeout(() => { doneSent = false; }, 2000);
  }
</script>

<HistoryPanel bind:open={historyOpen} on:close={() => { historyOpen = false; }} />

<main>
  {#if disconnected}
    <div class="banner">
      Server disconnected. Restart <code>npm run dev</code>.
    </div>
  {/if}

  <div class="canvas-frame">
    {#if canvas.type !== "empty" && canvas.title}
      <header class="canvas-title">{canvas.title}</header>
    {/if}

    <div class="canvas">
      {#if canvas.type === "empty"}
        <p class="placeholder">Waiting for content…</p>
      {:else if canvas.type === "step-frames-placeholder"}
        <p class="placeholder">Building step-frames… {canvas.frameCount} frames</p>
      {:else if canvas.type === "mermaid"}
        <MermaidRenderer source={canvas.payload} {clickable} {nodeActions} nodeToFrame={nodeToFrameEnabled ? canvas.nodeToFrame : undefined} />
      {:else if canvas.type === "svg" || canvas.type === "html"}
        <HtmlRenderer source={canvas.payload} type={canvas.type} />
      {:else if canvas.type === "katex"}
        <KatexRenderer source={canvas.payload} />
      {:else if canvas.type === "vega-lite"}
        <VegaLiteRenderer source={canvas.payload} />
      {/if}
    </div>
  </div>

  {#if canvas.type !== "empty" && canvas.stepFrames}
    <div class="step-bar">
      <button
        class="step-btn"
        on:click={() => stepNav("prev")}
        aria-label="Previous frame"
        disabled={canvas.currentFrame === 0}
      >&#8592; Prev</button>
      {#if canvas.frameLabel}
        <span class="step-label">{canvas.frameLabel}</span>
      {/if}
      <button
        class="step-btn"
        on:click={() => stepNav("next")}
        aria-label="Next frame"
        disabled={canvas.totalFrames !== undefined && canvas.currentFrame === canvas.totalFrames - 1}
      >Next &#8594;</button>
    </div>
  {/if}

  <div class="controls-panel">
    <button class="history-btn" on:click={() => { historyOpen = !historyOpen; }} aria-label="Toggle history panel" aria-pressed={historyOpen}>
      &#128337;
    </button>
    <button class="done-btn" on:click={handleDone} disabled={doneSent} title="Done">
      {#if doneSent}
        Sent ✓
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      {/if}
    </button>
  </div>
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
    padding: 20px;
    box-sizing: border-box;
  }

  .banner {
    background: #c0392b;
    color: #fff;
    padding: 10px 16px;
    font-size: 14px;
    text-align: center;
    margin-bottom: 12px;
    border-radius: 4px;
  }

  .banner code {
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .canvas-frame {
    flex: 1;
    display: flex;
    flex-direction: column;
    border: 1px solid #d8d8d8;
    border-radius: 6px;
    overflow: hidden;
    min-height: 0;
  }

  .canvas-title {
    padding: 10px 20px;
    font-size: 15px;
    font-weight: 600;
    color: #333;
    border-bottom: 1px solid #e8e8e8;
    background: #fafafa;
    user-select: none;
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

  .step-btn:hover:not(:disabled) {
    background: #f0f0f0;
  }

  .step-btn:disabled {
    color: #bbb;
    border-color: #e0e0e0;
    cursor: default;
  }

  .step-label {
    font-size: 14px;
    color: #444;
    flex: 1;
    text-align: center;
  }

  .controls-panel {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 8px;
    background: #fff;
    border: 1px solid #d8d8d8;
    border-right: none;
    border-radius: 6px 0 0 6px;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.06);
    z-index: 50;
  }

  .history-btn {
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 16px;
    color: #555;
    transition: background 0.1s;
    line-height: 1;
  }

  .history-btn:hover {
    background: #f0f0f0;
  }

  .history-btn[aria-pressed="true"] {
    background: #e8f4fd;
    border-color: #2980b9;
    color: #2980b9;
  }

  .done-btn {
    padding: 6px 8px;
    border: 1px solid #27ae60;
    border-radius: 4px;
    background: #fff;
    color: #27ae60;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.1s;
    min-width: 32px;
    min-height: 32px;
  }

  .done-btn:hover:not(:disabled) {
    background: #f0fff4;
  }

  .done-btn:disabled {
    border-color: #aaa;
    color: #aaa;
    cursor: default;
  }
</style>
