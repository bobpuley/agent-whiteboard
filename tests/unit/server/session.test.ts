import { afterEach, describe, expect, it } from "vitest";
import {
  clearCanvas,
  exportCanvas,
  getCanvas,
  getLastWorkspace,
  isStepSequence,
  resetCanvas,
  resetLastWorkspace,
  seekStepFrame,
  setCanvas,
  setLastWorkspace,
  setStepFrames,
  stepCursor,
} from "../../../server/session.js";

describe("session", () => {
  afterEach(() => {
    resetCanvas();
    resetLastWorkspace();
  });

  it("starts empty", () => {
    expect(getCanvas()).toEqual({ presentation: null, driver: "static" });
    expect(exportCanvas()).toBe("");
  });

  it("setCanvas builds a single-frame static Presentation, reflected by exportCanvas", () => {
    setCanvas("mermaid", "graph TD; A-->B", "My Title", "id-1");
    expect(getCanvas()).toEqual({
      presentation: { cursor: 0, frames: [{ type: "mermaid", payload: "graph TD; A-->B" }], title: "My Title", id: "id-1" },
      driver: "static",
    });
    expect(exportCanvas()).toBe("graph TD; A-->B");
  });

  it("setCanvas omits title/id from the presentation when absent", () => {
    setCanvas("svg", "<svg/>");
    expect(getCanvas()).toEqual({
      presentation: { cursor: 0, frames: [{ type: "svg", payload: "<svg/>" }] },
      driver: "static",
    });
  });

  it("isStepSequence is false for a static (single-frame) canvas", () => {
    setCanvas("mermaid", "graph TD; A-->B");
    expect(isStepSequence(getCanvas())).toBe(false);
  });

  it("setStepFrames initializes a manual-driver Presentation at cursor 0, resolving each frame's effective type", () => {
    const frames = [{ payload: "A" }, { payload: "B" }];
    setStepFrames(frames, "mermaid", '{"frame_type":"mermaid","frames":[...]}', "Seq Title", { a: 0 }, "sf-1");
    expect(getCanvas()).toEqual({
      presentation: {
        cursor: 0,
        frames: [{ type: "mermaid", payload: "A" }, { type: "mermaid", payload: "B" }],
        title: "Seq Title",
        id: "sf-1",
      },
      driver: "manual",
      rawPayload: '{"frame_type":"mermaid","frames":[...]}',
      frameType: "mermaid",
      nodeToFrame: { a: 0 },
    });
    expect(exportCanvas()).toBe('{"frame_type":"mermaid","frames":[...]}');
  });

  it("setStepFrames resolves a per-frame type override instead of the sequence's frameType", () => {
    setStepFrames([{ payload: "A" }, { payload: "E = mc^2", type: "katex" }], "mermaid", "raw");
    const state = getCanvas();
    expect(isStepSequence(state)).toBe(true);
    if (isStepSequence(state)) {
      expect(state.presentation.frames).toEqual([
        { type: "mermaid", payload: "A" },
        { type: "katex", payload: "E = mc^2" },
      ]);
    }
  });

  it("isStepSequence is true once a step-frames sequence is loaded", () => {
    setStepFrames([{ payload: "A" }, { payload: "B" }], "mermaid", "raw");
    expect(isStepSequence(getCanvas())).toBe(true);
  });

  it("seekStepFrame updates the presentation's cursor when a step-frames sequence is loaded", () => {
    setStepFrames([{ payload: "A" }, { payload: "B" }, { payload: "C" }], "mermaid", "raw");
    seekStepFrame(2);
    const state = getCanvas();
    expect(isStepSequence(state) && state.presentation.cursor).toBe(2);
  });

  it("seekStepFrame is a no-op when no step-frames sequence is loaded", () => {
    setCanvas("mermaid", "graph TD; A-->B");
    seekStepFrame(2);
    expect(getCanvas()).toEqual({
      presentation: { cursor: 0, frames: [{ type: "mermaid", payload: "graph TD; A-->B" }] },
      driver: "static",
    });
  });

  it("stepCursor advances and rewinds within bounds", () => {
    setStepFrames([{ payload: "A" }, { payload: "B" }, { payload: "C" }], "mermaid", "raw");
    expect(stepCursor("next")).toEqual({ currentFrame: 1, totalFrames: 3 });
    expect(stepCursor("next")).toEqual({ currentFrame: 2, totalFrames: 3 });
    // Clamped at the last frame.
    expect(stepCursor("next")).toEqual({ currentFrame: 2, totalFrames: 3 });
    expect(stepCursor("prev")).toEqual({ currentFrame: 1, totalFrames: 3 });
    expect(stepCursor("prev")).toEqual({ currentFrame: 0, totalFrames: 3 });
    // Clamped at the first frame.
    expect(stepCursor("prev")).toEqual({ currentFrame: 0, totalFrames: 3 });
  });

  it("stepCursor returns null when no step-frames sequence is loaded", () => {
    expect(stepCursor("next")).toBeNull();
  });

  it("stepCursor returns null on an empty canvas", () => {
    expect(getCanvas()).toEqual({ presentation: null, driver: "static" });
    expect(stepCursor("next")).toBeNull();
  });

  it("clearCanvas resets to empty", () => {
    setCanvas("mermaid", "graph TD; A-->B");
    clearCanvas();
    expect(getCanvas()).toEqual({ presentation: null, driver: "static" });
  });

  it("tracks lastWorkspace independently of canvas state", () => {
    expect(getLastWorkspace()).toBe("");
    setLastWorkspace("my-workspace");
    expect(getLastWorkspace()).toBe("my-workspace");
    clearCanvas();
    expect(getLastWorkspace()).toBe("my-workspace");
  });
});
