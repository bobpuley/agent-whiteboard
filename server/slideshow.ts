// Slideshow — server-side timer that auto-advances slides on the canvas.
// Phase 2 feature (Sprint 9).

import { broadcastReplace, broadcastStepFrames } from "./ws.js";
import { getCanvas, setCanvas, setStepFrames, seekStepFrame } from "./session.js";
import { generateSnapshotId, saveSnapshot } from "./snapshot.js";
import type { CanvasType, StepFrame } from "./session.js";

export interface Slide {
  type: string;
  payload: string;
  title?: string;
}

// ── Internal tick representation ───────────────────────────────────────────────

// A "tick" is one timer unit: either a plain slide or a single frame within a
// step-frames sequence.  step-frames slides are expanded into N ticks (one per
// frame) before the timer starts, so the timer loop is uniform.

type SlideTick = { kind: "slide"; slide: Slide };
type FrameTick = {
  kind: "frame";
  frames: StepFrame[];
  frameType: string;
  rawPayload: string;
  frameIndex: number;
  title?: string;
};
type Tick = SlideTick | FrameTick;

function expandSlides(slides: Slide[]): Tick[] {
  const ticks: Tick[] = [];
  for (const slide of slides) {
    if (slide.type === "step-frames") {
      const spec = JSON.parse(slide.payload) as { frame_type: string; frames: StepFrame[] };
      for (let i = 0; i < spec.frames.length; i++) {
        ticks.push({
          kind: "frame",
          frames: spec.frames,
          frameType: spec.frame_type,
          rawPayload: slide.payload,
          frameIndex: i,
          title: slide.title,
        });
      }
    } else {
      ticks.push({ kind: "slide", slide });
    }
  }
  return ticks;
}

function broadcastTick(tick: Tick): void {
  if (tick.kind === "slide") {
    broadcastSlide(tick.slide);
    return;
  }

  const { frames, frameType, rawPayload, frameIndex, title } = tick;
  if (frameIndex === 0) {
    // First frame: initialise full step-frames session state with a fresh id
    // so the browser auto-fits (F19/C3) — same contract as commitRenderResult().
    // Without an id here, isNewSnapshot() on the client is always false and the
    // diagram never fits to view (stays at the default scale/position).
    setStepFrames(frames, frameType, rawPayload, title, undefined, generateSnapshotId());
  } else {
    // Subsequent frames: seek cursor without resetting the sequence; the id
    // set on frame 0 is echoed below so the browser treats this as a
    // continuation, not a new diagram (F19/C3).
    seekStepFrame(frameIndex);
  }
  const state = getCanvas();
  const id = state.type === "step-frames" ? state.id : undefined;
  broadcastStepFrames(frames, frameType, frameIndex, title, id);
}

function broadcastSlide(slide: Slide): void {
  if (slide.type === "step-frames") {
    // Unpack step-frames: store all frames in session and broadcast frame 0.
    // (Unreachable via startSlideshow() today — expandSlides() always turns a
    // step-frames slide into per-frame ticks — kept correct in case this
    // function gains another caller.)
    const spec = JSON.parse(slide.payload) as { frame_type: string; frames: StepFrame[] };
    const { frames, frame_type } = spec;
    const id = generateSnapshotId();
    setStepFrames(frames, frame_type, slide.payload, slide.title, undefined, id);
    broadcastStepFrames(frames, frame_type, 0, slide.title, id);
  } else {
    // Fresh id per plain slide so the browser auto-fits (F19/C3) — without
    // this the diagram never fits to view (stays at default scale/position).
    const id = generateSnapshotId();
    setCanvas(slide.type as CanvasType, slide.payload, slide.title, id);
    broadcastReplace({ type: slide.type, payload: slide.payload, title: slide.title, id });
  }
}

let activeTimer: ReturnType<typeof setInterval> | null = null;
// Set for the lifetime of a slideshow "session" — from startSlideshow() until
// the next cancelSlideshow() — even for a single-tick slideshow that never
// starts a timer. Used only to know where to persist the finalize snapshot.
let activeWorkspace: string | undefined;

/**
 * Persists whatever is currently on the canvas as a single snapshot, once,
 * when a slideshow session ends (naturally or by cancellation) — mirroring
 * commit_step_frames()'s "transient until finalized" pattern (F15): individual
 * ticks never touch disk, only this final state does. No-op if no slideshow
 * session is active, the canvas is empty, or (F10) the write itself fails —
 * a persistence failure must never block anything else.
 */
function finalizeSlideshow(): void {
  if (activeWorkspace === undefined) return;
  const canvas = getCanvas();
  if (canvas.type === "empty") return;

  if (canvas.type === "step-frames") {
    const payload = JSON.stringify({ frame_type: canvas.frameType, frames: canvas.frames });
    saveSnapshot("step-frames", payload, { title: canvas.title, workspace: activeWorkspace }, canvas.id ?? generateSnapshotId());
  } else {
    saveSnapshot(canvas.type, canvas.payload, { title: canvas.title, workspace: activeWorkspace }, canvas.id ?? generateSnapshotId());
  }
}

/**
 * Start a slideshow.
 * step-frames slides are expanded into per-frame ticks so each frame advances
 * automatically at delay_ms intervals — no manual navigation required.
 * Stops after the last tick (no loop). Cancels any previously running slideshow.
 */
export function startSlideshow(slides: Slide[], delay_ms: number, workspace: string): void {
  cancelSlideshow(); // finalizes + ends any previous session

  const ticks = expandSlides(slides);
  activeWorkspace = workspace;

  broadcastTick(ticks[0]);

  if (ticks.length === 1) return; // single tick — no timer needed, but the session
  // stays open (unfinalized) until the next cancelSlideshow() call

  let index = 1;
  activeTimer = setInterval(() => {
    broadcastTick(ticks[index]);
    index++;
    if (index >= ticks.length) {
      cancelSlideshow(); // natural completion
    }
  }, delay_ms);
}

/**
 * Cancel any running slideshow timer and end the current session. Last
 * rendered tick stays on screen. By default this also finalizes (persists)
 * that last tick as a single snapshot — the one exception is `clear()`,
 * which must never produce a snapshot (F10); its call site passes
 * `{ persist: false }`.
 */
export function cancelSlideshow(options: { persist?: boolean } = {}): void {
  const { persist = true } = options;
  const wasActive = activeTimer !== null || activeWorkspace !== undefined;
  if (wasActive && persist) finalizeSlideshow();
  if (activeTimer !== null) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
  activeWorkspace = undefined;
}

export function isSlideshowRunning(): boolean {
  return activeTimer !== null;
}
