// WebSocket routing — owns the connection lifecycle and fans out each
// incoming RenderCommand to the stores that care about it.
import { writable } from "svelte/store";
import { connectWebSocket } from "../ws.js";
import type { RenderCommand } from "../ws.js";
import { canvasStore } from "./canvasStore.js";
import { doneStore } from "./doneStore.js";

export const disconnected = writable(false);

function handleCommand(cmd: RenderCommand) {
  canvasStore.dispatch(cmd);
  doneStore.dispatch(cmd);
}

function onDisconnected() {
  disconnected.set(true);
}

function onConnected() {
  disconnected.set(false);
}

export function initRouter(): () => void {
  const cleanupWs = connectWebSocket(handleCommand);
  window.addEventListener("ws:disconnected", onDisconnected);
  window.addEventListener("ws:connected", onConnected);

  return () => {
    cleanupWs();
    window.removeEventListener("ws:disconnected", onDisconnected);
    window.removeEventListener("ws:connected", onConnected);
  };
}
