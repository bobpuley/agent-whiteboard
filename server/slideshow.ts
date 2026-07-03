// Slideshow — server-side timer that auto-advances slides on the canvas.
// Phase 2 feature (Sprint 9).

import { broadcast } from "./ws.js";
import { setCanvas, setStepFrames, seekStepFrame } from "./session.js";
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
    // First frame: initialise full step-frames session state.
    setStepFrames(frames, frameType, rawPayload, title);
  } else {
    // Subsequent frames: seek cursor without resetting the sequence.
    seekStepFrame(frameIndex);
  }
  broadcast({
    action: "replace",
    type: frames[frameIndex].type ?? frameType,
    payload: frames[frameIndex].payload,
    frameLabel: frames[frameIndex].label,
    stepFrames: true,
    currentFrame: frameIndex,
    totalFrames: frames.length,
    ...(title !== undefined ? { title } : {}),
  });
}

function broadcastSlide(slide: Slide): void {
  if (slide.type === "step-frames") {
    // Unpack step-frames: store all frames in session and broadcast frame 0.
    const spec = JSON.parse(slide.payload) as { frame_type: string; frames: StepFrame[] };
    const { frames, frame_type } = spec;
    setStepFrames(frames, frame_type, slide.payload, slide.title);
    broadcast({
      action: "replace",
      type: frames[0].type ?? frame_type,
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

let activeTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a slideshow.
 * step-frames slides are expanded into per-frame ticks so each frame advances
 * automatically at delay_ms intervals — no manual navigation required.
 * Stops after the last tick (no loop). Cancels any previously running slideshow.
 */
export function startSlideshow(slides: Slide[], delay_ms: number): void {
  cancelSlideshow();

  const ticks = expandSlides(slides);

  broadcastTick(ticks[0]);

  if (ticks.length === 1) return; // single tick — no timer needed

  let index = 1;
  activeTimer = setInterval(() => {
    broadcastTick(ticks[index]);
    index++;
    if (index >= ticks.length) {
      cancelSlideshow();
    }
  }, delay_ms);
}

/** Cancel any running slideshow timer. Last rendered tick stays on screen. */
export function cancelSlideshow(): void {
  if (activeTimer !== null) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
}

export function isSlideshowRunning(): boolean {
  return activeTimer !== null;
}
