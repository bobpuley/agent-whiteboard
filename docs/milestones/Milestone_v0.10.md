# Milestone v0.10 — UI Controls Panel + History UX

> Sprint 23. Status: in progress.
> Objective: Move the History toggle and Done button into a small right-side panel; replace the Done text label with an icon; add a lock/unlock toggle to the history panel header; and make history loads update the current workspace.

---

## Context

Three UX improvements to the browser client, plus one server-side behavioral fix:

- **FR9 (UI Controls Panel):** The Done button (bottom-right since v0.2) and the history toggle button are scattered. Moving them into a compact, always-visible right-side panel declutters the canvas and gives them a permanent, predictable home. The Done button becomes icon-only (no text).
- **FR10 (History lock/unlock):** Users who want to load several snapshots in sequence have to reopen the history panel after each load. A lock toggle on the panel header prevents auto-close so the user can browse without interruption.
- **FR8 (Workspace set on history load):** When a snapshot from a different workspace is loaded, `lastWorkspace` is not updated. This means the history panel auto-expands the wrong section on the next open. Fixing this makes workspace context follow user browsing intent.

---

## Requirements Addressed

- **FR8** → U7c, F12 (lastWorkspace update on load)
- **FR9** → U7d, U4a (right-side panel; Done button icon-only)
- **FR10** → U7b (history panel lock/unlock toggle)

---

## Architecture Impact

- **Server:** `POST /snapshots/load` — on success, update `lastWorkspace` (in `session.ts`) to the workspace of the loaded snapshot. Single line change to the existing handler.
- **Client (`App.svelte`):** Replace footer/bottom-right button layout with a small fixed right-side panel component. Done button gets an icon; tooltip on hover shows "Done".
- **Client (`HistoryPanel.svelte`):** Add lock/unlock toggle state. When locked, skip the `closePanel()` call in the snapshot-load success handler. Toggle button in panel header (icon or small symbol).

No new endpoints or MCP tools. No schema changes.

---

## Tasks

- [x] **T1 — `server/app.ts` (or `session.ts`):** In `POST /snapshots/load`, after successful broadcast, call `setLastWorkspace(workspace)` where `workspace` is the loaded snapshot's workspace. Add `setLastWorkspace()` to `session.ts` if not already exported (currently only `getLastWorkspace()` / `lastWorkspace` is used by history endpoints).
  - DoD: after loading a cross-workspace snapshot, `GET /snapshots/all` returns `isCurrent: true` for the loaded workspace. Unit test added in `app.test.ts`.

- [x] **T2 — `client/src/App.svelte`:** Remove the Done button from its current footer/bottom-right location. Create a small fixed right-side panel (`<div class="controls-panel">`) that contains the history toggle button and the Done button. Done button: icon only (e.g. a checkmark/tick SVG icon); tooltip `title="Done"`; same click handler (`POST /user-done`); same "Sent ✓" feedback (2 s).
  - DoD: panel visible on all viewport sizes without occluding the canvas; Done button fires `POST /user-done` as before; 2 s "Sent ✓" feedback still works; existing e2e test for the Done button feedback passes.

- [x] **T3 — `client/src/HistoryPanel.svelte`:** Add a `locked` boolean state (default `false`). Add a small toggle button in the panel header (icon: e.g. lock/unlock SVG or 🔒/🔓 or similar). When `locked === false`: on successful snapshot load, close the panel (current behavior). When `locked === true`: skip the close call; panel stays open. Toggle button visually indicates locked/unlocked state.
  - DoD: unlocked (default) behaves as before; locked keeps panel open after load; toggle button toggles state correctly; no regressions in existing history panel tests.

- [x] **T4 — `tests/unit/server/app.test.ts`:** Add test: after `POST /snapshots/load { workspace: "other", filename: "…" }`, `GET /snapshots/all` returns `isCurrent: true` for `"other"`.
  - DoD: new test green; no existing tests broken.

- [x] **T5 — `tests/e2e/canvas.spec.ts`:** Update any test that references the Done button's old position/selector to match the new right-side panel placement. Confirm Done button e2e test still passes.
  - DoD: all 28 e2e tests pass.

---

## Acceptance Criteria

- [x] A small right-side panel is always visible in the browser; it contains the history toggle button and the Done button (icon only).
- [x] Clicking the Done button fires `POST /user-done` and shows "Sent ✓" for 2 s (behavior unchanged).
- [x] The history panel has a lock/unlock toggle in its header. Unlocked (default): loading a snapshot closes the panel. Locked: loading a snapshot keeps the panel open.
- [x] After loading a snapshot from workspace "X", the history panel auto-expands section "X" on the next open.
- [x] All Vitest unit/integration tests (`npm test`) pass.
- [x] All Playwright e2e tests (`npm run test:e2e`) pass.
