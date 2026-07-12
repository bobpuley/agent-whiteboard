# Milestone v0.29 — Client Component Responsibility Cleanup (Sprints 62–65)

**Status:** in progress

> Opened 2026-07-12 via `/doc-creator-driver:intake` (feature intake, `01` FR24). Client-side counterpart to `Milestone_v0.28.md`: that cleanup audited `app.ts` (U1, server) for responsibilities hidden inside one file; this audits the four largest `client/src/` components (U6, Render Surface) for the same pattern. Source: `docs/06_frontend-desing-review.md`. See `02` §N8, `03` §10, `04` §9.8. All four requirements are output-equivalence — no user-visible behavior change; the existing Playwright e2e suite (pan/zoom, click routing, node-to-frame, history/delete/export flows) is the primary regression gate, not just `tsc`. One task per sprint, one branch/tag per sprint, matching the convention established in `Milestone_v0.27.md`/`Milestone_v0.28.md`.

### Sprint 62 — Extract `Mermaid.svelte`'s pan/zoom camera into `panZoom.ts`
- [x] **NF29 (part 1).** Move the pan/zoom camera — `scale`/`tx`/`ty`/`dragging` state, `fitToView`, `applyViewport`, `onWheel`, `onMousedown`/`onMousemove`/`onMouseup`, `resetTransform`, `scheduleViewportReport`/`reportViewport` — out of `Mermaid.svelte` into `renderers/mermaid/panZoom.ts`. `Mermaid.svelte` keeps only the Mermaid source→SVG rendering pipeline and the Mermaid-DOM-parsing helpers (`extractNodeId`/`extractNodeLabel`/`extractEdgeId`).
  - *Acceptance:* zoom, pan, drag, double-click-to-reset, and debounced `/viewport` persistence all behave identically; `fitOrRestore`/`isNewSnapshot` per-frame behavior (B19/FR21) is unchanged.
  - *Regression coverage:* existing pan/zoom/viewport-persistence Playwright e2e tests pass unchanged.

### Sprint 63 — Extract click routing + popup into `nodeInteractions.ts` / `NodeActionPopup.svelte`
- [x] **NF29 (part 2) + NF30.** Move click-to-server-action routing (`attachClickListeners`/`detachClickListeners`, `onNodeClick`/`onEdgeClick`, `POST /node-click`) and autonomous node→frame navigation wiring (`attachNodeToFrameListeners`/`detachNodeToFrameListeners`, `POST /seek`) into `renderers/mermaid/nodeInteractions.ts`. Move the node-action popup (state, markup, styles) into `renderers/mermaid/NodeActionPopup.svelte`, rendered from `Mermaid.svelte`.
  - *Acceptance:* node/edge click routing, the node-action popup menu, and node-to-frame navigation all behave identically, including listener attach/detach timing on `clickable`/`nodeToFrame` prop changes.
  - *Regression coverage:* existing click-routing, popup-menu, and node-to-frame Playwright e2e tests pass unchanged.

### Sprint 64 — Shared `formatTimestamp` and `SnapshotRow`
- [x] **NF31.** Extract `formatTimestamp()` (currently duplicated in `HistoryPanel.svelte` and `DeleteExportModal.svelte`) into `lib/formatTimestamp.ts`. Extract the snapshot-row display (title + type badge + timestamp — markup and CSS both currently duplicated between the same two files) into `lib/SnapshotRow.svelte`, used by both.
  - *Acceptance:* identical rendered markup and styling in both the history panel and the delete/export modal.
  - *Regression coverage:* existing history-panel and delete/export-modal Playwright e2e tests pass unchanged (including any visual/DOM-structure assertions).

### Sprint 65 — Extract `DeleteExportModal.svelte`'s server calls into `lib/snapshotActions.ts`
- [ ] **NF32.** Move the inline fetch logic for `/snapshots/delete-workspace`, `/snapshots/delete-files`, and `/export-html` (including response parsing and error-message extraction) into exported functions (`deleteWorkspace`, `deleteFiles`, `exportItems`) in a new `lib/snapshotActions.ts`. `DeleteExportModal.svelte` calls these and keeps only step/UI orchestration (confirm-arming, step transitions, done/error display).
  - *Acceptance:* delete and export flows (whole-workspace and selected-subset, both modes) behave identically, including error messages shown on failure.
  - *Regression coverage:* existing delete/export Playwright e2e tests pass unchanged.

---

## Definition of Done — v0.29
- `renderers/Mermaid.svelte` contains only Mermaid rendering + Mermaid-DOM-parsing helpers; pan/zoom, click routing, and node-to-frame wiring each live in their own module (NF29, NF30).
- `formatTimestamp` and the snapshot-row display each exist in exactly one place, shared by `HistoryPanel.svelte` and `DeleteExportModal.svelte` (NF31).
- `DeleteExportModal.svelte` contains no direct `fetch()` calls — all server interaction goes through `lib/snapshotActions.ts` (NF32).
- `02` §N8, `03` §10, `04` §9.8 updated from open/scheduled to resolved.
- Full unit + e2e suite green; `tsc --noEmit` (client) and `npm run lint` clean.
