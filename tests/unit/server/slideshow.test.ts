import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { broadcast } from "../../../server/ws.js";
import { cancelSlideshow, isSlideshowRunning, startSlideshow } from "../../../server/slideshow.js";
import { getCanvas, resetCanvas } from "../../../server/session.js";

vi.mock("../../../server/ws.js", () => ({
  broadcast: vi.fn(),
}));

describe("slideshow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(broadcast).mockClear();
  });

  afterEach(() => {
    cancelSlideshow();
    resetCanvas();
    vi.useRealTimers();
  });

  it("broadcasts the first slide immediately and does not start a timer for a single slide", () => {
    startSlideshow([{ type: "svg", payload: "<svg/>" }], 1000);

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith({ action: "replace", type: "svg", payload: "<svg/>" });
    expect(isSlideshowRunning()).toBe(false);
  });

  it("auto-advances through multiple slides at delay_ms intervals and stops after the last", () => {
    startSlideshow(
      [
        { type: "svg", payload: "<svg>1</svg>" },
        { type: "svg", payload: "<svg>2</svg>" },
        { type: "svg", payload: "<svg>3</svg>" },
      ],
      1000
    );
    expect(isSlideshowRunning()).toBe(true);
    expect(broadcast).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenLastCalledWith({ action: "replace", type: "svg", payload: "<svg>2</svg>" });
    expect(isSlideshowRunning()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(broadcast).toHaveBeenCalledTimes(3);
    expect(broadcast).toHaveBeenLastCalledWith({ action: "replace", type: "svg", payload: "<svg>3</svg>" });
    expect(isSlideshowRunning()).toBe(false);

    // No further ticks after the last slide.
    vi.advanceTimersByTime(5000);
    expect(broadcast).toHaveBeenCalledTimes(3);
  });

  it("expands a step-frames slide into one tick per frame", () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [{ payload: "graph A" }, { payload: "graph B" }],
    });
    startSlideshow([{ type: "step-frames", payload, title: "Seq" }], 500);

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenLastCalledWith({
      action: "replace",
      type: "mermaid",
      payload: "graph A",
      frameLabel: undefined,
      stepFrames: true,
      currentFrame: 0,
      totalFrames: 2,
      title: "Seq",
    });
    expect(isSlideshowRunning()).toBe(true);

    vi.advanceTimersByTime(500);
    expect(broadcast).toHaveBeenLastCalledWith({
      action: "replace",
      type: "mermaid",
      payload: "graph B",
      frameLabel: undefined,
      stepFrames: true,
      currentFrame: 1,
      totalFrames: 2,
      title: "Seq",
    });
    expect(isSlideshowRunning()).toBe(false);

    const canvas = getCanvas();
    expect(canvas.type === "step-frames" && canvas.currentFrame).toBe(1);
  });

  it("cancelSlideshow stops the timer and leaves the last tick on screen", () => {
    startSlideshow(
      [
        { type: "svg", payload: "<svg>1</svg>" },
        { type: "svg", payload: "<svg>2</svg>" },
      ],
      1000
    );
    cancelSlideshow();
    expect(isSlideshowRunning()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(broadcast).toHaveBeenCalledTimes(1); // only the initial broadcast
  });

  it("a new startSlideshow call cancels any previously running slideshow", () => {
    startSlideshow(
      [
        { type: "svg", payload: "<svg>1</svg>" },
        { type: "svg", payload: "<svg>2</svg>" },
      ],
      1000
    );
    startSlideshow([{ type: "svg", payload: "<svg>new</svg>" }], 1000);

    expect(broadcast).toHaveBeenLastCalledWith({ action: "replace", type: "svg", payload: "<svg>new</svg>" });
    expect(isSlideshowRunning()).toBe(false);

    // The cancelled first slideshow's timer must not fire.
    const callsBefore = vi.mocked(broadcast).mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(vi.mocked(broadcast).mock.calls.length).toBe(callsBefore);
  });
});
