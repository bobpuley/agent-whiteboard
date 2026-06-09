# Milestone v0.4 — History Navigator (Sprint 17)

**Status:** released

### Sprint 17 — History navigator

**Goal:** let the user see and browse the snapshot history in the browser UI without leaving the whiteboard, and load any past snapshot back onto the canvas.

**Scope:**

- [x] **`server/snapshot-reader.ts`** (new): `listSnapshots(workspace, dir)` — reads all `*_screen.json` files in `<dir>/<workspace>/`, parses each, returns sorted list (newest-first): `[{ filename, timestamp, type, title? }]`. Handles missing directory (returns empty array). Handles unreadable or malformed files (skips with warning to stderr).
- [x] **`server/app.ts` — `GET /snapshots`**: calls `listSnapshots()`, returns `{ ok: true, snapshots: [...] }`. Respects `WHITEBOARD_SNAPSHOTS_DIR` and `WHITEBOARD_WORKSPACE` env vars.
- [x] **`server/app.ts` — `POST /snapshots/load`**: reads body `{ filename }`, validates no path traversal (filename must match `*_screen.json` and contain no `/` or `..`), reads snapshot from disk, validates payload (same hard gate as `POST /render`), broadcasts to browser via WebSocket, updates in-memory canvas state. Does NOT call `saveSnapshot()`. Returns `{ ok: true }` or `{ ok: false, error: "..." }`.
- [x] **`client/src/HistoryPanel.svelte`** (new): toggleable panel. Fetches `GET /snapshots` on open; renders list (human-friendly timestamp, type badge, title or "—" if absent); clicking a row calls `POST /snapshots/load` and closes the panel. Hidden by default.
- [x] **`client/src/App.svelte`**: add toggle button for history panel (history icon, bottom-left or toolbar); wire up `HistoryPanel.svelte`; panel must not obscure the canvas when closed.
- [x] **`tests/unit/server/app.test.ts`**: new tests for `GET /snapshots` (returns sorted list, returns empty array when directory absent, skips malformed files) and `POST /snapshots/load` (valid file loads and broadcasts, missing file returns error, path traversal rejected, invalid payload returns error, saveSnapshot is NOT called).
- [x] **`tests/e2e/canvas.spec.ts`**: new e2e tests covering history panel toggle, list rendering, and load-onto-canvas flow.

**DoD:**
- `GET /snapshots` returns the list of snapshot files for the current workspace, sorted newest-first; each entry includes `filename`, `timestamp`, `type`, and `title` (if present in the snapshot)
- `POST /snapshots/load` renders the named snapshot on the canvas without writing a new snapshot file; `saveSnapshot()` is verifiably not called
- History panel opens and closes via toggle button; does not obscure canvas when closed
- Panel shows title + timestamp + type for each entry; shows "—" when title is absent
- Clicking an entry renders that snapshot on the canvas and closes the panel
- Path traversal attempts (`../`, absolute paths) are rejected with `{ ok: false, error: "..." }`
- `npm test` passes; `npm run test:e2e` passes
