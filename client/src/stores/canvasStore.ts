// Canvas state reducer — owns everything App.svelte's canvas needs to
// render in response to WebSocket render commands: the canvas content
// itself, click-armed state, node action menus, and node-to-frame nav.
//
// Unified reducer (U3, v0.26 Sprint 41): mirrors session.ts's server-side
// Presentation + driver model instead of a `type`-tagged union — "step-frames"
// is not a branch here. `driver` is "static" for a one-frame render, "manual"
// whenever the current content is part of a step-frames sequence. `cursor`
// stays 0 (frames always holds just the one currently-displayed frame) until
// Sprint 42 changes the WS payload to carry the full sequence; `currentFrame`/
// `totalFrames` are separate display-only metadata for the step-bar, not a
// meaningful index into `frames` yet.
import { writable } from "svelte/store";
import type { RenderCommand, Viewport } from "../ws.js";
import type { Frame, Presentation } from "../presentation.js";

export type Driver = "static" | "manual" | "timed";

export interface Placeholder {
  frameCount: number;
  title?: string;
}

export interface CanvasViewState {
  presentation: Presentation | null; // null = nothing rendered yet, or clear()
  driver: Driver;
  placeholder: Placeholder | null; // step-frames-placeholder — incremental builder in progress, no content yet
  currentFrame?: number;
  totalFrames?: number;
  viewport?: Viewport;
  nodeToFrame?: Record<string, number>;
  clickable: boolean;
  nodeActions: Record<string, string[]> | undefined;
  // nodeToFrameEnabled is set true on replace with nodeToFrame, and set false when
  // set_node_actions enabled:true arrives (wait_click overrides it). It is NOT
  // restored when set_node_actions enabled:false arrives — agent must re-render.
  nodeToFrameEnabled: boolean;
}

const initialState: CanvasViewState = {
  presentation: null,
  driver: "static",
  placeholder: null,
  clickable: false,
  nodeActions: undefined,
  nodeToFrameEnabled: false,
};

function reduce(state: CanvasViewState, cmd: RenderCommand): CanvasViewState {
  if (cmd.action === "clear") {
    return { presentation: null, driver: "static", placeholder: null, clickable: false, nodeActions: undefined, nodeToFrameEnabled: false };
  }
  if (cmd.action === "replace" && cmd.type === "step-frames-placeholder") {
    return {
      ...state,
      presentation: null,
      placeholder: { frameCount: cmd.frameCount, title: cmd.title },
      nodeToFrameEnabled: false,
    };
  }
  if (cmd.action === "replace") {
    const frame: Frame = { type: cmd.type, payload: cmd.payload, ...(cmd.frameLabel !== undefined ? { label: cmd.frameLabel } : {}) };
    const presentation: Presentation = {
      cursor: 0,
      frames: [frame],
      ...(cmd.title !== undefined ? { title: cmd.title } : {}),
      ...(cmd.id !== undefined ? { id: cmd.id } : {}),
    };
    return {
      ...state,
      presentation,
      driver: cmd.stepFrames ? "manual" : "static",
      placeholder: null,
      currentFrame: cmd.currentFrame,
      totalFrames: cmd.totalFrames,
      viewport: cmd.viewport,
      nodeToFrame: cmd.nodeToFrame,
      nodeToFrameEnabled: cmd.nodeToFrame !== undefined,
    };
  }
  if (cmd.action === "set_node_actions") {
    return {
      ...state,
      clickable: cmd.enabled,
      nodeActions: cmd.enabled ? (cmd.node_actions ?? {}) : undefined,
      nodeToFrameEnabled: cmd.enabled ? false : state.nodeToFrameEnabled,
    };
  }
  return state; // set_done_armed is handled by doneStore, not this reducer
}

function createCanvasStore() {
  const { subscribe, update } = writable<CanvasViewState>(initialState);
  return {
    subscribe,
    dispatch(cmd: RenderCommand) {
      update((state) => reduce(state, cmd));
    },
  };
}

export const canvasStore = createCanvasStore();
