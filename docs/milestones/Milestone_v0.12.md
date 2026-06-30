# Milestone v0.12 — Done Button Visibility & History Delete

> Status: released.
> Objective: Make the Done button context-sensitive (only visible when the agent is waiting for the user), and give the user the ability to delete snapshot entries from the history panel.

---

## Context

Two unrelated but small UX improvements shipped together.

**Done button:** The Done button currently shows at all times, which is misleading — clicking it does nothing unless the agent has called `wait_done()`. The fix requires the server to broadcast an armed/unarmed state via WebSocket so the browser can show or hide the button accordingly.

**History delete:** The history panel accumulates snapshots indefinitely. Users need a way to clean up old entries — ranging from deleting a single file to removing an entire workspace folder. A recycle bin icon in the header activates delete/selection mode; the header button layout is also tidied up (right-aligned, with a vertical separator before the close button).

---

## Requirements Addressed

- **FR11** → U4a update (Done button conditional visibility; `set_done_armed` WebSocket event; H8)
- **FR12** → U7e (single delete, multi-select delete, clear workspace, workspace delete; K1–K2)
- **FR13** → U7f (recycle bin icon in header; right-aligned button layout; v-separator)

---

## Planned Scope

### Done button (FR11)

1. `server/events.ts` — add `doneArmed: boolean` module-level variable; set `true` in `waitForDone()` entry, `false` on resolution (click or timeout). Expose a `getDoneArmed()` getter.
2. `server/ws.ts` — on new WebSocket connection, immediately push `{ action: "set_done_armed", armed: getDoneArmed() }`.
3. `server/events.ts` — after every state change to `doneArmed`, call `broadcastDoneArmed(state)` (via ws.ts) so all open browser tabs stay in sync.
4. `client/src/App.svelte` — listen for `set_done_armed` WebSocket message; show/hide the Done button in the right-side controls panel accordingly. Button starts hidden (default `armed = false`).

### History delete (FR12 + FR13)

5. `server/app.ts` — add three new POST endpoints:
   - `POST /snapshots/delete-files` — body `{ workspace, filenames[] }`; delete matching files; return `{ ok, deleted: N }`.
   - `POST /snapshots/clear-workspace` — body `{ workspace }`; delete all `*_screen.json` files, keep directory; return `{ ok, deleted: N }`.
   - `POST /snapshots/delete-workspace` — body `{ workspace }`; `rmdirSync` workspace dir recursively; reset `lastWorkspace` if it matches; return `{ ok }`.
   - All three: apply same workspace safe-name check as `POST /snapshots/load`; filename check same as existing.
6. `client/src/HistoryPanel.svelte` — add recycle bin icon to header. Clicking it toggles selection mode.
   - **Selection mode:** checkboxes appear on every snapshot row across all workspace sections. Header shows "Delete selected" and "Cancel" buttons (replacing or augmenting the recycle bin icon). Each workspace accordion header shows two additional actions: "Clear workspace" and "Delete workspace" (with confirmation dialog for workspace delete).
   - **Delete selected:** calls `POST /snapshots/delete-files` with selected items; removes rows from the panel; exits selection mode.
   - **Clear workspace:** calls `POST /snapshots/clear-workspace`; removes all rows in that workspace section but keeps the section header.
   - **Delete workspace:** shows confirmation dialog; on confirm, calls `POST /snapshots/delete-workspace`; removes the workspace section entirely.
7. `client/src/HistoryPanel.svelte` — header layout: recycle bin and lock/unlock buttons right-aligned; vertical separator between the action button group and the close button. Layout: `[spacer/title] [recycle-bin] [lock-unlock] | [close]`.

### Tests

8. `tests/unit/server/app.test.ts` — tests for the three new delete endpoints (valid delete, missing files skipped, workspace not found, path-traversal rejected, `lastWorkspace` reset on workspace delete).

---

## Tasks

- [x] **T1 — `server/events.ts`:** Add `doneArmed` variable, `getDoneArmed()` getter, `broadcastDoneArmed()` call on state change.
- [x] **T2 — `server/ws.ts`:** Push `set_done_armed` event to every new WebSocket connection with current state.
- [x] **T3 — `client/src/App.svelte`:** Hide Done button by default; show/hide on `set_done_armed` WebSocket message.
- [x] **T4 — `server/app.ts`:** Implement `POST /snapshots/delete-files`, `POST /snapshots/clear-workspace`, `POST /snapshots/delete-workspace`.
- [x] **T5 — `client/src/HistoryPanel.svelte`:** Recycle bin icon in header, selection mode, delete selected, clear workspace, delete workspace (with confirmation).
- [x] **T6 — `client/src/HistoryPanel.svelte`:** Right-align action buttons; add vertical separator before close button.
- [x] **T7 — `tests/unit/server/app.test.ts`:** Tests for the three new delete endpoints.

---

## Acceptance Criteria

- Done button is hidden on page load and only appears after `wait_done()` is called; it disappears when the call resolves or times out.
- Reloading the browser while `wait_done()` is armed causes the Done button to appear immediately (server sends current state on connect).
- A single snapshot can be deleted from the history panel; the row disappears.
- Multiple snapshots can be selected and deleted in one action; all selected rows disappear.
- "Clear workspace" removes all rows inside a workspace section but keeps the section accordion header visible (empty).
- "Workspace delete" (after confirmation) removes the entire workspace section from the panel.
- All delete operations are permanent; the confirmation dialog appears for "Workspace delete".
- Header layout: recycle bin and lock/unlock icons aligned right; vertical separator before close button.
- All existing tests pass.
