// In-memory canvas state — single canvas, no persistence in v1.
// Also tracks the workspace from the most recent render() call (used by history endpoints).
//
// Unified reducer (U3, v0.26 Sprint 40): a single Presentation + cursor +
// driver model replaces the old 3-way CanvasState union (empty | single-type
// | step-frames) — "step-frames" is no longer a branch anywhere in this file.
// Every render becomes a Presentation of one or more Frames; `driver` records
// whether the cursor moves ("manual", via step()/seek()) or is fixed
// ("static", a single-frame render). `driver: "timed"` is reserved for the
// slideshow-controller distinction a later sprint introduces — today
// slideshow ticks reuse "manual" so that Prev/Next navigation during a
// slideshow keeps working exactly as it did before this refactor (F7).

import type { Frame, Presentation } from "./presentation.js";

export type CanvasType = "mermaid" | "svg" | "html" | "katex" | "vega-lite";
export type Driver = "static" | "manual" | "timed";

/** Input shape for setStepFrames() — a frame's `type` is optional, defaulting to the sequence's frameType. */
export interface StepFrame {
  label?: string;
  payload: string;
  type?: string;
}

export interface CanvasState {
  presentation: Presentation | null;
  driver: Driver;
  /** Verbatim step-frames envelope JSON — needed only for export()'s "return the exact last payload" contract (F16/V2); not reconstructable from the resolved Frame array once per-frame types are baked in. */
  rawPayload?: string;
  /** Original top-level frame_type from the step-frames envelope. Individual frames already carry their own resolved type (see setStepFrames); this is kept only to reassemble the canonical { frame_type, frames } JSON shape (assembleStepFramesPayload) byte-for-byte like before this refactor. */
  frameType?: string;
  nodeToFrame?: Record<string, number>;
}

/**
 * Narrows a CanvasState to "a navigable multi-frame sequence is loaded" —
 * the replacement for the old `canvas.type === "step-frames"` check, now
 * expressed on the driver axis instead of a content-type tag.
 */
export function isStepSequence(
  state: CanvasState
): state is CanvasState & { presentation: Presentation; rawPayload: string; frameType: string } {
  return state.presentation !== null && state.driver === "manual";
}

let canvas: CanvasState = { presentation: null, driver: "static" };
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

export function setCanvas(type: CanvasType, payload: string, title?: string, id?: string): void {
  const presentation: Presentation = {
    cursor: 0,
    frames: [{ type, payload }],
    ...(title !== undefined ? { title } : {}),
    ...(id !== undefined ? { id } : {}),
  };
  canvas = { presentation, driver: "static" };
}

export function setStepFrames(
  frames: StepFrame[],
  frameType: string,
  rawPayload: string,
  title?: string,
  nodeToFrame?: Record<string, number>,
  id?: string
): void {
  const resolvedFrames: Frame[] = frames.map((f) => ({
    type: f.type ?? frameType,
    payload: f.payload,
    ...(f.label !== undefined ? { label: f.label } : {}),
  }));
  const presentation: Presentation = {
    cursor: 0,
    frames: resolvedFrames,
    ...(title !== undefined ? { title } : {}),
    ...(id !== undefined ? { id } : {}),
  };
  canvas = {
    presentation,
    driver: "manual",
    rawPayload,
    frameType,
    ...(nodeToFrame !== undefined ? { nodeToFrame } : {}),
  };
}

/**
 * Seek to a specific frame index in the loaded step-frames sequence.
 * Used by the slideshow expander to advance the cursor to an arbitrary frame
 * without resetting the full sequence. No-op if no step-frames sequence is loaded.
 */
export function seekStepFrame(index: number): void {
  if (!isStepSequence(canvas)) return;
  canvas = { ...canvas, presentation: { ...canvas.presentation, cursor: index } };
}

/**
 * Advance or rewind the step cursor.
 * Returns the new cursor state, or null if no step-frames sequence is loaded.
 */
export function stepCursor(direction: "next" | "prev"): { currentFrame: number; totalFrames: number } | null {
  if (!isStepSequence(canvas)) return null;
  const total = canvas.presentation.frames.length;
  const next = direction === "next"
    ? Math.min(canvas.presentation.cursor + 1, total - 1)
    : Math.max(canvas.presentation.cursor - 1, 0);
  canvas = { ...canvas, presentation: { ...canvas.presentation, cursor: next } };
  return { currentFrame: next, totalFrames: total };
}

export function clearCanvas(): void {
  canvas = { presentation: null, driver: "static" };
}

/** Returns the current source spec, or empty string if canvas is blank. */
export function exportCanvas(): string {
  if (canvas.presentation === null) return "";
  if (canvas.rawPayload !== undefined) return canvas.rawPayload;
  return canvas.presentation.frames[0]?.payload ?? "";
}

/** Reset canvas to empty — for use in tests only. */
export function resetCanvas(): void {
  canvas = { presentation: null, driver: "static" };
}

/** Reset lastWorkspace to empty string — for use in tests only. */
export function resetLastWorkspace(): void {
  lastWorkspace = "";
}
