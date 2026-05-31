<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { connectWebSocket } from "./ws.js";
  import type { RenderCommand } from "./ws.js";
  import MermaidRenderer from "./renderers/Mermaid.svelte";

  type CanvasState =
    | { type: "empty" }
    | { type: "mermaid"; payload: string };

  let canvas: CanvasState = { type: "empty" };
  let disconnected = false;

  function handleCommand(cmd: RenderCommand) {
    if (cmd.action === "clear") {
      canvas = { type: "empty" };
    } else if (cmd.action === "replace" && cmd.type === "mermaid") {
      canvas = { type: "mermaid", payload: cmd.payload };
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
    {/if}
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
</style>
