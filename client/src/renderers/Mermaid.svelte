<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import { createPanZoom } from "./mermaid/panZoom";
  import { createNodeInteractions, type PopupRequest } from "./mermaid/nodeInteractions";
  import NodeActionPopup from "./mermaid/NodeActionPopup.svelte";

  export let source: string;
  export let clickable = false;
  export let nodeActions: Record<string, string[]> | undefined = undefined;
  export let nodeToFrame: Record<string, number> | undefined = undefined;
  // v0.19 (F19/C3): snapshot id for the content currently being displayed —
  // present on new render()/commit_step_frames()/history-load content, echoed
  // unchanged on step()/seek() continuations, absent on legacy (pre-v0.11)
  // snapshots. viewport, when present, is a previously-saved zoom/pan to
  // restore instead of auto-fitting.
  export let snapshotId: string | undefined = undefined;
  export let viewport: { scale: number; positionX: number; positionY: number } | undefined = undefined;
  // v0.26.1 (bug B19/FR21): current step-frames cursor. Combined with
  // snapshotId this forms the composite key ("<id>:<frame>") that decides
  // whether to fit-or-restore — each frame of a sequence now re-fits or
  // restores its own saved viewport independently, reversing the pre-v0.26.1
  // "whole sequence shares one viewport" behavior.
  export let currentFrame = 0;

  let wrapper: HTMLDivElement;
  let container: HTMLDivElement;
  let errorMessage: string | null = null;
  let lastRendered: string | null = null;
  // Bumped on every renderDiagram() call; a render whose token no longer
  // matches by the time its async work resolves has been superseded and
  // must not touch the DOM (B8 — stale-render race).
  let renderToken = 0;
  // Tracks the last "<id>:<frame>" key we fit-or-restored a viewport for. A
  // missing (undefined) incoming id — e.g. legacy pre-v0.11 snapshots — always
  // means "continuation, do not touch the viewport", regardless of this value.
  // v0.26.1 (bug B19/FR21): frame is now part of the key — step()/seek() to a
  // different frame is no longer treated as "same continuation, skip the fit".
  let lastSnapshotKey: string | undefined = undefined;

  // ── Zoom / pan state ────────────────────────────────────────────────────────
  // Extracted to renderers/mermaid/panZoom.ts (v0.29 Sprint 62, NF29 part 1).
  // The getters read the component's live wrapper/container bindings and
  // snapshotId/currentFrame props at call time, same as when this logic lived
  // inline here.
  const panZoom = createPanZoom({
    getWrapper: () => wrapper,
    getContainer: () => container,
    getSnapshotId: () => snapshotId,
    getCurrentFrame: () => currentFrame,
  });
  const { scale, tx, ty, dragging, fitToView, applyViewport, resetTransform, onWheel, onMousedown, onMousemove, onMouseup } =
    panZoom;

  // ── Node / edge click detection ─────────────────────────────────────────────

  function extractNodeId(el: Element): string | null {
    // Mermaid flowchart node IDs: "flowchart-<nodeId>-<N>"
    const m = el.id.match(/flowchart-(.+?)-\d+$/)
    return m ? m[1] : null
  }

  function extractNodeLabel(el: Element): string {
    const label =
      el.querySelector('.nodeLabel') ??
      el.querySelector('.label') ??
      el
    return label.textContent?.trim() ?? ''
  }

  function extractEdgeId(el: Element): string | null {
    // Mermaid edge paths: id like "L_A_B_0" or "L-A-B-0"
    const group = el.closest('[id]')
    if (!group) return null
    return group.id || null
  }

  // ── Click routing + node-to-frame wiring ────────────────────────────────────
  // Extracted to renderers/mermaid/nodeInteractions.ts (v0.29 Sprint 63,
  // NF29 part 2 + NF30). Popup *state* lives in this component (bound to
  // <NodeActionPopup>); nodeInteractions.ts only decides whether a click
  // should request a popup or fire a plain click.
  let popup: PopupRequest | null = null

  const nodeInteractions = createNodeInteractions({
    getContainer: () => container,
    extractNodeId,
    extractNodeLabel,
    extractEdgeId,
    getNodeActions: () => nodeActions,
    onPopupRequest: (p) => { popup = p },
  })
  const { attachClickListeners, detachClickListeners, attachNodeToFrameListeners, detachNodeToFrameListeners } =
    nodeInteractions

  function dismissPopup() {
    popup = null
  }

  async function selectAction(action: string) {
    if (!popup) return
    const p = popup
    popup = null
    await nodeInteractions.selectAction(p, action)
  }

  // ── Mermaid rendering ───────────────────────────────────────────────────────
  // Loaded lazily on first use rather than eagerly bundled on initial page
  // paint (NF13) — cached after the first call so later renders don't re-import.
  type MermaidInstance = typeof import("mermaid")["default"];
  let mermaidPromise: Promise<MermaidInstance> | null = null;

  function loadMermaid(): Promise<MermaidInstance> {
    if (!mermaidPromise) {
      mermaidPromise = import("mermaid").then((mod) => {
        const instance = mod.default;
        instance.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
        return instance;
      });
    }
    return mermaidPromise;
  }

  // v0.19 (F19/C3): a new snapshot id+frame combination (different from the
  // last one we saw) fits-to-view or restores a saved viewport.
  // v0.26.1 (bug B19/FR21): frame is now part of the comparison — step()/
  // seek() to a different frame within the same sequence used to leave the
  // live transform untouched ("must not re-fit", pre-v0.26.1); each frame now
  // re-fits or restores independently instead of the whole sequence sharing
  // one viewport.
  function isNewSnapshot(): boolean {
    if (snapshotId === undefined) return false;
    return `${snapshotId}:${currentFrame}` !== lastSnapshotKey;
  }

  async function renderDiagram(src: string, fitOrRestore: boolean) {
    const token = ++renderToken;
    errorMessage = null;
    detachClickListeners();
    if (!src) {
      if (container) container.innerHTML = "";
      return;
    }
    try {
      const mermaid = await loadMermaid();
      if (token !== renderToken) return; // superseded while the library was loading
      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, src);
      if (token !== renderToken) return; // superseded by a newer render
      if (container) container.innerHTML = svg;
      const svgEl = container?.querySelector("svg");
      if (svgEl) {
        // Mermaid emits width="100%" with no explicit pixel size, and our CSS
        // deliberately leaves the container unsized ("let the SVG size itself
        // naturally"). With no definite containing-block width to resolve
        // that percentage against, the browser can fall back to the CSS
        // default replaced-element size (300x150) instead of the viewBox's
        // real dimensions — some real browsers hit this fallback, headless
        // test runners often don't, which is why this only reproduced live.
        // fitToView()/applyViewport() below assume the SVG's natural
        // (pre-transform) pixel size equals its viewBox size; pinning both
        // attributes explicitly makes that assumption hold deterministically.
        const viewBox = svgEl.getAttribute("viewBox");
        if (viewBox) {
          const parts = viewBox.trim().split(/\s+/).map(Number);
          if (parts[2] && parts[3]) {
            svgEl.setAttribute("width", String(parts[2]));
            svgEl.setAttribute("height", String(parts[3]));
          }
        }
      }
      if (fitOrRestore && svgEl) {
        if (viewport) applyViewport(viewport);
        else fitToView(svgEl);
      }
      if (clickable) attachClickListeners();
      else if (nodeToFrame) attachNodeToFrameListeners(nodeToFrame);
    } catch (err) {
      if (token !== renderToken) return; // superseded by a newer render
      errorMessage = err instanceof Error ? err.message : String(err);
      if (container) container.innerHTML = "";
    }
  }

  onMount(() => {
    const fitOrRestore = isNewSnapshot();
    if (snapshotId !== undefined) lastSnapshotKey = `${snapshotId}:${currentFrame}`;
    void renderDiagram(source, fitOrRestore);
    lastRendered = source;

    window.addEventListener("mousemove", onMousemove);
    window.addEventListener("mouseup", onMouseup);
  });

  afterUpdate(() => {
    if (source !== lastRendered) {
      const fitOrRestore = isNewSnapshot();
      if (snapshotId !== undefined) lastSnapshotKey = `${snapshotId}:${currentFrame}`;
      lastRendered = source;
      void renderDiagram(source, fitOrRestore);
    }
  });

  onDestroy(() => {
    window.removeEventListener("mousemove", onMousemove);
    window.removeEventListener("mouseup", onMouseup);
    detachClickListeners();
    detachNodeToFrameListeners();
    panZoom.destroy();
  });

  // Re-attach (or detach) click listeners when clickable prop changes.
  $: if (clickable) { attachClickListeners() } else { detachClickListeners(); popup = null }

  // Re-attach (or detach) node-to-frame listeners when nodeToFrame prop changes.
  $: if (nodeToFrame) { attachNodeToFrameListeners(nodeToFrame) } else { detachNodeToFrameListeners() }

  $: transform = `translate(${$tx}px, ${$ty}px) scale(${$scale})`;
  $: cursor = $dragging ? "grabbing" : "grab";
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="mermaid-wrapper"
  bind:this={wrapper}
  on:wheel={onWheel}
  on:mousedown={onMousedown}
  title="Scroll to zoom · Drag to pan · Double-click to reset"
  on:dblclick={resetTransform}
  style="cursor: {cursor}"
