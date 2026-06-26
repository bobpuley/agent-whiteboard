// WebSocket push to all connected browser clients.

import type WebSocket from "ws";

const clients = new Set<WebSocket>();

export function addClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
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
  frames: Array<{ payload: string; label?: string }>,
  frameType: string,
  currentFrame: number,
  title?: string
): void {
  broadcast({
    action: "replace",
    type: frameType,
    payload: frames[currentFrame].payload,
    frameLabel: frames[currentFrame].label,
    stepFrames: true,
    currentFrame,
    totalFrames: frames.length,
    ...(title !== undefined ? { title } : {}),
  });
}
