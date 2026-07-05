import { afterEach, describe, expect, it } from "vitest";
import {
  clearCanvas,
  exportCanvas,
  getCanvas,
  getLastWorkspace,
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
    expect(getCanvas()).toEqual({ type: "empty" });
    expect(exportCanvas()).toBe("");
  });

  it("setCanvas replaces canvas state and is reflected by exportCanvas", () => {
    setCanvas("mermaid", "graph TD; A-->B", "My Title", "id-1");
    expect(getCanvas()).toEqual({ type: "mermaid", payload: "graph TD; A-->B", title: "My Title", id: "id-1" });
    expect(exportCanvas()).toBe("graph TD; A-->B");
  });

  it("setCanvas omits title/id when absent", () => {
    setCanvas("svg", "<svg/>");
    expect(getCanvas()).toEqual({ type: "svg", payload: "<svg/>" });
  });

  it("setStepFrames initializes a step-frames sequence at frame 0", () => {
    const frames = [{ payload: "A" }, { payload: "B" }];
    setStepFrames(frames, "mermaid", '{"frame_type":"mermaid","frames":[...]}', "Seq Title", { a: 0 }, "sf-1");
    expect(getCanvas()).toEqual({
      type: "step-frames",
      frames,
      frameType: "mermaid",
      currentFrame: 0,
      rawPayload: '{"frame_type":"mermaid","frames":[...]}',
      title: "Seq Title",
      nodeToFrame: { a: 0 },
      id: "sf-1",
    });
    expect(exportCanvas()).toBe('{"frame_type":"mermaid","frames":[...]}');
  });

  it("seekStepFrame updates currentFrame when a step-frames sequence is loaded", () => {
    setStepFrames([{ payload: "A" }, { payload: "B" }, { payload: "C" }], "mermaid", "raw");
    seekStepFrame(2);
    const canvas = getCanvas();
    expect(canvas.type === "step-frames" && canvas.currentFrame).toBe(2);
  });

  it("seekStepFrame is a no-op when no step-frames sequence is loaded", () => {
    setCanvas("mermaid", "graph TD; A-->B");
    seekStepFrame(2);
    expect(getCanvas()).toEqual({ type: "mermaid", payload: "graph TD; A-->B" });
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

  it("clearCanvas resets to empty", () => {
    setCanvas("mermaid", "graph TD; A-->B");
    clearCanvas();
    expect(getCanvas()).toEqual({ type: "empty" });
  });

  it("tracks lastWorkspace independently of canvas state", () => {
    expect(getLastWorkspace()).toBe("");
    setLastWorkspace("my-workspace");
    expect(getLastWorkspace()).toBe("my-workspace");
    clearCanvas();
    expect(getLastWorkspace()).toBe("my-workspace");
  });
});
