// Unified content model (U2/U3, v0.26 — docs/04_architecture.md §9.1),
// mirroring server/presentation.ts. The client only ever receives one frame
// per WS broadcast today (the server resolves which frame to show and sends
// just that one) — `frames` holds just the current frame and `cursor` stays
// 0 until Sprint 42 changes the wire format to carry the full sequence.

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
