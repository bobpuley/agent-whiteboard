// WebSocket push to all connected browser clients.

import type WebSocket from "ws";
import { getDoneArmed, setBroadcastFn } from "./events.js";
import type { Viewport } from "./viewport-cache.js";

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

/**
 * Single "replace" broadcast builder (v0.23, U5 — Unified Projector). Every
 * site that pushes new canvas content to the browser — render, step, seek,
 * history-load, slideshow tick/finalize, and the step-frames builder preview —
 * goes through this function instead of hand-assembling the message inline.
 * A field one caller already threads through (id, viewport, nodeToFrame,
 * step-frames cursor) can no longer silently be missing from another
 * broadcast producer — this is the structural fix for the B15/C2b/C2d drift
 * class (docs/05, Milestone_v0.23).
 *
 * `payload`/`frameCount` are mutually exclusive: every real content replace
 * carries `payload`; only the `init_step_frames()` 0-frame placeholder
 * carries `frameCount` instead (it has no content yet).
 */
export interface ReplaceBroadcast {
  type: string;
  payload?: string;
  frameCount?: number;
  frameLabel?: string;
  stepFrames?: boolean;
  currentFrame?: number;
  totalFrames?: number;
  title?: string;
  nodeToFrame?: Record<string, number>;
  id?: string;
  viewport?: Viewport;
}

export function broadcastReplace(msg: ReplaceBroadcast): void {
  broadcast({
    action: "replace",
    type: msg.type,
    ...(msg.payload !== undefined ? { payload: msg.payload } : {}),
    ...(msg.frameLabel !== undefined ? { frameLabel: msg.frameLabel } : {}),
    ...(msg.stepFrames !== undefined ? { stepFrames: msg.stepFrames } : {}),
    ...(msg.currentFrame !== undefined ? { currentFrame: msg.currentFrame } : {}),
    ...(msg.totalFrames !== undefined ? { totalFrames: msg.totalFrames } : {}),
    ...(msg.frameCount !== undefined ? { frameCount: msg.frameCount } : {}),
    ...(msg.title !== undefined ? { title: msg.title } : {}),
    ...(msg.nodeToFrame !== undefined ? { nodeToFrame: msg.nodeToFrame } : {}),
    ...(msg.id !== undefined ? { id: msg.id } : {}),
    ...(msg.viewport !== undefined ? { viewport: msg.viewport } : {}),
  });
}

/** Broadcast a step-frames event. Used by both append_frame (partial) and commit_step_frames (final). */
export function broadcastStepFrames(
  frames: Array<{ payload: string; label?: string; type?: string }>,
  frameType: string,
  currentFrame: number,
  title?: string,
  id?: string
): void {
  broadcastReplace({
    type: frames[currentFrame].type ?? frameType,
    payload: frames[currentFrame].payload,
    frameLabel: frames[currentFrame].label,
    stepFrames: true,
    currentFrame,
    totalFrames: frames.length,
    title,
    id,
  });
}
