import { get, writable, type Writable } from "svelte/store";

// v0.29 Sprint 62 (NF29 part 1): pan/zoom camera extracted out of
// Mermaid.svelte so the component can be left with just the Mermaid
// source->SVG rendering pipeline. Behavior (including the fit-vs-restore
// semantics from F19/C3 and the per-frame viewport key from bug B19/FR21)
// is unchanged — only the code's location moved.

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;
const ZOOM_FACTOR = 0.001; // scale delta per wheel pixel
const FIT_MARGIN = 0.92; // small breathing room around the fitted diagram
const VIEWPORT_REPORT_DEBOUNCE_MS = 800;

export interface Viewport {
  scale: number;
  positionX: number;
  positionY: number;
}

export interface PanZoomDeps {
  getWrapper: () => HTMLDivElement | undefined;
  getContainer: () => HTMLDivElement | undefined;
  getSnapshotId: () => string | undefined;
  getCurrentFrame: () => number;
}

export interface PanZoomCamera {
  scale: Writable<number>;
  tx: Writable<number>;
  ty: Writable<number>;
  dragging: Writable<boolean>;
  /** Scale-to-contain the diagram's natural (viewBox) size within wrapper, centered. */
  fitToView(svg: SVGSVGElement): void;
  /** Restore a previously-saved viewport (normalized fractions -> pixels). */
  applyViewport(vp: Viewport): void;
  /** Manual "reset view" — re-fit and treat it as a deliberate user choice. */
  resetTransform(): void;
  onWheel(e: WheelEvent): void;
  onMousedown(e: MouseEvent): void;
  onMousemove(e: MouseEvent): void;
  onMouseup(): void;
  /** Debounced report of the live viewport to the server, keyed by snapshotId+frame. */
  scheduleViewportReport(): void;
  reportViewport(): void;
  /** Clears any pending debounced report; call from onDestroy. */
  destroy(): void;
}

export function createPanZoom(deps: PanZoomDeps): PanZoomCamera {
  const scale = writable(1);
  const tx = writable(0);
  const ty = writable(0);
  const dragging = writable(false);

  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginTx = 0;
  let dragOriginTy = 0;
  let reportTimer: ReturnType<typeof setTimeout> | null = null;

  function fitToView(svg: SVGSVGElement) {
    const wrapper = deps.getWrapper();
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
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale));
    scale.set(newScale);
    tx.set((wrapperW - w * newScale) / 2);
    ty.set((wrapperH - h * newScale) / 2);
  }

  function applyViewport(vp: Viewport) {
    const wrapper = deps.getWrapper();
    if (!wrapper) return;
    scale.set(Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale)));
    tx.set(vp.positionX * wrapper.clientWidth);
    ty.set(vp.positionY * wrapper.clientHeight);
  }

  function scheduleViewportReport() {
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      reportTimer = null;
      reportViewport();
    }, VIEWPORT_REPORT_DEBOUNCE_MS);
  }

  function reportViewport() {
    const snapshotId = deps.getSnapshotId();
    const wrapper = deps.getWrapper();
    if (!snapshotId || !wrapper) return;
    const positionX = get(tx) / wrapper.clientWidth;
    const positionY = get(ty) / wrapper.clientHeight;
    fetch("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: snapshotId,
        frame: deps.getCurrentFrame(),
        scale: get(scale),
        positionX,
        positionY,
      }),
    }).catch(() => {
      /* server might not be listening */
    });
  }

  function resetTransform() {
    const svg = deps.getContainer()?.querySelector("svg");
    if (svg) fitToView(svg);
    else {
      scale.set(1);
      tx.set(0);
      ty.set(0);
    }
    scheduleViewportReport();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const wrapper = deps.getWrapper();
    if (!wrapper) return;
    const currentScale = get(scale);
    const delta = -e.deltaY * ZOOM_FACTOR;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale + delta * currentScale));

    // Zoom toward the cursor position inside the wrapper.
    const rect = wrapper.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Adjust translation so the point under the cursor stays fixed.
    const currentTx = get(tx);
    const currentTy = get(ty);
    tx.set(cursorX - (cursorX - currentTx) * (newScale / currentScale));
    ty.set(cursorY - (cursorY - currentTy) * (newScale / currentScale));
    scale.set(newScale);
    scheduleViewportReport();
  }

  function onMousedown(e: MouseEvent) {
    if (e.button !== 0) return; // left button only
    dragging.set(true);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginTx = get(tx);
    dragOriginTy = get(ty);
    e.preventDefault();
  }

  function onMousemove(e: MouseEvent) {
    if (!get(dragging)) return;
    tx.set(dragOriginTx + (e.clientX - dragStartX));
    ty.set(dragOriginTy + (e.clientY - dragStartY));
    scheduleViewportReport();
  }

  function onMouseup() {
    dragging.set(false);
  }

  function destroy() {
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = null;
  }

  return {
    scale,
    tx,
    ty,
    dragging,
    fitToView,
    applyViewport,
    resetTransform,
    onWheel,
    onMousedown,
    onMousemove,
    onMouseup,
    scheduleViewportReport,
    reportViewport,
    destroy,
  };
}
