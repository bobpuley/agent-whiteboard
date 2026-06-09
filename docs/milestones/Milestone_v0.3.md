# Milestone v0.3 — Observability & Infrastructure (Sprints 15–16)

**Status:** released

### Sprint 15 — Test folder restructure

**Goal:** consolidate all test-related files under a single `tests/` root with clear sub-directories by test kind. No new tests; no behavior changes.

**Scope:**

- [x] Create `tests/e2e/`, `tests/human_driven/`, `tests/unit/server/`, `tests/unit/client/` (empty placeholder)
- [x] Move `e2e/canvas.spec.ts` → `tests/e2e/canvas.spec.ts`
- [x] Move `manualtests/showcase.js` → `tests/human_driven/showcase.js`
- [x] Move `manualtests/click-demo.js` → `tests/human_driven/click-demo.js`
- [x] Move `server/app.test.ts` → `tests/unit/server/app.test.ts`
- [x] Update `playwright.config.ts`: `testDir: "./tests/e2e"` (was `"./e2e"`)
- [x] Update `vitest.config.ts`: `include` pattern to `["tests/unit/server/**/*.test.ts"]` (was `["server/**/*.test.ts"]`)
- [x] Update `package.json` scripts: no changes needed — no `manualtests/` references in scripts
- [x] Update import paths in `tests/unit/server/app.test.ts` (updated to `../../../server/*.js`)
- [x] Remove `e2e/`, `manualtests/`, `server/app.test.ts`
- [x] `test-results/` stays at root — no change needed (Playwright default output)
- [x] `npm test` — 64 Vitest tests pass ✅
- [x] `npm run test:e2e` — 16 Playwright tests pass ✅

**DoD:** `npm test` and `npm run test:e2e` green; `node tests/human_driven/showcase.js` runs the slideshow demo; no test file remains outside `tests/`; `server/app.test.ts` and `e2e/` and `manualtests/` no longer exist.

---

### Sprint 16 — Render snapshot persistence ✅

**Goal:** every successful `render()` call leaves a JSON record on disk so the user can audit, replay, or diff visuals across sessions.

**Scope:**

- [x] **`server/snapshot.ts`** (new): `saveSnapshot(type, payload, options)` — resolves workspace and dir, creates directory if absent, writes `{ timestamp, workspace, type, payload, options }` as JSON. Workspace: `WHITEBOARD_WORKSPACE` env || `basename(process.cwd())`. Snapshots root: `WHITEBOARD_SNAPSHOTS_DIR` env || `~/.agent-whiteboard/`. Filename: `yyyyMMdd_HHmmss_screen.json` (local time; use `Date` formatted without colons for cross-platform compatibility). Write failure: catch, log to stderr, do not rethrow. Callers also wrap calls in try/catch for belt-and-suspenders.
- [x] **`server/app.ts` — `POST /render`:** call `saveSnapshot()` after successful validation + WebSocket push. Must not call on validation failure.
- [x] **`server/mcp.ts` — `render()` tool:** same — call `saveSnapshot()` after successful render (after `broadcastRender()`).
- [x] **`step()`, `seek()`, `clear()`, `slideshow()`:** no changes — these do not trigger snapshot writes.
- [x] **Tests:** `vi.mock("../../../server/snapshot.js")` in `tests/unit/server/app.test.ts` — 6 new tests: saveSnapshot called with correct args (plain render, with title, step-frames), not called on invalid render or bad syntax, render still returns `{ ok: true }` when saveSnapshot throws. 72 tests total, all passing.

**DoD:** ✅
- After `render(type="mermaid", payload="graph TD; A-->B", options={title:"Step 1"})`, a file exists at `~/.agent-whiteboard/<workspace>/<timestamp>_screen.json` with `{ "timestamp": "...", "workspace": "...", "type": "mermaid", "payload": "graph TD; A-->B", "options": { "title": "Step 1" } }`
- An invalid render (e.g. bad Mermaid syntax) produces no snapshot file
- A write failure (e.g. unwritable directory) prints a warning to stderr and `render()` still returns `{ ok: true }`
- `npm test` passes (72/72)
