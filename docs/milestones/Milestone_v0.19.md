# Milestone v0.19 — Mermaid Zoom/Pan Fit & Persistence (Sprint 32)

**Status:** released

> Objective: (1) auto-fit a Mermaid diagram to the canvas viewport (scale-to-contain, centered) the first time each new snapshot is displayed; (2) preserve the user's manual zoom/pan for the duration it's on screen — including across `step()`/`seek()` navigation within the same step-frames sequence; (3) persist the user's adjusted viewport per snapshot `id` in a separate cache file, and restore it automatically the next time that exact snapshot is displayed (fresh render or history reload).

---

## Context

Raw idea (FR18, `01`): three-part request — fit-to-view on first open, remember adjustments during the session, and evaluate whether persisting zoom/pan in the snapshot is feasible/worthwhile.

Resolved via a `/grill-me` design interview (2026-07-04; full detail in C3, `02`):
- Every new `render()` call (new snapshot `id`) auto-fits; `step()`/`seek()` within the same sequence does not re-trigger auto-fit — the sequence shares one live viewport.
- The browser debounces zoom/pan changes (~800ms) and reports them to a new `POST /viewport` endpoint, keyed by the snapshot `id`.
- Storage is a separate global cache file (`viewport-cache.json`), not a mutation of the immutable snapshot JSON files — avoids conflicting with F10's write-once snapshot model.
- Position is stored as a normalized fraction of the canvas container (not raw pixels) so a saved view still looks right in a differently-sized window.
- Deleting a snapshot (single or whole-workspace) also deletes its viewport-cache entry — no orphaned bloat.
- Mermaid-only; no MCP tool — pure browser⇄server concern.

---

## Requirements Addressed

- **FR18** (`01`) → C3 (`02`), V1b + F19 (`03`), "Mermaid Viewport Persistence" data flow (`04`)

---

### Sprint 32 — Mermaid Zoom/Pan Fit & Persistence

- [x] **T1 — `client/src/renderers/Mermaid.svelte`:** replace the current unconditional `resetTransform()` (called on every `renderDiagram()`) with: auto-fit (scale-to-contain the rendered SVG's bounding box within `wrapper`, centered on both axes) whenever the diagram being displayed is a genuinely new snapshot (new `source`/new snapshot `id` passed in as a prop) **and** no server-supplied viewport is present; otherwise leave the current live transform untouched (covers `step()`/`seek()` within the same sequence).
- [x] **T2 — `client/src/renderers/Mermaid.svelte`:** accept an optional `viewport: { scale, positionX, positionY } | undefined` prop; when present on a new snapshot, apply it (converting normalized `positionX`/`positionY` back to pixel translate based on the current `wrapper` size) instead of auto-fitting.
- [x] **T3 — `client/src/renderers/Mermaid.svelte`:** on `onWheel`/pan (mousemove while dragging), start/reset an 800ms debounce timer; when it fires, compute `positionX`/`positionY` as fractions of `wrapper`'s current width/height and POST `{ id, scale, positionX, positionY }` to `/viewport` (fire-and-forget, same error-tolerant pattern as the existing `/node-click` calls).
- [x] **T4 — `server/viewport-cache.ts` (new):** `getViewport(id)`, `setViewport(id, viewport)`, `deleteViewport(id)`, `deleteViewportsForWorkspace(ids[])` — reads/writes `<WHITEBOARD_SNAPSHOTS_DIR>/viewport-cache.json` as a flat `id → { scale, positionX, positionY }` map. Creates the file on first write if absent. A write failure logs a warning to stderr and does not block the request (same non-fatal pattern as `snapshot.ts`).
- [x] **T5 — `server/app.ts`:** add `POST /viewport` — body `{ id, scale, positionX, positionY }`; validates `id` is a non-empty string and the numeric fields are finite numbers; calls `setViewport()`; returns `{ ok: true }` (or `{ ok: false, error: "..." }` on invalid body).
- [x] **T6 — `server/ws.ts` / render broadcast paths:** wherever a snapshot is broadcast to the browser (`POST /render`, `commit_step_frames()`, `POST /snapshots/load`), look up `getViewport(id)` after the snapshot `id` is known; if found, include `viewport: { scale, positionX, positionY }` in the broadcast payload.
- [x] **T7 — `server/app.ts`:** in `POST /snapshots/delete-files` and `POST /snapshots/delete-workspace`, after deleting the snapshot file(s), also call `deleteViewport(id)` / `deleteViewportsForWorkspace(ids[])` for each deleted snapshot's `id` (read from the snapshot JSON before deleting the file, or resolved via the existing snapshot-reader lookups).
- [x] **T8 — `tests/unit/server/`:** unit tests for `viewport-cache.ts` (get/set/delete round-trip, missing-file handling) and for the delete-endpoint cleanup (deleting a snapshot removes its cache entry).
- [x] **T9 — `tests/e2e/`:** Playwright test(s): a new diagram auto-fits (bounding box within viewport, roughly centered); manually zooming/panning and reloading the identical snapshot (via history) restores the adjusted view; navigating `step()`/`seek()` within a sequence does not reset the live viewport.
- [x] **T10 — Manual verification:** with `npm run dev` running, open several different-sized Mermaid diagrams, confirm auto-fit looks reasonable on each; zoom/pan one, reload it from history, confirm the exact view is restored; delete that snapshot, confirm no dangling entry remains in `viewport-cache.json`. Confirmed by user 2026-07-04.

> **Implementation note:** the ~800ms debounce and the scale-to-contain fit algorithm are implementation details left to T1/T3 — no specific easing/animation is required; a simple bounding-box `getBBox()`-based fit (matching what `Mermaid.svelte` already does for click/edge extraction) is sufficient.

---

## Definition of Done — v0.19

- A newly rendered Mermaid diagram (new snapshot `id`) is automatically scaled to fit the canvas viewport and centered, with no manual interaction required.
- Manually zooming/panning a diagram is preserved for as long as it's displayed, including across `step()`/`seek()` navigation within the same step-frames sequence.
- Roughly 800ms after the user stops zooming/panning, the adjusted viewport is persisted to `viewport-cache.json`, keyed by the snapshot's `id`.
- Reopening the same snapshot later (fresh `render()` of identical content is not applicable — but a `POST /snapshots/load` history reload of that exact snapshot, or any other broadcast of that same `id`) restores the persisted viewport instead of auto-fitting.
- Deleting a snapshot (single file or whole workspace) also removes its corresponding viewport-cache entry/entries.
- No MCP tool is added; the agent-facing surface is unchanged.
- All existing tests pass; new unit + e2e tests cover the behaviors above.
