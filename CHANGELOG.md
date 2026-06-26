## 0.9.0 — 2026-06-26

- **Live browser preview on `append_frame()`:** each valid `append_frame()` call now immediately broadcasts the accumulated partial step-frames sequence to the browser, so the user watches the step-through diagram grow one frame at a time — no waiting for `commit_step_frames()`
- `commit_step_frames()` is now **finalization-only**: assembles the full step-frames JSON, writes the snapshot, updates in-memory canvas state (so `export()` works), cancels any running slideshow, and sends a final broadcast for consistency (handles `clear()` edge cases) — the primary visual was already rendered incrementally by `append_frame()`
- `export()` before `commit_step_frames()` continues to return the pre-build canvas state; after commit it returns the fully assembled step-frames JSON (unchanged contract)
- `server/ws.ts` gains `broadcastStepFrames(frames, frameType, currentFrame, title?)` — shared helper used by both `append_frame` and `commit_step_frames`
- `appendFrame()` in `step-frames-builder.ts` returns enriched success result including `frames`, `frame_type`, and `title` (callers use this to broadcast without a second lookup)
- REST endpoint `POST /step-frames/:id/frame` mirrors the change (pushes to browser after each valid append)
- MCP tool descriptions for `append_frame`, `commit_step_frames`, and `init_step_frames` updated to reflect v0.9 behavior
- 10 new unit tests verifying broadcast calls and canvas-state isolation during incremental builds
- **e2e fix:** all 14 Playwright tests that were silently failing since v0.7 now pass — the calls to `POST /render` lacked the required `options.workspace` parameter; all 28 e2e tests green

## 0.8.0 — 2026-06-24

- **New three-tool protocol for incremental step-frames construction:** `init_step_frames()`, `append_frame()`, `commit_step_frames()` — lets agents build complex step-frames sequences one frame at a time instead of generating one large JSON payload in a single shot
- `init_step_frames(frame_type, workspace, title?)` — creates an in-memory builder session, pushes a "Building step-frames… 0 frames" placeholder to the browser, returns a UUID
- `append_frame(id, payload, label?)` — validates payload against `frame_type` (same hard gate as `render()`), appends to the session; invalid frames are rejected without disturbing prior frames
- `commit_step_frames(id)` — assembles full step-frames JSON, cancels any running slideshow, writes snapshot, broadcasts to browser (identical path to `render(type="step-frames", ...)`); `export()` returns assembled JSON after commit
- Partial builder sessions expire silently after 30 minutes of inactivity; expired IDs return `{ ok: false, error: "step-frames session not found or expired" }`
- REST fallback endpoints: `POST /step-frames/init`, `POST /step-frames/:id/frame`, `POST /step-frames/:id/commit`
- Browser shows a placeholder state ("Building step-frames… N frames") during construction; diagram renders normally after commit
- `server/validate.ts` now exports `validatePayload()` as a shared helper (used by both the builder and REST/MCP handlers)
- `server/step-frames-builder.ts` is a new module encapsulating the in-memory builder map with TTL cleanup
- 32 new automated tests: 16 builder unit tests, 16 REST endpoint tests, 1 Playwright e2e test

## 0.7.0 — 2026-06-15

- **Breaking change:** `options.workspace` is now required in both the `render()` MCP tool and `POST /render` REST endpoint; omitting it returns `{ ok: false, error: "workspace is required" }` with HTTP 400 before any render or snapshot write
- Removed the three-level fallback chain (`options.workspace` → `WHITEBOARD_WORKSPACE` env var → `basename(cwd())`); workspace must always be supplied explicitly by the agent
- `WHITEBOARD_WORKSPACE` environment variable is no longer read anywhere in the server codebase (deprecated and removed)
- Server tracks `lastWorkspace` in-memory (updated on every successful `render()` call); `GET /snapshots/all` uses it to determine `isCurrent`, replacing the former env var lookup
- `RenderOptions.workspace` in `snapshot.ts` changed from optional to required; no fallback inside `saveSnapshot()`
- All 109 unit tests updated to pass `options.workspace` explicitly; new tests cover the missing-workspace error path and env-var removal

## 0.6.0 — 2026-06-13

- `render()` MCP tool and `POST /render` REST endpoint now accept `options.workspace` — an optional string that overrides the snapshot workspace for that call only (precedence: per-call > `WHITEBOARD_WORKSPACE` env var > `basename(cwd())`)
- Enables per-session snapshot routing without restarting the server (e.g. one machine, multiple courses each passing their own workspace name)
- Workspace name validation: alphanumeric, dashes, underscores, dots, spaces only — path separators and `..` are rejected with `{ ok: false, error: "..." }`; canvas render proceeds only after validation passes
- `saveSnapshot()` updated to accept explicit workspace parameter; snapshot files land in `~/.agent-whiteboard/<workspace>/` as usual; history panel scope is unaffected (still uses env var / default)
- `isValidWorkspaceName()` helper exported from `server/validate.ts` and shared by MCP tool and REST handler
- 37 new unit tests (workspace validation, snapshot routing, invalid name rejection, step-frames workspace override); 109 unit tests total — all passing

