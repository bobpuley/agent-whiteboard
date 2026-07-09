// WebSocket push to all connected browser clients.

import type WebSocket from "ws";
import { getDoneArmed, setBroadcastFn } from "./interaction.js";
import type { Viewport } from "./viewport-cache.js";

const clients = new Set<WebSocket>();

// Wire up the broadcast function so interaction.ts can push state changes
// without a circular import.
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
 * cursor/total) can no longer silently be missing from another broadcast
 * producer — this is the structural fix for the B15/C2b/C2d drift class
 * (docs/05, Milestone_v0.23).
 *
 * Content replaces and the `init_step_frames()` 0-frame placeholder are two
 * genuinely different shapes (the placeholder has no content yet), modeled
 * as a discriminated union rather than an all-optional bag of fields.
 *
 * `id`/`cursor`/`total` are mandatory on every content replace (v0.26 Sprint
 * 42, U3/D3) — they replace the old `stepFrames` boolean flag entirely. A
 * one-shot render is `cursor: 0, total: 1`; a step-frames frame is `cursor:
 * N, total: M`. The client derives step-bar visibility from `total > 1`
 * rather than a separate driver flag (a 1-frame step-frames sequence is
 * indistinguishable from a one-shot render and needs no navigation UI).
 */
export type ReplaceBroadcast =
  | {
      type: string;
      payload: string;
      id: string;
      cursor: number;
      total: number;
      frameLabel?: string;
      title?: string;
      nodeToFrame?: Record<string, number>;
      viewport?: Viewport;
    }
  | {
      type: "step-frames-placeholder";
      frameCount: number;
      title?: string;
    };

export function broadcastReplace(msg: ReplaceBroadcast): void {
  if (!("payload" in msg)) {
    broadcast({
      action: "replace",
      type: msg.type,
      frameCount: msg.frameCount,
      ...(msg.title !== undefined ? { title: msg.title } : {}),
    });
    return;
  }
  broadcast({
    action: "replace",
    type: msg.type,
    payload: msg.payload,
    id: msg.id,
    cursor: msg.cursor,
    total: msg.total,
    ...(msg.frameLabel !== undefined ? { frameLabel: msg.frameLabel } : {}),
    ...(msg.title !== undefined ? { title: msg.title } : {}),
    ...(msg.nodeToFrame !== undefined ? { nodeToFrame: msg.nodeToFrame } : {}),
    ...(msg.viewport !== undefined ? { viewport: msg.viewport } : {}),
  });
}

/**
 * Broadcast a step-frames event. Used by append_frame (partial), commit_step_frames
 * (final), and /step's (REST + MCP) frame-advance broadcast.
 * `nodeToFrame` (v0.26.1, bug B18 in docs/01): this wrapper previously had no slot
 * for it at all, so every call site silently dropped the map even when the caller
 * had one — the exact drift the v0.23 broadcastReplace() unification was meant to
 * prevent, reintroduced one layer up. See docs/02 C2e.
 */
export function broadcastStepFrames(
  frames: Array<{ payload: string; label?: string; type?: string }>,
  frameType: string,
  cursor: number,
  id: string,
  title?: string,
  nodeToFrame?: Record<string, number>
): void {
  broadcastReplace({
    type: frames[cursor].type ?? frameType,
    payload: frames[cursor].payload,
    frameLabel: frames[cursor].label,
    cursor,
    total: frames.length,
    id,
    title,
    nodeToFrame,
  });
}
