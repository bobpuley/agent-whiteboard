# Milestone v0.16 — Delete/Export Modal Redesign (Sprint 29)

**Status:** released

> Objective: move the history panel's delete and export controls out of its header and into the right-side controls panel, and replace the inline checkboxes-on-rows selection UI with a 2-step modal (pick a workspace → act on the whole workspace or a checked subset of its snapshots). Purely a client-side (Svelte) UX redesign — no server or MCP changes. Prototyped in `mockup/whiteboard-view-v2.html`.

---

## Context

Raw idea (FR16, `01`): "move the delete and export buttons from history panel to the right toolbar... when one is clicked a modal window opens: first step user selects a workspace, second step the view zooms into the selected workspace and the user deletes/exports the entire workspace or selects a subset of snapshots." Goal (user's words): "the history panel is cleaner and the UI for delete and export will be clearer and easier to use."

Resolved via a `/grill-me` design interview (2026-07-03) into the following decisions (full detail in K3, `02`; confirmed live by the user on a second pass after the first attempt got no response):

- Full replacement: the modal replaces the entire inline selection UI (header recycle-bin/export icons, per-row checkboxes, select-bar, per-workspace action bar, and the always-visible per-row hover-delete button). Subset-selection narrows from cross-workspace to single-workspace-per-action.
- Whole-workspace **delete** requires a second confirming interaction (replaces the old `window.confirm()`, consistent with K1); whole-workspace **export** does not (non-destructive).
- Step 1 (choose workspace) is skipped when exactly one workspace has snapshots — the modal opens directly into step 2.
- No new REST endpoints — the modal calls the existing `POST /snapshots/delete-files`, `POST /snapshots/delete-workspace`, and `POST /export-html`.

---

## Requirements Addressed

- **FR16** (`01`) → U7d, U7f (updated), U7e, U7g (superseded), U7h, U7i (new) in `03`
- **K3** (`02`) — delete/export modal redesign decisions

---

### Sprint 29 — Delete/Export Modal Redesign

- [x] **T1 — `client/src/DeleteExportModal.svelte` (new):** 2-step modal component. Props: `mode: "delete" | "export"`, `open: boolean`, `workspaces: WorkspaceGroup[]` (reuse the shape already fetched by `HistoryPanel.svelte` from `GET /snapshots/all`). Step 1: workspace list (name + snapshot count); clicking a row advances to step 2; auto-advance directly to step 2 when `workspaces.length === 1`. Step 2: "Delete/Export entire workspace (N snapshots)" button, a divider, then a checkbox list of that workspace's snapshots; checking ≥1 shows a footer ("N selected" + "Delete/Export selected", disabled at 0). Back arrow (hidden if step 1 was auto-skipped) returns to step 1; close (✕) or overlay-click cancels. Dispatches events the parent (`App.svelte`) handles rather than calling `fetch` directly, keeping this component presentation-only — mirror the existing pattern in `HistoryPanel.svelte` (component owns its own `fetch` calls today; decide during implementation whether to keep that pattern here or lift network calls to the parent for testability).
- [x] **T2 — Confirmation step for destructive actions:** "Delete entire workspace" and "Delete selected" require a second confirming interaction (e.g. button becomes "Click again to confirm" for ~3s, or an inline confirm row) before firing the request — do not use a native `window.confirm()` (inconsistent with the rest of the redesigned modal's styling). Export actions execute on first click.
- [x] **T3 — `client/src/App.svelte`:** add delete and export icon buttons to the controls panel, grouped with a divider between the history-toggle button and the Done button (order: history, divider, delete, export, divider, done). Wire click handlers to open `DeleteExportModal` with the appropriate `mode`; fetch the workspace list (`GET /snapshots/all`) when opening, same call `HistoryPanel.svelte` already makes.
- [x] **T4 — `client/src/HistoryPanel.svelte`:** remove the recycle-bin and export header icons, `selectionMode` state, per-row checkboxes, `select-bar`, `ws-actions-bar`, and the per-row hover-delete button (`row-delete-btn`) and its handler. Panel header becomes `[title/spacer] [lock/unlock] | [close]`. Panel body keeps the read-only accordion + click-to-load behavior (U7, U7a, U7b, U7c) — unaffected.
- [x] **T5 — Wire modal actions to existing endpoints:** whole-workspace delete → `POST /snapshots/delete-workspace`; subset delete → `POST /snapshots/delete-files`; whole-workspace/subset export → `POST /export-html` (existing filename-keyed item shape) followed by the same `<a download>` trigger `HistoryPanel.svelte` already uses. On success, close the modal and refresh the history panel's workspace list if it's open.
- [x] **T6 — Manual verification:** with the app running (`npm run dev`), exercise both delete and export through the new modal — single workspace (step 1 skipped) and multi-workspace (step 1 shown) cases, whole-workspace action with confirmation, and subset selection — confirming files/workspaces actually disappear from disk (`~/.agent-whiteboard/`) and exports still download correctly. Confirm the removed HistoryPanel selection UI leaves no dead CSS/state behind.

> **Implementation note:** no server-side task is needed — `server/app.ts`'s `/snapshots/delete-files`, `/snapshots/delete-workspace`, and `/export-html` handlers and their existing unit tests (`tests/unit/server/app.test.ts`) are unaffected by this milestone.

---

## Definition of Done — v0.16

- Delete and export icon buttons appear in the right-side controls panel, not the history panel header.
- Clicking either opens the 2-step modal: workspace picker (skipped for a single workspace) → zoomed-in view with a whole-workspace action and a checkbox subset + "N selected" footer action.
- Whole-workspace and subset delete require a confirming second interaction; export actions do not.
- The old inline selection-mode UI (header icons, per-row checkboxes, select-bar, per-workspace action bar, per-row hover-delete button) is fully removed from `HistoryPanel.svelte`.
- All three underlying operations (delete files, delete workspace, export) still work end-to-end through the new modal, verified manually against real files on disk.
- All existing tests pass; no server-side test changes required.
