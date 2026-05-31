// In-memory canvas state — single canvas, no persistence in v1.

export type CanvasState =
  | { type: "mermaid"; payload: string }
  | { type: "empty" };

let canvas: CanvasState = { type: "empty" };

export function getCanvas(): CanvasState {
  return canvas;
}

export function setCanvas(type: "mermaid", payload: string): void {
  canvas = { type, payload };
}

export function clearCanvas(): void {
  canvas = { type: "empty" };
}

/** Returns the current source spec, or empty string if canvas is blank. */
export function exportCanvas(): string {
  if (canvas.type === "empty") return "";
  return canvas.payload;
}
