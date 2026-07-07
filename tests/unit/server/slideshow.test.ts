import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { broadcast } from "../../../server/ws.js";
import { cancelSlideshow, isSlideshowRunning, startSlideshow } from "../../../server/slideshow.js";
import { getCanvas, resetCanvas } from "../../../server/session.js";
import { saveSnapshot } from "../../../server/snapshot.js";

vi.mock("../../../server/ws.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("../../../server/snapshot.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/snapshot.js")>();
  return { ...actual, saveSnapshot: vi.fn() };
});

const WORKSPACE = "test-workspace";

describe("slideshow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(broadcast).mockClear();
    vi.mocked(saveSnapshot).mockClear();
  });

  afterEach(() => {
    cancelSlideshow({ persist: false });
    resetCanvas();
    vi.useRealTimers();
  });

  it("broadcasts the first slide immediately and does not start a timer for a single slide", () => {
    startSlideshow([{ type: "svg", payload: "<svg/>" }], 1000, WORKSPACE);

    expect(broadcast).toHaveBeenCalledTimes(1);
    // A fresh id is required on every slide broadcast — without it the browser's
    // isNewSnapshot() check never fires and Mermaid diagrams never auto-fit (F19/C3).
    expect(broadcast).toHaveBeenCalledWith({
      action: "replace",
      type: "svg",
      payload: "<svg/>",
      id: expect.any(String),
    });
    expect(isSlideshowRunning()).toBe(false);
  });

  it("auto-advances through multiple slides at delay_ms intervals, each with its own fresh id, and stops after the last", () => {
    startSlideshow(
      [
        { type: "svg", payload: "<svg>1</svg>" },
        { type: "svg", payload: "<svg>2</svg>" },
        { type: "svg", payload: "<svg>3</svg>" },
      ],
      1000,
      WORKSPACE
    );
    expect(isSlideshowRunning()).toBe(true);
    expect(broadcast).toHaveBeenCalledTimes(1);
    const id1 = vi.mocked(broadcast).mock.calls[0][0].id;
    expect(id1).toEqual(expect.any(String));

    vi.advanceTimersByTime(1000);
    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenLastCalledWith({ action: "replace", type: "svg", payload: "<svg>2</svg>", id: expect.any(String) });
    const id2 = vi.mocked(broadcast).mock.calls[1][0].id;
    expect(id2).not.toBe(id1); // distinct slides get distinct ids
    expect(isSlideshowRunning()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(broadcast).toHaveBeenCalledTimes(3);
    expect(broadcast).toHaveBeenLastCalledWith({ action: "replace", type: "svg", payload: "<svg>3</svg>", id: expect.any(String) });
    expect(isSlideshowRunning()).toBe(false);

    // No further ticks after the last slide.
    vi.advanceTimersByTime(5000);
    expect(broadcast).toHaveBeenCalledTimes(3);
  });

  it("expands a step-frames slide into one tick per frame, reusing the same id across frames", () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [{ payload: "graph A" }, { payload: "graph B" }],
    });
    startSlideshow([{ type: "step-frames", payload, title: "Seq" }], 500, WORKSPACE);

    expect(broadcast).toHaveBeenCalledTimes(1);
    const frame0Call = vi.mocked(broadcast).mock.calls[0][0];
    expect(frame0Call).toEqual({
      action: "replace",
      type: "mermaid",
      payload: "graph A",
      frameLabel: undefined,
      stepFrames: true,
      currentFrame: 0,
      totalFrames: 2,
      title: "Seq",
      id: expect.any(String),
    });
    expect(isSlideshowRunning()).toBe(true);

    vi.advanceTimersByTime(500);
    // Same id as frame 0 — this is a continuation of the same sequence, not a
    // new diagram, so the browser must not re-fit (F19/C3).
    expect(broadcast).toHaveBeenLastCalledWith({
      action: "replace",
      type: "mermaid",
      payload: "graph B",
      frameLabel: undefined,
      stepFrames: true,
      currentFrame: 1,
      totalFrames: 2,
      title: "Seq",
      id: frame0Call.id,
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
      1000,
      WORKSPACE
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
      1000,
      WORKSPACE
    );
    startSlideshow([{ type: "svg", payload: "<svg>new</svg>" }], 1000, WORKSPACE);

    expect(broadcast).toHaveBeenLastCalledWith({ action: "replace", type: "svg", payload: "<svg>new</svg>", id: expect.any(String) });
    expect(isSlideshowRunning()).toBe(false);

    // The cancelled first slideshow's timer must not fire.
    const callsBefore = vi.mocked(broadcast).mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(vi.mocked(broadcast).mock.calls.length).toBe(callsBefore);
  });

  // ── Finalize-on-end persistence (v0.22) ─────────────────────────────────────
  // Individual ticks never touch disk — only the state left on screen when the
  // slideshow session ends (naturally, stopped, or superseded) gets persisted,
  // once, mirroring commit_step_frames()'s "transient until finalized" pattern.

  describe("finalize-on-end persistence", () => {
    it("persists nothing while a multi-tick slideshow is still running", () => {
      startSlideshow(
        [
          { type: "svg", payload: "<svg>1</svg>" },
          { type: "svg", payload: "<svg>2</svg>" },
        ],
        1000,
        WORKSPACE
      );
      expect(saveSnapshot).not.toHaveBeenCalled();
    });

    it("persists exactly once, with the last slide's content, on natural completion", () => {
      startSlideshow(
        [
          { type: "svg", payload: "<svg>1</svg>" },
          { type: "svg", payload: "<svg>2</svg>" },
        ],
        1000,
        WORKSPACE
      );
      vi.advanceTimersByTime(1000); // last tick fires — slideshow completes naturally
      expect(saveSnapshot).toHaveBeenCalledTimes(1);
      expect(saveSnapshot).toHaveBeenCalledWith(
        "svg",
        "<svg>2</svg>",
        { title: undefined, workspace: WORKSPACE },
        expect.any(String)
      );
    });

    it("persists a step-frames slide as one assembled sequence, not per frame", () => {
      const payload = JSON.stringify({
        frame_type: "mermaid",
        frames: [{ payload: "graph A" }, { payload: "graph B" }, { payload: "graph C" }],
      });
      startSlideshow([{ type: "step-frames", payload, title: "Seq" }], 500, WORKSPACE);
      vi.advanceTimersByTime(500); // frame 1
      expect(saveSnapshot).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500); // frame 2 (last) — natural completion
      expect(saveSnapshot).toHaveBeenCalledTimes(1);
      expect(saveSnapshot).toHaveBeenCalledWith(
        "step-frames",
        payload,
        { title: "Seq", workspace: WORKSPACE },
        expect.any(String)
      );
    });

    it("persists on explicit cancelSlideshow (slideshow_stop)", () => {
      startSlideshow(
        [
          { type: "svg", payload: "<svg>1</svg>" },
          { type: "svg", payload: "<svg>2</svg>" },
        ],
        1000,
        WORKSPACE
      );
      cancelSlideshow();
      expect(saveSnapshot).toHaveBeenCalledTimes(1);
      expect(saveSnapshot).toHaveBeenCalledWith(
        "svg",
        "<svg>1</svg>",
        { title: undefined, workspace: WORKSPACE },
        expect.any(String)
      );
    });

    it("persists a single-tick slideshow's content once it is later cancelled", () => {
      startSlideshow([{ type: "svg", payload: "<svg>only</svg>" }], 1000, WORKSPACE);
      expect(saveSnapshot).not.toHaveBeenCalled(); // no timer, but session stays open
      cancelSlideshow();
      expect(saveSnapshot).toHaveBeenCalledTimes(1);
    });

    it("persists the outgoing slideshow's last state when a new startSlideshow supersedes it", () => {
      startSlideshow([{ type: "svg", payload: "<svg>old</svg>" }], 1000, WORKSPACE);
      startSlideshow([{ type: "svg", payload: "<svg>new</svg>" }], 1000, WORKSPACE);
      expect(saveSnapshot).toHaveBeenCalledTimes(1);
      expect(saveSnapshot).toHaveBeenCalledWith(
        "svg",
        "<svg>old</svg>",
        { title: undefined, workspace: WORKSPACE },
        expect.any(String)
      );
    });

    it("does not persist when cancelSlideshow is called with { persist: false } (clear())", () => {
      startSlideshow([{ type: "svg", payload: "<svg>1</svg>" }], 1000, WORKSPACE);
      cancelSlideshow({ persist: false });
      expect(saveSnapshot).not.toHaveBeenCalled();
    });

    it("is a no-op when nothing is running", () => {
      cancelSlideshow();
      expect(saveSnapshot).not.toHaveBeenCalled();
    });
  });
});
