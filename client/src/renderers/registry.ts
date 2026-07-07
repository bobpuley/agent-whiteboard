// Type → component registry (v0.24, U6/D3 in ../../../docs/04_architecture.md §9).
// Adding a new renderer type: add one entry below (`load` + `props`); nothing
// else in App.svelte needs to change. (ws.ts's RendererType/KNOWN_RENDERER_TYPES
// is a separate concern — it gates which types the server is allowed to send.)
//
// `load()` returns the wrapper component directly rather than via a dynamic
// import() of the .svelte file: the wrappers are tiny (a few kB combined) and
// the actual v0.21 lazy-loading win — mermaid.js/katex/vega-embed, hundreds of
// kB each — lives *inside* each wrapper and is untouched here. Dynamically
// importing the wrappers too was tried and reverted: it shrinks the main
// bundle just enough to shift page-load timing and made a pre-existing,
// razor-thin dev-server race (a REST-triggered render arriving before the
// page's own /stream WebSocket handshake completes) fail far more often in
// the e2e suite.
import type { ComponentType, SvelteComponent } from "svelte";
import type { CanvasState, CanvasType } from "../stores/canvasStore.js";
import Mermaid from "./Mermaid.svelte";
import Html from "./Html.svelte";
import Katex from "./Katex.svelte";
import VegaLite from "./VegaLite.svelte";
import StepFramesPlaceholder from "./StepFramesPlaceholder.svelte";

export type RendererKey = CanvasType | "step-frames-placeholder";

export interface RendererContext {
  canvas: CanvasState;
  clickable: boolean;
  nodeActions: Record<string, string[]> | undefined;
  nodeToFrameEnabled: boolean;
}

export interface RendererEntry {
  load: () => Promise<ComponentType<SvelteComponent>>;
  props: (ctx: RendererContext) => Record<string, unknown>;
}

function htmlProps(type: "svg" | "html") {
  return ({ canvas }: RendererContext) => ({
    source: (canvas as Extract<CanvasState, { type: CanvasType }>).payload,
    type,
  });
}

export const rendererRegistry: Record<RendererKey, RendererEntry> = {
  mermaid: {
    load: () => Promise.resolve(Mermaid as unknown as ComponentType<SvelteComponent>),
    props: ({ canvas, clickable, nodeActions, nodeToFrameEnabled }) => {
      const c = canvas as Extract<CanvasState, { type: CanvasType }>;
      return {
        source: c.payload,
        clickable,
        nodeActions,
        nodeToFrame: nodeToFrameEnabled ? c.nodeToFrame : undefined,
        snapshotId: c.id,
        viewport: c.viewport,
      };
    },
  },
  svg: {
    load: () => Promise.resolve(Html as unknown as ComponentType<SvelteComponent>),
    props: htmlProps("svg"),
  },
  html: {
    load: () => Promise.resolve(Html as unknown as ComponentType<SvelteComponent>),
    props: htmlProps("html"),
  },
  katex: {
    load: () => Promise.resolve(Katex as unknown as ComponentType<SvelteComponent>),
    props: ({ canvas }) => ({ source: (canvas as Extract<CanvasState, { type: CanvasType }>).payload }),
  },
  "vega-lite": {
    load: () => Promise.resolve(VegaLite as unknown as ComponentType<SvelteComponent>),
    props: ({ canvas }) => ({ source: (canvas as Extract<CanvasState, { type: CanvasType }>).payload }),
  },
  "step-frames-placeholder": {
    load: () => Promise.resolve(StepFramesPlaceholder as unknown as ComponentType<SvelteComponent>),
    props: ({ canvas }) => ({
      frameCount: (canvas as Extract<CanvasState, { type: "step-frames-placeholder" }>).frameCount,
    }),
  },
};
