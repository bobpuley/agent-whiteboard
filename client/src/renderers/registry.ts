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
import type { Placeholder } from "../stores/canvasStore.js";
import type { Presentation } from "../presentation.js";
import type { RendererType, Viewport } from "../ws.js";
import Mermaid from "./Mermaid.svelte";
import Html from "./Html.svelte";
import Katex from "./Katex.svelte";
import VegaLite from "./VegaLite.svelte";
import StepFramesPlaceholder from "./StepFramesPlaceholder.svelte";

export type RendererKey = RendererType | "step-frames-placeholder";
type ContentRendererKey = Exclude<RendererKey, "step-frames-placeholder">;

// presentation is non-nullable here (NF40) — canvasStore's reducer guarantees
// presentation and placeholder are mutually exclusive (see reduce() in
// canvasStore.ts), so a content renderer's props() is only ever invoked once
// its presentation actually exists. The one call site (App.svelte) performs
// that null check when constructing this context, instead of every props()
// implementation asserting it away with `!`.
export interface RendererContext {
  presentation: Presentation;
  clickable: boolean;
  nodeActions: Record<string, string[]> | undefined;
  nodeToFrameEnabled: boolean;
  nodeToFrame?: Record<string, number>;
  viewport?: Viewport;
  /** Current step-frames cursor (v0.26.1, bug B19/FR21) — lets Mermaid.svelte
   * key its per-frame auto-fit/restore decision on id+frame, not id alone. */
  currentFrame: number;
}

export interface PlaceholderContext {
  placeholder: Placeholder;
}

export interface RendererEntry {
  load: () => Promise<ComponentType<SvelteComponent>>;
  props: (ctx: RendererContext) => Record<string, unknown>;
}

export interface PlaceholderRendererEntry {
  load: () => Promise<ComponentType<SvelteComponent>>;
  props: (ctx: PlaceholderContext) => Record<string, unknown>;
}

function htmlProps(type: "svg" | "html") {
  return ({ presentation }: RendererContext) => ({
    source: presentation.frames[0].payload,
    type,
  });
}

export const rendererRegistry: Record<ContentRendererKey, RendererEntry> & {
  "step-frames-placeholder": PlaceholderRendererEntry;
} = {
  mermaid: {
    load: () => Promise.resolve(Mermaid as unknown as ComponentType<SvelteComponent>),
    props: ({ presentation, clickable, nodeActions, nodeToFrameEnabled, nodeToFrame, viewport, currentFrame }) => ({
      source: presentation.frames[0].payload,
      clickable,
      nodeActions,
      nodeToFrame: nodeToFrameEnabled ? nodeToFrame : undefined,
      snapshotId: presentation.id,
      viewport,
      currentFrame,
    }),
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
    props: ({ presentation }) => ({ source: presentation.frames[0].payload }),
  },
  "vega-lite": {
    load: () => Promise.resolve(VegaLite as unknown as ComponentType<SvelteComponent>),
    props: ({ presentation }) => ({ source: presentation.frames[0].payload }),
  },
  "step-frames-placeholder": {
    load: () => Promise.resolve(StepFramesPlaceholder as unknown as ComponentType<SvelteComponent>),
    props: ({ placeholder }) => ({ frameCount: placeholder.frameCount }),
  },
};
