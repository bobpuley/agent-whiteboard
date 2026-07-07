## 0.23.0 — 2026-07-07

- **Architecture Consolidation — Unified Projector milestone (Sprint 36):** slice A of the architecture consolidation promoted from `desing-analysis/` (FR22) — the analysis's own "80/20": the single highest-value, lowest-risk structural win, landed over today's `CanvasState` with no schema change
- **One shared broadcast builder replaces 13 hand-built sites:** every server→browser `{ action: "replace", ... }` message — from `render()`, `step()`, `seek()`, history-load (`POST /snapshots/load`), and slideshow ticks/finalization — previously had its own hand-assembled construction spread across `app.ts` (×4), `mcp.ts` (×2), `render-core.ts` (×3), `slideshow.ts` (×3), and `ws.ts` (×1). All 13 now route through one new function, `broadcastReplace()` in `server/ws.ts` (plus `broadcastStepFrames()`, reimplemented as a thin convenience wrapper over it). This is the structural end of the B15/C2b/C2d drift class: a later broadcast producer forgetting a field (`id`, `viewport`, `nodeToFrame`, the step-frames cursor) that another producer already threads through is no longer possible, because there is only one producer
- **Pure internal refactor, no contract change:** the content model, snapshot schema, and MCP payload contract are untouched — only *how* the existing broadcast shape gets constructed. No WebSocket message shape or API contract change; verified against the full unit + e2e suites
- 371 unit tests (up from 365 — 6 new tests directly covering `broadcastReplace()`'s id/cursor/viewport/nodeToFrame inclusion rules) / 38 e2e tests, all pass unchanged
- `04_architecture.md` §2/§3 updated to describe the single projector in place of the per-site broadcast descriptions; §9's target-architecture tables mark U5/Slice A as shipped

## 0.22.0 — 2026-07-07

- **Showcase Coverage, Step-Frames Fit Fix & Slideshow Persistence milestone (Sprint 35):** opened from a feature request (does `tests/human_driven/showcase.js` demonstrate every shipped feature, excluding delete/export?) plus a step-frames fit bug report; three further items (B16, FR20, B17) surfaced during verification and were folded in rather than deferred, since each blocked verifying the item before it
- **Fix — slideshow-driven renders never auto-fit (bug B15):** `server/slideshow.ts`'s `broadcastSlide()`/`broadcastTick()` never included an `id` in their WebSocket broadcasts, so the browser's `isNewSnapshot()` check (F19) was always false for `POST /slideshow`-driven content and auto-fit never triggered. Fixed by generating and threading a snapshot `id` through every slideshow broadcast — fresh per plain slide, one id shared across a step-frames sequence's frame ticks (continuation semantics, matching `/step`/`/seek`). Necessary but, as B17 revealed, not sufficient on its own
- **Fix — the real root cause: unsized Mermaid SVGs (bug B17):** even after B15, diagrams still rendered small/uncentered *live* (History-reloaded content was always correct). `fitToView()`'s computed scale was mathematically correct against the `viewBox`, but `getBoundingClientRect()` showed the SVG actually rendering at ~300×150 — the CSS spec's default replaced-element size — because Mermaid emits `width="100%"` with no explicit height and `Mermaid.svelte` deliberately leaves the container unsized. Headless Chromium (used for all automated reproduction) resolves the percentage differently and never hit this fallback, which is why every automated repro looked fine and only a real browser reproduced it. Fixed by explicitly pinning the SVG's `width`/`height` attributes to its `viewBox` dimensions immediately after insertion; confirmed fixed live by the user
- **Feature — slideshow finalize-on-end persistence + required `workspace` (FR20):** `POST /slideshow` never called `saveSnapshot()` (since Sprint 9), so nothing shown via a slideshow ever appeared in History. Now models "transient until finalized" mirroring `init_step_frames`/`append_frame`/`commit_step_frames` (F15): individual ticks stay transient, and exactly one snapshot is written when the session ends (natural completion, explicit stop, or supersession by a new `render()`/`slideshow()`), capturing whatever was last on screen. Adds a now-required `workspace` parameter to `slideshow()`/`POST /slideshow` (explicit-required, no `lastWorkspace` fallback, matching `render()`'s F14 pattern). `clear()` deliberately does not finalize (`cancelSlideshow({ persist: false })`), preserving F10
- **Feature — showcase feature-coverage audit (FR19):** audited showcase Sections 1–12 against `03_requirements.md`'s full feature list (excluding delete/export per instruction); found two shipped MCP features with no demo — the incremental step-frames protocol (F15) and `node_to_frame` autonomous navigation (U4e). Added as Section 13 and Section 14 to `tests/human_driven/showcase.js` with new `-c`/`--incremental` and `-n`/`--nodetoframe` flags (folded into `-a`/`--all`)
- **Fix — `node_to_frame` clicks 404 in dev mode (bug B16):** `client/vite.config.ts`'s dev proxy never listed `/seek`, the one endpoint the browser calls directly for `node_to_frame`. Added the proxy entry; production single-origin builds were never affected
- **Not implemented — re-fit per frame for step-frames (FR21):** fixing B17 exposed the residual risk in C3 (`02`) that a step-frames sequence's single shared fit (computed at frame 0) can overflow/under-fill later frames of very different size. Intentionally intake-only per explicit user instruction — tracked in `01`/`02`/`03`, no milestone assigned
- 365 unit tests (up from 356), typecheck clean (server `tsc` + client `svelte-check`); slideshow auto-fit and `node_to_frame` dev-mode behavior confirmed live in a real browser

## 0.21.0 — 2026-07-05

- **Design Debt — Core Consolidation milestone:** the second of two milestones promoting the Design Debt Log (`01_input-ideas.md`) into scheduled work — the behavior-risk refactor pass, sequenced after v0.20's safety net (linter + blanket test coverage)
- **`App.svelte` decomposed into stores/reducers:** the 449-line god component is split into five focused modules under `client/src/stores/`: `canvasStore` (canvas content + clickable/nodeActions/nodeToFrame state), `doneStore` (Done-button armed/sent/error lifecycle), `modalStore` (delete/export modal orchestration), `stepNav` (step-frame prev/next), and `wsRouter` (WebSocket connection lifecycle + command fan-out to the other stores). `App.svelte` is now a thin composition layer; no template, CSS, or behavior changes
- **Mermaid/KaTeX/Vega-Embed switched to per-canvas-type dynamic `import()`:** each renderer now lazy-loads its heavy rendering library on first use instead of eager static import, cached after the first call. Main entry bundle drops from ~1.7MB to ~78KB; each library ships in its own chunk fetched only when that canvas type is first rendered. A one-time loading delay on first use is an accepted trade-off — no loading spinner added. Added render-token guards to KaTeX (matching the existing Mermaid/VegaLite B8 pattern) so a superseded render can't land after a slower one during the one-time load
- **Shared `server/render-core.ts` module:** `server/app.ts` (REST) and `server/mcp.ts` (MCP tools) each reimplemented the same render / step-frames init/append/commit / workspace-validation logic with identical broadcast, snapshot, and error-message behavior. That logic now lives in one shared module (`validateWorkspaceInput`, `commitRenderResult`, `initStepFramesResult`, `appendFrameAndBroadcast`, `commitStepFramesResult`) so both transports route through one implementation and can't drift. Also removed `mcp.ts`'s `render` handler's manual per-type mermaid/vega-lite validation, which duplicated `validate.ts`'s `validatePayload()` verbatim — it now calls `validatePayload` directly, matching `app.ts`'s existing approach
- No external behavior, API contract, or WebSocket message shape changes from any of the three refactors — verified against the full existing suite
- 356 unit tests (up from 331; 5 new client test files for the extracted stores) / 38 e2e tests, all pass unchanged

## 0.20.0 — 2026-07-05

- **Design Debt — Safety Net milestone:** the first of two milestones promoting the Design Debt Log (`01_input-ideas.md`) into scheduled work, split by regression risk — this one is additive/no-behavior-change, and safety-nets the behavior-risk refactors planned for v0.21
- **Linting:** ESLint (`eslint-plugin-svelte` + `@typescript-eslint`) added for both `client/` and `server/`, runnable via `npm run lint` / `npm run lint:fix`. Scoped conservatively — catches real bugs, not full stylistic conformance; not wired into the build gate yet
- **Hygiene/a11y fixes:** placeholder/zoom-hint text contrast brought up to WCAG AA (`#aaa`/`#bbb` → `#666`); `aria-live`/`role="alert"` added to the disconnect banner and the Done button's state text; the Mermaid popup menu's `{#each}` block is now keyed; a redundant `svelte-ignore` comment removed; `getMermaidBundle()`/`getKatexCss()` are now memoized instead of re-reading from disk on every export; several previously-silent `catch {}` blocks now log (closing a gap where F11 promised a stderr warning that never actually fired, plus `viewport-cache.ts`'s cache-corruption path and `HistoryPanel`'s failed-load path). The debt log's "redundant try/catch around `saveSnapshot()`" claim was investigated and found incorrect — it's a deliberate F10 caller-level backstop proven by an existing test, kept as-is and now documented with a comment
- **Content-Security-Policy:** a CSP header is now sent on every `server/app.ts` response, and the self-contained HTML export gets its own `<meta http-equiv>` CSP tag (the header has no effect once the file is opened locally, so this is where it actually matters); Mermaid's `securityLevel` is now set explicitly (`"strict"`, matching its existing default) at all three `mermaid.initialize()` call sites
- **`@types/katex` removed:** the debt log assumed a `0.16.8` → `0.17.x` bump; no such release exists on npm. `katex@0.17.0` now ships its own native types, making the separate DefinitelyTyped package obsolete — removed instead of bumped
- **Blanket unit test coverage:** 5 new server test files (`session.ts`, `events.ts`, `ws.ts`, `slideshow.ts`, `channel.ts`); `mcp.ts` coverage deepened from 15 to 39 tests; all 7 previously-unit-tested-only-via-e2e Svelte components now have unit tests (`App`, `HistoryPanel`, `DeleteExportModal`, `Mermaid`, `Html`, `Katex`, `VegaLite`), including a real DOMPurify-sanitization test and the U7i single/multi-workspace modal-step behavior. New client component testing infra: `@testing-library/svelte` + `happy-dom`
- 331 unit tests (up from 260) / 38 e2e tests, all pass

## 0.19.0 — 2026-07-04

- **Mermaid zoom/pan: fit-to-view on first display:** every new `render()`/`commit_step_frames()` result (or a `POST /snapshots/load` history reload) now auto-fits the diagram — scaled to contain, centered — on first display, replacing the old behavior of resetting to a raw 1:1 transform on every render
- **Zoom/pan preserved across step-frames navigation:** `step()`/`seek()` within the same step-frames sequence no longer resets the live viewport — the whole sequence shares one continuously-adjustable view
- **Manual zoom/pan is persisted per snapshot:** the browser debounces zoom/pan changes (~800ms) and reports them to a new `POST /viewport` endpoint, keyed by the snapshot's `id`; the server stores them in a new global `viewport-cache.json` file (`server/viewport-cache.ts`) — separate from the immutable snapshot JSON files — and restores the saved viewport instead of auto-fitting whenever that exact snapshot is redisplayed
- **Viewport-cache cleanup on delete:** `POST /snapshots/delete-files` and `POST /snapshots/delete-workspace` now also remove the corresponding viewport-cache entry/entries, so deleted snapshots don't leave orphaned rows behind
- **Fix: `/viewport` was missing from the Vite dev-server proxy list** (`client/vite.config.ts`) — without it, the browser's viewport reports silently never reached the real server during local dev; caught by the new e2e persistence test
- Mermaid-only; no MCP tool — this is a pure browser⇄server concern, the agent is unaware of it
- 16 new unit tests (`viewport-cache.test.ts` plus additions to `app.test.ts`/`snapshot.test.ts`/`mcp.test.ts`) and 3 new e2e tests (auto-fit, step/seek continuity, persistence-through-reload) — 260 unit tests / 38 e2e tests all pass

## 0.18.0 — 2026-07-04

- **Stability & correctness fixes (B6–B14, from a Node.js/TS + frontend code review pass):**
  - **B6 — workspace-validation gap:** `POST /snapshots/delete-workspace` accepted `{"workspace": "."}`, which resolved to the snapshots root and recursively deleted every workspace's history in one call. All workspace-name checks across `app.ts` (`GET /snapshots`, `POST /snapshots/load`, `POST /export-html`, both delete endpoints) now route through the shared `isValidWorkspaceName()`; the delete-workspace endpoint additionally asserts the resolved path stays strictly inside the snapshots root before `rmSync`
  - **B7 — snapshot filename collisions:** two `render()`/`commit_step_frames()` calls in the same wall-clock second silently overwrote each other's snapshot file. Filenames now include the snapshot's own `id` UUID
  - **B8 — stale async renders:** `Mermaid.svelte` and `VegaLite.svelte` could display a stale diagram/chart if an older in-flight render resolved after a newer one. Both now discard a superseded render's result via a generation token
  - **B9 — unhandled Done-button fetch rejection:** a failed `POST /user-done` left the Done button's state machine stuck with no feedback. `handleDone()` now catches the failure, shows a "Failed ✗" state, and stays retryable
  - **B10 — client TypeScript never type-checked:** `npm run build` only ran `tsc` against `server/`. Added `svelte-check` + a `typecheck` script, chained into `build`; fixed the three real type errors it surfaced (an invalid `res.json<T>()` call, a non-discriminating `RenderCommand` union, and an under-narrowed step-bar visibility check)
  - **B11 — unvalidated WebSocket messages:** an unrecognized `type` in a WS message silently rendered nothing. `ws.ts` now validates message shape before dispatch and logs a diagnostic for anything unrecognized instead of dropping it silently
  - **B12 — dialogs not keyboard-accessible:** `DeleteExportModal` and `HistoryPanel` had no `aria-modal`, Escape handling, or focus trap. Both now use a shared `trapFocus` Svelte action
  - **B13 — inconsistent snapshot-fetch error handling:** `App.svelte`'s delete/export modal silently fell back to an empty workspace list on a failed `GET /snapshots/all`, while `HistoryPanel` already surfaced the error. Extracted a shared `fetchAllSnapshots()` helper; both call sites now surface failures visibly
  - **B14 — concurrent export-html corruption:** `generateExportHtml()` patches Node's `global.*` DOM state for the call's duration with no lock; overlapping calls (from `POST /export-html` and the `export_html` MCP tool) could leave global state dangling on an already-closed Window. Calls are now serialized via a promise queue
- `01`–`04` design docs updated to reflect resolved status for all nine bugs
- 229 unit tests (7 test files, including 3 new: `snapshot.test.ts`, `export-html.test.ts`, and the project's first client-side test `ws.test.ts`) / 35 e2e tests (5 new) all pass

## 0.17.1 — 2026-07-03

- **Fix: Done button confirmation never rendered (client only, no server change):** `set_done_armed: false` arrives over the WebSocket almost immediately after a click — the server unarms as part of resolving `wait_done()` — and was hiding the whole Done button and force-resetting `doneSent` before the "Sent ✓" text ever had a chance to render, confirmed via live DOM instrumentation in a real browser. `client/src/App.svelte` now shows the button on `doneArmed || doneSent`, letting `doneSent`'s own 2-second timer own its lifecycle instead of being cut short by the unarm broadcast
- **Fix: Done button e2e test was stale since v0.12 (Sprint 25):** the test predated conditional Done-button visibility and asserted the pre-v0.12 always-visible-button behavior, so it had been silently failing every `npm run test:e2e` run since; split into two tests — hidden-until-`wait_done()`-armed, and click-shows-Sent-then-disappears (no longer "reverts to visible Done")
- 220 unit tests / 30 e2e tests all pass (previously 28/29 e2e — this release fixes the last failing one)

## 0.17.0 — 2026-07-03

- **Step-frames per-frame validation parity (bug B5):** `render(type="step-frames", ...)` now validates every frame's payload against its effective type before accepting the sequence — previously it only checked payload shape, so a malformed mermaid or vega-lite frame was silently accepted and only failed when the user stepped or seeked to it. `append_frame()` already validated per frame; both creation paths now give the same guarantee, enforced by a single shared code path in `validatePayload()` (`server/validate.ts`) that also covers `POST /slideshow` and `POST /snapshots/load` for free
- **Per-frame `type` override:** `StepFrame` gains an optional `type` field; a step-frames sequence can now mix content types (e.g. a mermaid frame followed by a katex frame) via `type` on individual frames in the one-shot payload, or as a new optional 4th argument to `append_frame(id, payload, label?, type?)` / `POST /step-frames/:id/frame` body / the MCP `append_frame` tool
- **Broadcasts use each frame's own type:** `ws.ts`, `app.ts` (render/step/seek/snapshots-load), `mcp.ts` (render/step/seek), and `slideshow.ts` (tick/slide expansion) all send `frame.type ?? frameType` instead of the sequence-level type, so navigating or auto-advancing through a mixed-type sequence renders each frame with its correct renderer
- **`mcp.ts`'s `render` tool step-frames branch refactored** to delegate to the shared `validatePayload()` instead of duplicating shape-check logic inline
- 10 new unit tests across `app.test.ts`, `mcp.test.ts`, and `step-frames-builder.test.ts` (220 total), plus one new Playwright e2e test proving a mixed mermaid+katex sequence renders correctly in a live browser (28/29 e2e; 1 pre-existing unrelated Done-button flake)

## 0.16.0 — 2026-07-03

- **Delete/export controls moved to the right-side controls panel:** the recycle-bin and export icons are removed from the history panel header; two new icon buttons (delete, export) appear in the always-visible right-side controls panel, grouped with a divider between the history-toggle and Done buttons
- **New 2-step delete/export modal (`client/src/DeleteExportModal.svelte`):** clicking either icon opens a modal — step 1 lists workspaces to choose from (name + snapshot count), auto-skipped straight to step 2 when only one workspace has snapshots; step 2 shows a single "Delete/Export entire workspace (N snapshots)" action plus a checkbox list of that workspace's snapshots, with a footer "N selected" bar for acting on a subset
- **Confirmation for destructive actions:** "Delete entire workspace" and "Delete selected" require a second confirming click (button relabels to "Click again to confirm" for ~3s) before executing, replacing the old `window.confirm()`; export actions execute immediately since they're non-destructive
- **History panel simplified (`client/src/HistoryPanel.svelte`):** removed the recycle-bin/export header icons, per-row checkboxes, select-bar, per-workspace action bar, and the always-visible per-row hover-delete button — the panel is now pure browse/load (header: title, lock/unlock, close); `fetchSnapshots()` is exported so `App.svelte` can refresh the list after a modal delete completes while the panel is open
- **Shared client types/utilities extracted:** `client/src/lib/snapshotTypes.ts` (`SnapshotEntry`, `WorkspaceGroup`) and `client/src/lib/download.ts` (`triggerDownload()`) — used by both the modal and the history panel
- No server/API changes — the modal calls the existing `POST /snapshots/delete-files`, `POST /snapshots/delete-workspace`, and `POST /export-html` endpoints
- Verified end-to-end with Playwright against a live dev server (real Chrome): controls-panel layout, both modal steps, whole-workspace/subset delete confirmation flow, immediate export with file download, single-workspace step-1 skip (via mocked data), and unaffected history browse/load, with no console errors

## 0.15.0 — 2026-07-02

- **`list_snapshots(workspace)` MCP tool:** lists a workspace's snapshots (`id`, `timestamp`, `type`, optional `title`), newest-first, so an agent can discover what it can export without going through the browser HistoryPanel; wraps the same `listSnapshots()` used by `GET /snapshots`
- **`export_html(workspace, ids, output_path?)` MCP tool:** agent-facing equivalent of the HistoryPanel's "Export selected" — exports 1..N snapshots (addressed by `id`, not filename) to a single self-contained HTML file; the assembled HTML (which can be several MB once `mermaid.js` is embedded) is written to disk rather than returned inline, and the tool returns the absolute path. Defaults to `<WHITEBOARD_SNAPSHOTS_DIR>/<workspace>/exports/<name>-YYYYMMDD-HHmmss.html`; `output_path` (optional) writes anywhere, creating parent directories as needed
- **`findSnapshotByIdInWorkspace(workspace, id, dir)` in `server/snapshot-reader.ts`:** scoped variant of `findSnapshotById()` restricted to one workspace directory; returns the full parsed record (`type`, `payload`, `timestamp`, `options`) needed by the export pipeline, not just the payload
- **`GET /snapshots` extended:** accepts an optional `?workspace=` query param (validated with the same safe-name check as `POST /snapshots/load`) for explicit agent use; falls back to `lastWorkspace` when absent — the browser's existing call pattern is unchanged. Each entry gains an additive `id` field
- **`POST /export-html` extended:** items may now be `{ workspace, id }` in addition to the existing `{ workspace, filename }` form; both forms may appear in the same request. Unresolvable ids are skipped, same as unreadable files
- 25 new unit tests: `GET /snapshots?workspace=`, `POST /export-html` with `{ workspace, id }` items, `findSnapshotByIdInWorkspace()`/`listSnapshots()` id population against real files, and the two new MCP tool handlers (206 total)

## 0.14.0 — 2026-07-02

- **Mermaid export fix (bug B4):** `POST /export-html` no longer pre-renders Mermaid diagrams server-side via `happy-dom` — `happy-dom` lacks real text-layout/font-metrics APIs, which caused invisible labels, a too-tight/incorrect viewBox, or thrown errors on diagrams with edge labels or certain node shapes
- **Client-side rendering:** Mermaid items (plain or step-frames frames with `frame_type: "mermaid"`) are now emitted as `<pre class="mermaid">` containers holding the raw, HTML-escaped source; when ≥1 Mermaid item is present, the full `mermaid.js` browser bundle is embedded inline as a `<script>` block (read from `mermaid/dist/mermaid.min.js`, no CDN reference — export stays fully offline-capable) alongside a bootstrap script that calls `mermaid.initialize({ startOnLoad: false })` and `mermaid.run()` on `DOMContentLoaded`
- **Removed:** `renderMermaid()` and `fixSvgViewBox()` (the happy-dom Mermaid render path and its viewBox-repair workaround); `happy-dom` is retained for the KaTeX/Vega-Lite/SVG/HTML export paths, which are unaffected
- 5 new server unit tests for the fixed Mermaid export path, including regressions for the three previously-failing scenarios (step-frames flowchart, seek demo, diagram with edge labels + cylinder node) — 181 total

## 0.13.0 — 2026-06-30

- **HTML Export (`POST /export-html`):** exports one or more selected snapshots to a single fully self-contained HTML file (no external network requests); server-side rendering pipeline handles all snapshot types — KaTeX via `katex.renderToString`, Vega-Lite via `vl.compile` → `vega.View.toSVG`, SVG/HTML via DOMPurify + happy-dom, Mermaid via `mermaid.render` in a happy-dom Window with DOMPurify module patched for Node.js compatibility; items with render failures show an inline error message and do not block the rest of the export
- **Download filename:** single-workspace exports use the sanitised workspace name (`<name>-YYYYMMDD-HHmmss.html`); multi-workspace exports use `export-YYYYMMDD-HHmmss.html`
- **History panel — Export mode:** new export icon button in the panel header enters export mode (`selectionMode: 'delete' | 'export' | null`); select-bar shows "Export selected" (blue) when ≥1 item checked; each workspace accordion shows "Export workspace" to export all snapshots in that workspace without individual selection; clicking the opposite mode icon switches modes immediately without a cancel step
- **Clear workspace removed:** `POST /snapshots/clear-workspace` endpoint removed — it was functionally equivalent to workspace-delete from the user's perspective; "Clear all" button removed from HistoryPanel selection mode; three clear-workspace server tests removed
- **`happy-dom` dependency added** for server-side DOM host (DOMPurify + Mermaid SSR)
- 8 new server unit tests for `POST /export-html` (validation, path-traversal safety, malformed-snapshot skipping, single/multi-workspace filename format, HTML body/headers) — 176 total

## 0.12.0 — 2026-06-29

- **Done button conditional visibility:** the Done button is now hidden by default and only appears while `wait_done()` is armed on the server; `server/events.ts` tracks `doneArmed` state and calls `broadcastDoneArmed()` on every change; `server/ws.ts` pushes `{ action: "set_done_armed", armed: <current> }` to every new WebSocket connection so a fresh browser tab initialises correctly; `client/src/App.svelte` shows/hides the button reactively
- **History panel — per-row delete:** each snapshot row shows a trash icon on hover; clicking it calls `POST /snapshots/delete-files` and removes the row immediately from the UI (no page reload)
- **History panel — multi-select delete:** a pencil/edit icon in the panel header enters selection mode; the icon swaps to a recycle bin (confirming delete mode) and a yellow bar appears showing selection count + "Delete selected" + "Cancel"; checkboxes appear on all rows across all workspace sections; "Delete selected" calls `POST /snapshots/delete-files` for all checked items at once
- **History panel — Clear workspace:** in selection mode, each workspace section shows a "Clear all" button that calls `POST /snapshots/clear-workspace`; deletes all snapshot files inside the workspace but leaves the folder and accordion row visible (empty)
- **History panel — Delete workspace:** in selection mode, each workspace section shows a "Delete folder" button; after a browser confirm dialog, calls `POST /snapshots/delete-workspace` and removes the workspace section entirely from the panel
- **Three new server endpoints (v0.12):** `POST /snapshots/delete-files`, `POST /snapshots/clear-workspace`, `POST /snapshots/delete-workspace` — all apply workspace and filename safe-name checks (same rules as `POST /snapshots/load`); `delete-workspace` resets `lastWorkspace` to `""` when the deleted workspace matches
- **Header layout:** action buttons (pencil/recycle-bin, lock/unlock) right-aligned in the panel header with a vertical separator (`|`) before the close button
- 16 new server unit tests for the three delete endpoints (172 total)

## 0.11.0 — 2026-06-27

- **`render()` and `commit_step_frames()` now return `{ ok: true, id: "<uuid>" }`:** the UUID of the snapshot written for that call — agents can store this to retrieve the diagram later regardless of what else is rendered; `id` is omitted (non-fatal) if the snapshot write fails
- **`export(id?)` — retrieve any past snapshot by UUID:** `GET /export?id=<uuid>` (REST) and `export({ id })` (MCP tool) scan all workspace snapshot files for the one whose `id` field matches and return its payload; returns `{ ok: false, error: "graph not found" }` if no match; old snapshots without an `id` field are silently non-addressable
- **Snapshot schema gains `id` field:** `saveSnapshot()` generates a UUID (`crypto.randomUUID()`) at write time and stores it as the first field in the JSON; backward-compatible — old readers ignore the new field
- **`findSnapshotById(id, dir)` in `server/snapshot-reader.ts`:** scans all workspace subdirectories for a snapshot with a matching `id` field; returns the payload string or `null`
- **`showcase.js` — Section 12 (`-x` / `--exportid`):** new manual test section that renders two diagrams, verifies `GET /export?id=` retrieves the first by UUID after the canvas has moved on, and confirms 404 for a nonexistent ID
- **`showcase.js` and `click-demo.js` compliance fix:** all `POST /render` calls in both human-driven test scripts now pass the required `workspace` option (was silently failing since v0.7)
- 16 new unit tests covering render/commit id-in-response and GET /export id-based lookup (found, not-found, empty-id fallback)

## 0.10.0 — 2026-06-27

- **Right-side controls panel:** the history toggle button and Done button now live in a compact fixed panel on the right edge of the viewport (`<div class="controls-panel">`) — always visible, never occluding the canvas; replaces the footer-based `done-bar` from v0.2–v0.9
- **Done button icon-only:** Done button displays a checkmark SVG icon instead of the text label "Done"; tooltip on hover shows "Done"; the 2s "Sent ✓" text feedback on click is preserved
- **History panel lock/unlock toggle:** a small lock icon button in the panel header controls auto-close behaviour — unlocked (default): loading a snapshot closes the panel; locked: panel stays open so the user can browse multiple snapshots without reopening; lock state resets when the panel is closed
- **`lastWorkspace` update on history load:** `POST /snapshots/load` now calls `setLastWorkspace(workspace)` on success so the history panel auto-expands the correct workspace section on next open after a cross-workspace load; `GET /snapshots/all` returns `isCurrent: true` for the loaded workspace
- 1 new unit test verifying `lastWorkspace` is updated after a cross-workspace snapshot load

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
