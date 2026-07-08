// Canvas state reducer — owns everything App.svelte's canvas needs to
// render in response to WebSocket render commands: the canvas content
// itself, click-armed state, node action menus, and node-to-frame nav.
//
// Unified reducer (U3, v0.26 Sprint 41-42): mirrors session.ts's server-side
// Presentation + driver model instead of a `type`-tagged union — "step-frames"
// is not a branch here. `driver` is derived from `cmd.total > 1`: a one-shot
// render and a 1-frame step-frames sequence are indistinguishable and both
// need no navigation UI, so "manual" only kicks in once there's more than one
// frame to navigate between (v0.26 Sprint 42 — replaces the old `stepFrames`
// boolean flag, which no longer exists on the wire). `cursor` stays 0 (frames
// always holds just the one currently-displayed frame — the server still
// resolves and sends only the current frame, not the full sequence);
// `currentFrame`/`totalFrames` are separate display-only metadata for the
// step-bar, not a meaningful index into `frames`.
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
      id: cmd.id,
      ...(cmd.title !== undefined ? { title: cmd.title } : {}),
    };
    return {
      ...state,
      presentation,
      driver: cmd.total > 1 ? "manual" : "static",
      placeholder: null,
      currentFrame: cmd.cursor,
      totalFrames: cmd.total,
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
