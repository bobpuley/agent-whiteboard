// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createPanZoom } from "../../../../client/src/renderers/mermaid/panZoom";

function makeWrapper(width: number, height: number): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: height, configurable: true });
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return el;
}

function makeSvg(vbW: number, vbH: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  return svg;
}

describe("createPanZoom", () => {
  let wrapper: HTMLDivElement;
  let container: HTMLDivElement;
  let snapshotId: string | undefined;
  let currentFrame: number;

  beforeEach(() => {
    wrapper = makeWrapper(200, 100);
    container = document.createElement("div");
    snapshotId = "snap-1";
    currentFrame = 0;
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function makeCamera() {
    return createPanZoom({
      getWrapper: () => wrapper,
      getContainer: () => container,
      getSnapshotId: () => snapshotId,
      getCurrentFrame: () => currentFrame,
    });
  }

  it("defaults to scale 1, no translation, not dragging", () => {
    const cam = makeCamera();
    expect(get(cam.scale)).toBe(1);
    expect(get(cam.tx)).toBe(0);
    expect(get(cam.ty)).toBe(0);
    expect(get(cam.dragging)).toBe(false);
  });

  it("fitToView scales the svg's viewBox to contain within the wrapper, centered", () => {
    const cam = makeCamera();
    const svg = makeSvg(100, 50); // wrapper is 200x100 -> fit scale limited by height: 100/50=2, width 200/100=2
    cam.fitToView(svg);
    // fitScale = min(2, 2) * 0.92 = 1.84
    expect(get(cam.scale)).toBeCloseTo(1.84, 5);
    const scale = get(cam.scale);
    expect(get(cam.tx)).toBeCloseTo((200 - 100 * scale) / 2, 5);
    expect(get(cam.ty)).toBeCloseTo((100 - 50 * scale) / 2, 5);
  });

  it("fitToView clamps to MIN_SCALE/MAX_SCALE", () => {
    const cam = makeCamera();
    const tiny = makeSvg(100000, 100000);
    cam.fitToView(tiny);
    expect(get(cam.scale)).toBe(0.1);

    const huge = makeSvg(1, 1);
    cam.fitToView(huge);
    expect(get(cam.scale)).toBe(10);
  });

  it("applyViewport converts normalized fractions to pixel translation", () => {
    const cam = makeCamera();
    cam.applyViewport({ scale: 2, positionX: 0.25, positionY: 0.5 });
    expect(get(cam.scale)).toBe(2);
    expect(get(cam.tx)).toBe(50); // 0.25 * 200
    expect(get(cam.ty)).toBe(50); // 0.5 * 100
  });

  it("resetTransform re-fits when an svg is present in the container", () => {
    const cam = makeCamera();
    const svg = makeSvg(100, 50);
    container.appendChild(svg);
    cam.applyViewport({ scale: 5, positionX: 0.9, positionY: 0.9 });
    cam.resetTransform();
    expect(get(cam.scale)).toBeCloseTo(1.84, 5);
  });

  it("resetTransform falls back to identity when no svg is present", () => {
    const cam = makeCamera();
    cam.applyViewport({ scale: 5, positionX: 0.9, positionY: 0.9 });
    cam.resetTransform();
    expect(get(cam.scale)).toBe(1);
    expect(get(cam.tx)).toBe(0);
    expect(get(cam.ty)).toBe(0);
  });

  it("onWheel zooms toward the cursor position and clamps scale", () => {
    const cam = makeCamera();
    const wheelEvent = { preventDefault: vi.fn(), deltaY: -100, clientX: 100, clientY: 50 } as unknown as WheelEvent;
    cam.onWheel(wheelEvent);
    expect(wheelEvent.preventDefault).toHaveBeenCalled();
    expect(get(cam.scale)).toBeGreaterThan(1);
  });

  it("onMousedown/onMousemove/onMouseup drags the canvas while the left button is held", () => {
    const cam = makeCamera();
    cam.onMousedown({ button: 0, clientX: 10, clientY: 10, preventDefault: vi.fn() } as unknown as MouseEvent);
    expect(get(cam.dragging)).toBe(true);

    cam.onMousemove({ clientX: 30, clientY: 25 } as MouseEvent);
    expect(get(cam.tx)).toBe(20);
    expect(get(cam.ty)).toBe(15);

    cam.onMouseup();
    expect(get(cam.dragging)).toBe(false);
  });

  it("ignores mousedown for non-left buttons", () => {
    const cam = makeCamera();
    cam.onMousedown({ button: 2, clientX: 10, clientY: 10, preventDefault: vi.fn() } as unknown as MouseEvent);
    expect(get(cam.dragging)).toBe(false);
  });

  it("does not drag when not already dragging", () => {
    const cam = makeCamera();
    cam.onMousemove({ clientX: 999, clientY: 999 } as MouseEvent);
    expect(get(cam.tx)).toBe(0);
    expect(get(cam.ty)).toBe(0);
  });

  it("debounces /viewport reports and includes id, frame, scale, and normalized position", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    currentFrame = 3;
    const cam = makeCamera();
    cam.onWheel({ preventDefault: vi.fn(), deltaY: -100, clientX: 100, clientY: 50 } as unknown as WheelEvent);
    cam.onWheel({ preventDefault: vi.fn(), deltaY: -100, clientX: 100, clientY: 50 } as unknown as WheelEvent);
    expect(global.fetch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/viewport");
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body).toMatchObject({ id: "snap-1", frame: 3 });
    expect(typeof body.scale).toBe("number");
    expect(typeof body.positionX).toBe("number");
    expect(typeof body.positionY).toBe("number");
  });

  it("does not report viewport when no snapshotId is set", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    snapshotId = undefined;
    const cam = makeCamera();
    cam.reportViewport();
    vi.advanceTimersByTime(800);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("destroy clears any pending debounced report", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const cam = makeCamera();
    cam.scheduleViewportReport();
    cam.destroy();
    vi.advanceTimersByTime(800);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
