// Slideshow — server-side timer that auto-advances slides on the canvas.
// Phase 2 feature (Sprint 9). Slides are single frames only (v0.26 Sprint 45)
// — a slide can no longer itself be a step-frames sequence; that expansion
// path was removed along with "step-frames" as a top-level content type.

import { broadcastReplace } from "./ws.js";
import { getCanvas, setCanvas } from "./session.js";
import { generateSnapshotId } from "./snapshot-writer.js";
import { persistContent } from "./persist.js";
import type { CanvasType } from "./session.js";

export interface Slide {
  type: CanvasType;
  payload: string;
  title?: string;
}

function broadcastSlide(slide: Slide): void {
  // Fresh id per slide so the browser auto-fits (F19/C3) — without this the
  // diagram never fits to view (stays at default scale/position).
  const id = generateSnapshotId();
  setCanvas(slide.type, slide.payload, slide.title, id);
  broadcastReplace({ type: slide.type, payload: slide.payload, title: slide.title, id, cursor: 0, total: 1 });
}

let activeTimer: ReturnType<typeof setInterval> | null = null;
// Set for the lifetime of a slideshow "session" — from startSlideshow() until
// the next cancelSlideshow() — even for a single-slide slideshow that never
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
  if (canvas.presentation === null) return;

  const { frames, title, id } = canvas.presentation;
  persistContent("slideshow-end", {
    frames,
    title,
    workspace: activeWorkspace,
    id: id ?? generateSnapshotId(),
  });
}

/**
 * Start a slideshow. Stops after the last slide (no loop). Cancels any
 * previously running slideshow.
 */
export function startSlideshow(slides: Slide[], delay_ms: number, workspace: string): void {
  cancelSlideshow(); // finalizes + ends any previous session

  activeWorkspace = workspace;

  broadcastSlide(slides[0]);

  if (slides.length === 1) return; // single slide — no timer needed, but the session
  // stays open (unfinalized) until the next cancelSlideshow() call

  let index = 1;
  activeTimer = setInterval(() => {
    broadcastSlide(slides[index]);
    index++;
    if (index >= slides.length) {
      cancelSlideshow(); // natural completion
    }
  }, delay_ms);
}

/**
 * Cancel any running slideshow timer and end the current session. Last
 * rendered slide stays on screen. By default this also finalizes (persists)
 * that last slide as a single snapshot — the one exception is `clear()`,
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
