// WebSocket push to all connected browser clients.

import type WebSocket from "ws";
import { getDoneArmed, setBroadcastFn } from "./events.js";

const clients = new Set<WebSocket>();

// Wire up the broadcast function so events.ts can push state changes without
// a circular import.
setBroadcastFn((msg) => broadcast(msg));

export function addClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  // Push current armed state immediately so a fresh browser tab shows the right
  // Done button visibility without waiting for the next state change.
  const payload = JSON.stringify({ action: "set_done_armed", armed: getDoneArmed() });
  if (ws.readyState === 1 /* OPEN */) ws.send(payload);
}

export function broadcast(message: object): void {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}

/** Broadcast a step-frames event. Used by both append_frame (partial) and commit_step_frames (final). */
export function broadcastStepFrames(
  frames: Array<{ payload: string; label?: string; type?: string }>,
  frameType: string,
  currentFrame: number,
  title?: string
): void {
  broadcast({
    action: "replace",
    type: frames[currentFrame].type ?? frameType,
    payload: frames[currentFrame].payload,
    frameLabel: frames[currentFrame].label,
    stepFrames: true,
    currentFrame,
    totalFrames: frames.length,
    ...(title !== undefined ? { title } : {}),
  });
}
