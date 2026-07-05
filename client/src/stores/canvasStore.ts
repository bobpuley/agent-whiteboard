// Canvas state reducer — owns everything App.svelte's canvas needs to
// render in response to WebSocket render commands: the canvas content
// itself, click-armed state, node action menus, and node-to-frame nav.
import { writable } from "svelte/store";
import type { RenderCommand, Viewport } from "../ws.js";

export type CanvasType = "mermaid" | "svg" | "html" | "katex" | "vega-lite";

export type CanvasState =
  | { type: "empty" }
  | { type: "step-frames-placeholder"; frameCount: number; title?: string }
  | {
      type: CanvasType;
      payload: string;
      title?: string;
      stepFrames?: boolean;
      frameLabel?: string;
      currentFrame?: number;
      totalFrames?: number;
      nodeToFrame?: Record<string, number>;
      id?: string;
      viewport?: Viewport;
    };

export interface CanvasViewState {
  canvas: CanvasState;
  clickable: boolean;
  nodeActions: Record<string, string[]> | undefined;
  // nodeToFrameEnabled is set true on replace with nodeToFrame, and set false when
  // set_node_actions enabled:true arrives (wait_click overrides it). It is NOT
  // restored when set_node_actions enabled:false arrives — agent must re-render.
  nodeToFrameEnabled: boolean;
}

const initialState: CanvasViewState = {
  canvas: { type: "empty" },
  clickable: false,
  nodeActions: undefined,
  nodeToFrameEnabled: false,
};

function reduce(state: CanvasViewState, cmd: RenderCommand): CanvasViewState {
  if (cmd.action === "clear") {
    return { canvas: { type: "empty" }, clickable: false, nodeActions: undefined, nodeToFrameEnabled: false };
  }
  if (cmd.action === "replace" && cmd.type === "step-frames-placeholder") {
    return {
      ...state,
      canvas: { type: "step-frames-placeholder", frameCount: cmd.frameCount, title: cmd.title },
      nodeToFrameEnabled: false,
    };
  }
  if (cmd.action === "replace") {
    return {
      ...state,
      canvas: {
        type: cmd.type as CanvasType,
        payload: cmd.payload,
        title: cmd.title,
        stepFrames: cmd.stepFrames,
        frameLabel: cmd.frameLabel,
        currentFrame: cmd.currentFrame,
        totalFrames: cmd.totalFrames,
        nodeToFrame: cmd.nodeToFrame,
        id: cmd.id,
        viewport: cmd.viewport,
      },
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