## 0.5.0 — 2026-06-10

- History panel now groups snapshots by workspace in a `<details>` accordion; the current workspace section is auto-expanded on open, all others are collapsed
- `GET /snapshots/all` endpoint: scans all workspace subdirectories under the snapshots root and returns grouped results (`{ ok, workspaces: [{ name, isCurrent, snapshots }] }`)
- `POST /snapshots/load` extended with optional `workspace` field for cross-workspace loading; workspace name safety check (no path separators, no bare `..`, no null bytes); omitting the field defaults to the current workspace (backward-compatible)
- `server/snapshot-reader.ts`: new `listAllSnapshots(dir, currentWorkspace)` function; workspaces with no readable snapshots are omitted from the result
- `client/src/HistoryPanel.svelte`: switched from `GET /snapshots` to `GET /snapshots/all`; accordion UI with `<details>`/`<summary>` elements; "current" badge on the active workspace; snapshot rows pass `{ workspace, filename }` to the load endpoint
- 11 new unit tests (3 for `GET /snapshots/all`, 6 for the workspace field on `POST /snapshots/load`, 2 backward-compat); 11 new e2e tests; 95 unit tests, 27 e2e tests — all passing

## 0.4.0 — 2026-06-09

- Added history navigator: clock toggle button in the browser UI opens a slide-in panel showing past render snapshots
- `GET /snapshots` endpoint: returns workspace snapshot list sorted newest-first (`{ ok, snapshots: [{ filename, timestamp, type, title? }] }`)
- `POST /snapshots/load` endpoint: loads a named snapshot onto the canvas without writing a new snapshot file; path traversal protected; same payload hard-gate as `POST /render`
- `server/snapshot-reader.ts`: new module with `listSnapshots()` (directory scan, malformed-file skipping) and `loadSnapshotContent()` (safe file read)
- `client/src/HistoryPanel.svelte`: new Svelte component — fetches list on open, shows type badge + title + human-friendly timestamp per row, clicking a row loads the snapshot and closes the panel
- `client/vite.config.ts`: added `/snapshots` proxy entry so the Vite dev server forwards both `GET /snapshots` and `POST /snapshots/load` to the Node server
- 22 new unit tests; 7 new e2e tests; 86 unit tests total, all passing

## 0.1.2 — 2026-06-09

- Added render snapshot persistence: every successful `render()` call writes a JSON snapshot to `~/.agent-whiteboard/<workspace>/<timestamp>_screen.json`
- Snapshot schema: `{ timestamp, workspace, type, payload, options }` — captures all renderer types including step-frames
- Workspace name defaults to `basename(process.cwd())`; overridable via `WHITEBOARD_WORKSPACE` env var
- Snapshots root defaults to `~/.agent-whiteboard/`; overridable via `WHITEBOARD_SNAPSHOTS_DIR` env var (used by tests to avoid touching the real home directory)
- Write failures are non-fatal: error logged to stderr, `render()` still returns `{ ok: true }`
- Invalid renders (validation failure) produce no snapshot file
- New module `server/snapshot.ts`; hooks in both `server/app.ts` (REST) and `server/mcp.ts` (MCP tool)
- 6 new unit tests via `vi.mock`; 72 tests total, all passing

## 0.1.1 — 2026-06-08

- Extended `POST /wait-click` to accept an optional `node_actions` body (`Record<string, string[]>`), enabling popup menus from REST callers (previously MCP-only)
- Added `isNodeActionsValid()` guard in `server/app.ts`; invalid payloads return HTTP 400
- Showcase Section 10 rewritten as a real end-to-end interactive popup demo (Client/Server/DB nodes with per-node action menus)
- Added Section 11 — edge click demo (`--edge` flag)
- Composable showcase flags: `-s` (standard 1–8), `-i` (interactive), `-u` (popup), `-e` (edge), `-a` (all); combinable, deduplicated
- Fixed Section 9 edge-click guard to skip drill-down lookup for edge types
- 2 new unit tests (66 total, all passing); docs updated to remove MCP-exclusive restriction on popup menus

## 0.1.0 — 2026-06-08

- Consolidated all test-related files under a single `tests/` root: `tests/e2e/` (Playwright), `tests/human_driven/` (manual scripts), `tests/unit/server/` (Vitest integration tests), `tests/unit/client/` (placeholder for future Svelte unit tests)
- Updated `playwright.config.ts` (`testDir`) and `vitest.config.ts` (`include` pattern) to point to new locations
- Updated import paths in `tests/unit/server/app.test.ts` (`../../../server/*.js`)
- All 64 Vitest + 16 Playwright tests pass; human-driven showcase and click-demo scripts confirmed working from new paths
- Added §9 test-restructure proposal to `01_input-ideas.md`, risks to `02_assumptions-and-risks.md`, updated project structure in `04_architecture.md`
