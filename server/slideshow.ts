// Slideshow — server-side timer that auto-advances slides on the canvas.
// Phase 2 feature (Sprint 9).

import { broadcast } from "./ws.js";
import { setCanvas, setStepFrames } from "./session.js";
import type { CanvasType, StepFrame } from "./session.js";

export interface Slide {
  type: string;
  payload: string;
  title?: string;
}

let activeTimer: ReturnType<typeof setInterval> | null = null;

function broadcastSlide(slide: Slide): void {
  if (slide.type === "step-frames") {
    // Unpack step-frames: store all frames in session and broadcast frame 0.
    const spec = JSON.parse(slide.payload) as { frame_type: string; frames: StepFrame[] };
    const { frames, frame_type } = spec;
    setStepFrames(frames, frame_type, slide.payload, slide.title);
    broadcast({
      action: "replace",
      type: frame_type,
      payload: frames[0].payload,
      frameLabel: frames[0].label,
      stepFrames: true,
      currentFrame: 0,
      totalFrames: frames.length,
      ...(slide.title !== undefined ? { title: slide.title } : {}),
    });
  } else {
    setCanvas(slide.type as CanvasType, slide.payload, slide.title);
    broadcast({
      action: "replace",
      type: slide.type,
      payload: slide.payload,
      ...(slide.title !== undefined ? { title: slide.title } : {}),
    });
  }
}

/**
 * Start a slideshow.
 * Broadcasts the first slide immediately, then advances on the timer.
 * Stops after the last slide (no loop).
 * Cancels any previously running slideshow.
 */
export function startSlideshow(slides: Slide[], delay_ms: number): void {
  cancelSlideshow();

  broadcastSlide(slides[0]);

  if (slides.length === 1) return; // single slide — no timer needed

  let index = 1;
  activeTimer = setInterval(() => {
    broadcastSlide(slides[index]);
    index++;
    if (index >= slides.length) {
      cancelSlideshow();
    }
  }, delay_ms);
}

/** Cancel any running slideshow timer. Last rendered slide stays on screen. */
export function cancelSlideshow(): void {
  if (activeTimer !== null) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
}

export function isSlideshowRunning(): boolean {
  return activeTimer !== null;
}
