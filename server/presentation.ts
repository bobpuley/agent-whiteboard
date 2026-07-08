// Unified content model (U2, v0.26 — docs/04_architecture.md §9.1).
// Frame is the one atomic renderable; Presentation is an ordered list of them.
// Not yet the internal canvas-state representation — session.ts/canvasStore.ts
// adopt this in Sprint 40/41. For now it's the shape validateFrame() validates.

export interface Frame {
  type: string;
  payload: string;
  label?: string;
}

export interface Presentation {
  id?: string;
  title?: string;
  cursor: number;
  frames: Frame[];
}
