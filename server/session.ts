// In-memory canvas state — single canvas, no persistence in v1.
// Also tracks the workspace from the most recent render() call (used by history endpoints).

export type CanvasType = "mermaid" | "svg" | "html" | "katex" | "vega-lite";

export interface StepFrame {
  label?: string;
  payload: string;
  /** Optional per-frame content type override; defaults to the sequence's frameType when absent. */
  type?: string;
}

export type CanvasState =
  | { type: CanvasType; payload: string; title?: string }
  | { type: "step-frames"; frames: StepFrame[]; frameType: string; currentFrame: number; rawPayload: string; title?: string; nodeToFrame?: Record<string, number> }
  | { type: "empty" };

let canvas: CanvasState = { type: "empty" };
let lastWorkspace = "";

export function getCanvas(): CanvasState {
  return canvas;
}

export function getLastWorkspace(): string {
  return lastWorkspace;
}

export function setLastWorkspace(workspace: string): void {
  lastWorkspace = workspace;
}

export function setCanvas(type: CanvasType, payload: string, title?: string): void {
  canvas = { type, payload, ...(title !== undefined ? { title } : {}) };
}

export function setStepFrames(frames: StepFrame[], frameType: string, rawPayload: string, title?: string, nodeToFrame?: Record<string, number>): void {
  canvas = { type: "step-frames", frames, frameType, currentFrame: 0, rawPayload, ...(title !== undefined ? { title } : {}), ...(nodeToFrame !== undefined ? { nodeToFrame } : {}) };
}

/**
 * Seek to a specific frame index in the loaded step-frames sequence.
 * Used by the slideshow expander to advance the cursor to an arbitrary frame
 * without resetting the full sequence. No-op if no step-frames sequence is loaded.
 */
export function seekStepFrame(index: number): void {
  if (canvas.type !== "step-frames") return;
  canvas = { ...canvas, currentFrame: index };
}

/**
 * Advance or rewind the step cursor.
 * Returns the new cursor state, or null if no step-frames sequence is loaded.
 */
export function stepCursor(direction: "next" | "prev"): { currentFrame: number; totalFrames: number } | null {
  if (canvas.type !== "step-frames") return null;
  const total = canvas.frames.length;
  const next = direction === "next"
    ? Math.min(canvas.currentFrame + 1, total - 1)
    : Math.max(canvas.currentFrame - 1, 0);
  canvas = { ...canvas, currentFrame: next };
  return { currentFrame: next, totalFrames: total };
}

export function clearCanvas(): void {
  canvas = { type: "empty" };
}

/** Returns the current source spec, or empty string if canvas is blank. */
export function exportCanvas(): string {
  if (canvas.type === "empty") return "";
  if (canvas.type === "step-frames") return canvas.rawPayload;
  return canvas.payload;
}

/** Reset canvas to empty — for use in tests only. */
export function resetCanvas(): void {
  canvas = { type: "empty" };
}

/** Reset lastWorkspace to empty string — for use in tests only. */
export function resetLastWorkspace(): void {
  lastWorkspace = "";
}
