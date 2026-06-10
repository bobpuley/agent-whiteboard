# Milestone v0.5 — History: Workspace Groups (Sprint 18)

**Status:** in progress

### Sprint 18 — Workspace-grouped history accordion

**Goal:** enhance the history panel to display snapshots from all workspaces, grouped in an accordion, with the current workspace auto-expanded.

**Scope:**

- [x] **`server/snapshot-reader.ts`** — add `listAllSnapshots(dir, currentWorkspace)`: scans every subdirectory of `dir`, reads each workspace's `*_screen.json` files, returns `[{ name, isCurrent, snapshots: [{ filename, timestamp, type, title? }] }]` sorted alphabetically by workspace name; each workspace's snapshot list sorted newest-first. Workspaces with no readable snapshots are omitted. Handles missing root directory (returns empty array). Handles unreadable/malformed files (skips with warning to stderr).
- [x] **`server/app.ts` — `GET /snapshots/all`**: calls `listAllSnapshots()`, returns `{ ok: true, workspaces: [...] }`. Respects `WHITEBOARD_SNAPSHOTS_DIR` and `WHITEBOARD_WORKSPACE` env vars.
- [x] **`server/app.ts` — `POST /snapshots/load`** (update): extend to accept optional `workspace` field in request body. If present, validate it is a plain directory name (safe-name regex: `[a-zA-Z0-9_\-. ]+`, no slashes, no `..`, no null bytes) and that the directory exists under `WHITEBOARD_SNAPSHOTS_DIR`. If absent, default to current workspace (backward-compatible). All other logic unchanged.
- [x] **`client/src/HistoryPanel.svelte`** (update): switch from `GET /snapshots` to `GET /snapshots/all`. Render an accordion (one `<details>` or equivalent per workspace). The section where `isCurrent: true` is open by default; others are closed. Each snapshot row inside a section is identical to v0.4. On row click, pass `{ workspace: section.name, filename }` to `POST /snapshots/load`.
- [x] **`tests/unit/server/app.test.ts`**: new tests for `GET /snapshots/all` (returns all workspaces grouped, marks current, returns empty when root absent, skips malformed files) and `POST /snapshots/load` workspace field (valid workspace loads cross-workspace snapshot, invalid workspace name rejected, missing workspace defaults to current).
- [x] **`tests/e2e/canvas.spec.ts`**: new e2e tests covering accordion render, current workspace auto-expanded, cross-workspace load flow.

**DoD:**

- `GET /snapshots/all` returns all workspaces under the snapshots root, each with their snapshot list sorted newest-first; `isCurrent` correctly identifies the running workspace
- Workspaces with no readable snapshots are absent from the response
- `POST /snapshots/load` accepts `{ workspace, filename }`; workspace safety check rejects names containing `/`, `..`, or null bytes; missing workspace defaults to current workspace
- History panel fetches `GET /snapshots/all`; accordion renders one section per workspace; current workspace section is open on panel open; all others are closed
- Clicking an entry from any workspace renders that snapshot on the canvas and closes the panel
- `npm test` passes; `npm run test:e2e` passes
