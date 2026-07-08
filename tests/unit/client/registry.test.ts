import { describe, expect, it } from "vitest";
import { rendererRegistry } from "../../../client/src/renderers/registry.js";
import Mermaid from "../../../client/src/renderers/Mermaid.svelte";
import Html from "../../../client/src/renderers/Html.svelte";
import Katex from "../../../client/src/renderers/Katex.svelte";
import VegaLite from "../../../client/src/renderers/VegaLite.svelte";
import StepFramesPlaceholder from "../../../client/src/renderers/StepFramesPlaceholder.svelte";

const baseCtx = { clickable: false, nodeActions: undefined, nodeToFrameEnabled: false, placeholder: null };

describe("rendererRegistry", () => {
  it("has an entry for every canvas type the server can send, plus the placeholder", () => {
    expect(Object.keys(rendererRegistry).sort()).toEqual(
      ["mermaid", "svg", "html", "katex", "vega-lite", "step-frames-placeholder"].sort(),
    );
  });

  it("mermaid loads Mermaid.svelte and maps every prop it needs", async () => {
    const Component = await rendererRegistry.mermaid.load();
    expect(Component).toBe(Mermaid);

    const presentation = {
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
      id: "abc",
    };
    expect(rendererRegistry.mermaid.props({
      ...baseCtx,
      presentation,
      nodeToFrameEnabled: true,
      nodeToFrame: { A: 0 },
      viewport: { scale: 1, positionX: 0, positionY: 0 },
    })).toEqual({
      source: "graph TD; A-->B",
      clickable: false,
      nodeActions: undefined,
      nodeToFrame: { A: 0 },
      snapshotId: "abc",
      viewport: { scale: 1, positionX: 0, positionY: 0 },
    });
  });

  it("svg and html both load Html.svelte with the matching type prop", async () => {
    expect(await rendererRegistry.svg.load()).toBe(Html);
    expect(await rendererRegistry.html.load()).toBe(Html);

    const presentation = { cursor: 0, frames: [{ type: "svg", payload: "<svg></svg>" }] };
    expect(rendererRegistry.svg.props({ ...baseCtx, presentation })).toEqual({ source: "<svg></svg>", type: "svg" });
    expect(rendererRegistry.html.props({ ...baseCtx, presentation })).toEqual({
      source: "<svg></svg>",
      type: "html",
    });
  });

  it("katex loads Katex.svelte and maps source", async () => {
    expect(await rendererRegistry.katex.load()).toBe(Katex);
    const presentation = { cursor: 0, frames: [{ type: "katex", payload: "E=mc^2" }] };
    expect(rendererRegistry.katex.props({ ...baseCtx, presentation })).toEqual({ source: "E=mc^2" });
  });

  it("vega-lite loads VegaLite.svelte and maps source", async () => {
    expect(await rendererRegistry["vega-lite"].load()).toBe(VegaLite);
    const presentation = { cursor: 0, frames: [{ type: "vega-lite", payload: "{}" }] };
    expect(rendererRegistry["vega-lite"].props({ ...baseCtx, presentation })).toEqual({ source: "{}" });
  });

  it("step-frames-placeholder loads its component and maps frameCount", async () => {
    expect(await rendererRegistry["step-frames-placeholder"].load()).toBe(StepFramesPlaceholder);
    expect(rendererRegistry["step-frames-placeholder"].props({
      ...baseCtx,
      presentation: null,
      placeholder: { frameCount: 3 },
    })).toEqual({ frameCount: 3 });
  });
});