>
  <div
    class="mermaid-canvas"
    style="transform: {transform}; transform-origin: 0 0;"
  >
    <div bind:this={container} class="mermaid-container"></div>
  </div>

  {#if errorMessage}
    <pre class="render-error">{errorMessage}</pre>
  {/if}

  <div class="zoom-hint">scroll to zoom · drag to pan · dbl-click to reset</div>

  <NodeActionPopup {popup} on:select={(e) => selectAction(e.detail)} on:dismiss={dismissPopup} />
</div>

<style>
  .mermaid-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    user-select: none;
  }

  .mermaid-canvas {
    position: absolute;
    top: 0;
    left: 0;
    /* transition intentionally omitted — real-time pan/zoom feels snappier without it */
  }

  .mermaid-container {
    /* Let the SVG size itself naturally */
  }

  .render-error {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    color: #c0392b;
    background: #fdf2f2;
    border: 1px solid #e74c3c;
    border-radius: 4px;
    padding: 12px 16px;
    font-family: monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 80%;
    z-index: 10;
  }

  .zoom-hint {
    position: absolute;
    bottom: 8px;
    right: 12px;
    font-size: 11px;
    color: #666;
    pointer-events: none;
    user-select: none;
  }

  /* Visual cue when nodes are clickable — applied via JS (cursor + outline). */
  :global(.mermaid-container svg .node.clickable-node rect),
  :global(.mermaid-container svg .node.clickable-node circle),
  :global(.mermaid-container svg .node.clickable-node polygon) {
    outline: 2px solid #3498db;
    outline-offset: 2px;
  }
</style>
