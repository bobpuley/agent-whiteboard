import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { canvasStore } from "../../../client/src/stores/canvasStore.js";

describe("canvasStore", () => {
  it("starts empty", () => {
    const state = get(canvasStore);
    expect(state.presentation).toBeNull();
    expect(state.driver).toBe("static");
    expect(state.placeholder).toBeNull();
    expect(state.clickable).toBe(false);
    expect(state.nodeActions).toBeUndefined();
    expect(state.nodeToFrameEnabled).toBe(false);
  });

  it("clear resets to empty and clears clickable/nodeActions/nodeToFrameEnabled", () => {
    canvasStore.dispatch({ action: "replace", type: "mermaid", payload: "graph TD; A-->B", id: "id-1", cursor: 0, total: 1 });
    canvasStore.dispatch({ action: "set_node_actions", enabled: true, node_actions: { A: ["x"] } });

    canvasStore.dispatch({ action: "clear" });

    const state = get(canvasStore);
    expect(state.presentation).toBeNull();
    expect(state.driver).toBe("static");
    expect(state.placeholder).toBeNull();
    expect(state.clickable).toBe(false);
    expect(state.nodeActions).toBeUndefined();
    expect(state.nodeToFrameEnabled).toBe(false);
  });

  it("replace with a step-frames-placeholder shows frame count and title, and clears any presentation", () => {
    canvasStore.dispatch({ action: "clear" });
    canvasStore.dispatch({ action: "replace", type: "step-frames-placeholder", frameCount: 2, title: "Building" });

    const state = get(canvasStore);
    expect(state.presentation).toBeNull();
    expect(state.placeholder).toEqual({ frameCount: 2, title: "Building" });
    expect(state.nodeToFrameEnabled).toBe(false);
  });

  it("replace with total:1 builds a single-frame static Presentation and sets nodeToFrameEnabled from nodeToFrame presence", () => {
    canvasStore.dispatch({ action: "clear" });
    canvasStore.dispatch({
      action: "replace",
      type: "mermaid",
      payload: "graph TD; A-->B",
      id: "abc",
      cursor: 0,
      total: 1,
      title: "T",
      nodeToFrame: { A: 0 },
    });

    const state = get(canvasStore);
    expect(state.presentation).toEqual({
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
      id: "abc",
      title: "T",
    });
    expect(state.driver).toBe("static");
    expect(state.placeholder).toBeNull();
    expect(state.nodeToFrame).toEqual({ A: 0 });
    expect(state.nodeToFrameEnabled).toBe(true);
  });

  it("replace with total > 1 sets driver to manual and carries the frame label plus cursor metadata (v0.26 Sprint 42 — driver derived from total, not a stepFrames boolean)", () => {
    canvasStore.dispatch({ action: "clear" });
    canvasStore.dispatch({
      action: "replace",
      type: "mermaid",
      payload: "graph TD; A-->B",
      id: "seq-1",
      cursor: 1,
      total: 3,
      frameLabel: "Step 2",
    });

    const state = get(canvasStore);
    expect(state.driver).toBe("manual");
    expect(state.presentation).toEqual({
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A-->B", label: "Step 2" }],
      id: "seq-1",
    });
    expect(state.currentFrame).toBe(1);
    expect(state.totalFrames).toBe(3);
  });

  it("replace with total:1 for a committed 1-frame step-frames sequence is indistinguishable from a static render (no navigation needed)", () => {
    canvasStore.dispatch({ action: "clear" });
    canvasStore.dispatch({
      action: "replace",
      type: "mermaid",
      payload: "graph TD; A-->B",
      id: "seq-solo",
      cursor: 0,
      total: 1,
      frameLabel: "Only step",
    });

    expect(get(canvasStore).driver).toBe("static");
  });

  it("replace without nodeToFrame sets nodeToFrameEnabled false", () => {
    canvasStore.dispatch({ action: "clear" });
    canvasStore.dispatch({ action: "replace", type: "mermaid", payload: "graph TD; A-->B", id: "id-2", cursor: 0, total: 1 });

    expect(get(canvasStore).nodeToFrameEnabled).toBe(false);
  });

  it("set_node_actions enabled:true arms clickable, sets nodeActions, and disables nodeToFrame", () => {
    canvasStore.dispatch({ action: "clear" });
    canvasStore.dispatch({
      action: "replace",
      type: "mermaid",
      payload: "graph TD; A-->B",
      id: "id-3",
      cursor: 0,
      total: 1,
      nodeToFrame: { A: 0 },
    });
    expect(get(canvasStore).nodeToFrameEnabled).toBe(true);

    canvasStore.dispatch({ action: "set_node_actions", enabled: true, node_actions: { A: ["Explain"] } });

    const state = get(canvasStore);
    expect(state.clickable).toBe(true);
    expect(state.nodeActions).toEqual({ A: ["Explain"] });
    expect(state.nodeToFrameEnabled).toBe(false);
  });

  it("set_node_actions enabled:true with no node_actions defaults to an empty map", () => {
    canvasStore.dispatch({ action: "clear" });
    canvasStore.dispatch({ action: "set_node_actions", enabled: true });

    const state = get(canvasStore);
    expect(state.clickable).toBe(true);
    expect(state.nodeActions).toEqual({});
  });

  it("set_node_actions enabled:false disarms clickable and clears nodeActions without restoring nodeToFrameEnabled", () => {
    canvasStore.dispatch({ action: "clear" });
    canvasStore.dispatch({
      action: "replace",
      type: "mermaid",
      payload: "graph TD; A-->B",
      id: "id-3",
      cursor: 0,
      total: 1,
      nodeToFrame: { A: 0 },
    });
    canvasStore.dispatch({ action: "set_node_actions", enabled: true });

    canvasStore.dispatch({ action: "set_node_actions", enabled: false });

    const state = get(canvasStore);
    expect(state.clickable).toBe(false);
    expect(state.nodeActions).toBeUndefined();
    expect(state.nodeToFrameEnabled).toBe(false);
  });

  it("set_done_armed is not handled by this store (no-op)", () => {
    canvasStore.dispatch({ action: "clear" });
    const before = get(canvasStore);

    canvasStore.dispatch({ action: "set_done_armed", armed: true });

    expect(get(canvasStore)).toEqual(before);
  });
});
