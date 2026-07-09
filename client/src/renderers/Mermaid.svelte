<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";

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
  let scale = 1;
  let tx = 0; // translate X
  let ty = 0; // translate Y
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginTx = 0;
  let dragOriginTy = 0;

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;
  const ZOOM_FACTOR = 0.001; // scale delta per wheel pixel
  const FIT_MARGIN = 0.92; // small breathing room around the fitted diagram
  const VIEWPORT_REPORT_DEBOUNCE_MS = 800;

  /** Scale-to-contain the diagram's natural (viewBox) size within wrapper, centered. */
  function fitToView(svg: SVGSVGElement) {
    if (!wrapper) return;
    const viewBox = svg.getAttribute("viewBox");
    let w: number;
    let h: number;
    if (viewBox) {
      const parts = viewBox.trim().split(/\s+/).map(Number);
      w = parts[2];
      h = parts[3];
    } else {
      w = svg.clientWidth || 1;
      h = svg.clientHeight || 1;
    }
    if (!w || !h) return;
    const wrapperW = wrapper.clientWidth;
    const wrapperH = wrapper.clientHeight;
    const fitScale = Math.min(wrapperW / w, wrapperH / h) * FIT_MARGIN;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale));
    tx = (wrapperW - w * scale) / 2;
    ty = (wrapperH - h * scale) / 2;
  }

  /** Restore a previously-saved viewport (normalized fractions -> pixels). */
  function applyViewport(vp: { scale: number; positionX: number; positionY: number }) {
    if (!wrapper) return;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale));
    tx = vp.positionX * wrapper.clientWidth;
    ty = vp.positionY * wrapper.clientHeight;
  }

  let reportTimer: ReturnType<typeof setTimeout> | null = null;

  /** Debounced report of the live viewport to the server, keyed by snapshotId. */
  function scheduleViewportReport() {
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      reportTimer = null;
      reportViewport();
    }, VIEWPORT_REPORT_DEBOUNCE_MS);
  }

  function reportViewport() {
    if (!snapshotId || !wrapper) return;
    const positionX = tx / wrapper.clientWidth;
    const positionY = ty / wrapper.clientHeight;
    fetch("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: snapshotId, frame: currentFrame, scale, positionX, positionY }),
    }).catch(() => { /* server might not be listening */ });
  }

  /** Manual "reset view" — re-fit and treat it as a deliberate user choice. */
  function resetTransform() {
    const svg = container?.querySelector("svg");
    if (svg) fitToView(svg);
    else {
      scale = 1;
      tx = 0;
      ty = 0;
    }
    scheduleViewportReport();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_FACTOR;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta * scale));

    // Zoom toward the cursor position inside the wrapper.
    const rect = wrapper.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Adjust translation so the point under the cursor stays fixed.
    tx = cursorX - (cursorX - tx) * (newScale / scale);
    ty = cursorY - (cursorY - ty) * (newScale / scale);
    scale = newScale;
    scheduleViewportReport();
  }

  function onMousedown(e: MouseEvent) {
    if (e.button !== 0) return; // left button only
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginTx = tx;
    dragOriginTy = ty;
    e.preventDefault();
  }

  function onMousemove(e: MouseEvent) {
    if (!dragging) return;
    tx = dragOriginTx + (e.clientX - dragStartX);
    ty = dragOriginTy + (e.clientY - dragStartY);
    scheduleViewportReport();
  }

  function onMouseup() {
    dragging = false;
  }

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

  function stopPropagation(e: Event) {
    // Prevent wrapper's mousedown from starting a drag when clicking a node.
    e.stopPropagation()
  }

  // ── Popup menu state ─────────────────────────────────────────────────────────

  interface PopupState {
    x: number
    y: number
    nodeId: string
    nodeLabel: string
    actions: string[]
  }

  let popup: PopupState | null = null

  function dismissPopup() {
    popup = null
  }

  async function selectAction(action: string) {
    if (!popup) return
    const { nodeId: id, nodeLabel: label } = popup
    popup = null
    await fetch('/node-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'node', id, label, action }),
    }).catch(() => { /* server might not be listening */ })
  }

  async function onNodeClick(e: Event) {
    e.stopPropagation()
    const el = (e.currentTarget as Element).closest('.node') ?? (e.currentTarget as Element)
    const id = extractNodeId(el) ?? el.id
    const label = extractNodeLabel(el)

    // If this node has registered actions, show the popup menu.
    const actions = nodeActions?.[id]
    if (actions && actions.length > 0) {
      const me = e as MouseEvent
      popup = { x: me.clientX, y: me.clientY, nodeId: id, nodeLabel: label, actions }
      return
    }

    // Plain click — no popup.
    await fetch('/node-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'node', id, label }),
    }).catch(() => { /* server might not be listening */ })
  }

  async function onEdgeClick(e: Event) {
    e.stopPropagation()
    const el = e.currentTarget as Element
    const id = extractEdgeId(el) ?? ''
    const label = el.textContent?.trim() ?? ''
    // Edge clicks are always plain (no popup).
    await fetch('/node-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'edge', id, label }),
    }).catch(() => { /* server might not be listening */ })
  }

  let clickCleanup: (() => void) | null = null

  function attachClickListeners() {
    detachClickListeners()
    if (!container) return
    const svg = container.querySelector('svg')
    if (!svg) return

    const nodes = svg.querySelectorAll<Element>('.node')
    const edgeLabels = svg.querySelectorAll<Element>('.edgeLabel')

    for (const node of nodes) {
      node.addEventListener('click', onNodeClick)
      node.addEventListener('mousedown', stopPropagation)
      ;(node as HTMLElement).style.cursor = 'pointer'
      node.classList.add('clickable-node')
    }
    for (const edge of edgeLabels) {
      edge.addEventListener('click', onEdgeClick)
      edge.addEventListener('mousedown', stopPropagation)
      ;(edge as HTMLElement).style.cursor = 'pointer'
    }

    clickCleanup = () => {
      for (const node of nodes) {
        node.removeEventListener('click', onNodeClick)
        node.removeEventListener('mousedown', stopPropagation)
        ;(node as HTMLElement).style.cursor = ''
        node.classList.remove('clickable-node')
      }
      for (const edge of edgeLabels) {
        edge.removeEventListener('click', onEdgeClick)
        edge.removeEventListener('mousedown', stopPropagation)
        ;(edge as HTMLElement).style.cursor = ''
      }
    }
  }

  function detachClickListeners() {
    clickCleanup?.()
    clickCleanup = null
  }

  // ── Autonomous node-to-frame navigation ────────────────────────────────────

  let ntfCleanup: (() => void) | null = null

  function attachNodeToFrameListeners(map: Record<string, number>) {
    detachNodeToFrameListeners()
    if (!container) return
    const svg = container.querySelector('svg')
    if (!svg) return

    const nodes = svg.querySelectorAll<HTMLElement>('.node')
    for (const node of nodes) {
      const id = extractNodeId(node)
      if (id === null || !(id in map)) continue
      const targetFrame = map[id]
      const handler = (e: Event) => {
        e.stopPropagation()
        fetch('/seek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frame: targetFrame }),
        }).catch(() => { /* no-op */ })
      }
      node.addEventListener('click', handler)
      node.addEventListener('mousedown', stopPropagation)
      node.style.cursor = 'pointer'
      ntfCleanup = (() => {
        const prev = ntfCleanup
        return () => {
          prev?.()
          node.removeEventListener('click', handler)
          node.removeEventListener('mousedown', stopPropagation)
          node.style.cursor = ''
        }
      })()
    }
  }

  function detachNodeToFrameListeners() {
    ntfCleanup?.()
    ntfCleanup = null
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
    if (reportTimer) clearTimeout(reportTimer);
  });

  // Re-attach (or detach) click listeners when clickable prop changes.
  $: if (clickable) { attachClickListeners() } else { detachClickListeners(); popup = null }

  // Re-attach (or detach) node-to-frame listeners when nodeToFrame prop changes.
  $: if (nodeToFrame) { attachNodeToFrameListeners(nodeToFrame) } else { detachNodeToFrameListeners() }

  $: transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  $: cursor = dragging ? "grabbing" : "grab";
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

  {#if popup}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="popup-backdrop" on:click={dismissPopup}></div>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="node-action-popup"
      style="position: fixed; left: {popup.x}px; top: {popup.y}px;"
      on:click|stopPropagation={() => {}}
    >
      {#each popup.actions as action, i (i)}
        <div class="popup-item" role="button" tabindex="0" on:click={() => selectAction(action)} on:keydown={(e) => e.key === 'Enter' && selectAction(action)}>
          {action}
        </div>
      {/each}
    </div>
  {/if}
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

  /* Transparent backdrop — covers the whole viewport to catch outside clicks. */
  .popup-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  /* Floating popup menu. */
  .node-action-popup {
    z-index: 100;
    background: #fff;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    min-width: 140px;
    overflow: hidden;
    transform: translate(4px, 4px); /* slight offset from cursor */
  }

  .popup-item {
    padding: 9px 16px;
    font-size: 13px;
    color: #222;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  .popup-item:hover {
    background: #f0f5ff;
    color: #1a6ec7;
  }

  .popup-item + .popup-item {
    border-top: 1px solid #f0f0f0;
  }
</style>
