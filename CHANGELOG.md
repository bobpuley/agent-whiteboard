## 0.26.0 — 2026-07-09

**Milestone v0.26 — Architecture Consolidation: Unified Presentation Model (Sprints 39–48) complete.** Everything renderable now collapses to one atom (`Frame`) and one container (`Presentation`) on both server and client; `type:"step-frames"` no longer exists as a top-level content type anywhere in the codebase. This was the highest-risk slice of the architecture consolidation (`04_architecture.md` §9) and is gated as a prerequisite for any public release (`02` N4).

- **Sprint 48 — Full-suite regression & contract parity check (verification only):** ran the full unit suite (439/439 passing, up from a 365-test pre-migration baseline) and e2e suite (37/38, the one failure a pre-existing dev-server-startup race unrelated to this milestone, confirmed passing in isolation); typecheck and lint clean. Grepped the codebase for stale WS/MCP/snapshot-shape assertions and back-compat shims — none found in runtime code (the only matches were historical prose, the migration script's intentional old-format detection, and unrelated identifiers sharing a name)
- Found and fixed one real documentation gap: `README.md`'s `wait_click()`/`commit_step_frames()` sections still described the pre-Sprint-47 behavior (no `type:"superseded"`, `node_to_frame` requiring a fresh `render()` to re-enable) — updated to match the shipped contract, closing the milestone's `README.md` Definition-of-Done item
- Summary of the full milestone: `Presentation`/`Frame` data model (Sprint 39) → server + client reducer rewrites (40–41) → unified WebSocket contract (42) → unified on-disk snapshot schema + migration script (43) and its real run against the live `~/.agent-whiteboard/` directory (44) → MCP payload contract update removing `type:"step-frames"` (45) → return-channel Interaction primitive unification (46) → supersession + `node_to_frame` auto-restore (47) → this final regression check (48)

## 0.25.9 — 2026-07-09

- **Sprint 47 — Return channel: supersession & auto-restore (U7, OQ11/OQ12):** `wait_click()` gains `type: "superseded"`, distinct from a genuine `type: "timeout"`, when a new `wait_click()` or an arming `wait_done()` cancels a pending one — `server/interaction.ts`'s `createSingleFlightInteraction()` now takes separate `timeoutEvent`/`supersededEvent` values plus a `supersede()` method; `waitForDone()` calls `clickInteraction.supersede()` on arm, so arming Done now takes over the return channel from a pending click instead of leaving it to time out
- **`node_to_frame` now auto-restores after `wait_click()` resolves** (previously required the agent to build and commit a fresh sequence): a pure client-side reducer change — `canvasStore.ts`'s `set_node_actions` handler sets `nodeToFrameEnabled: state.nodeToFrame !== undefined` on `enabled:false` instead of hardcoding `false`, since the map itself was never actually cleared by arming/disarming a click listener
- New behavior, not a refactor — `docs/03_requirements.md` (wait_click response shape, U4e) and `docs/04_architecture.md` (§9.2 U7, wait_click data flow) updated to describe the shipped contract
- Verified by the full unit suite (439 tests, up from 431 — new coverage in `interaction.test.ts`, `app.test.ts`, `mcp.test.ts`, `canvasStore.test.ts` for both supersession and auto-restore) and typecheck (`tsc` + lint, 0 errors); e2e: 37/38, the one failure is the same pre-existing dev-server-startup race documented in prior sprints, confirmed passing in isolation

## 0.25.8 — 2026-07-09

- **Sprint 46 — Return channel: Interaction primitive unification (U7, D4):** `server/events.ts`'s bespoke EventEmitter bus is replaced by `server/interaction.ts`, which exposes two generic arm/await/resolve factories — `createBroadcastInteraction<E>()` (every pending `await()` resolves independently, one `resolve()` wakes all — the shape `wait_done()` needs) and `createSingleFlightInteraction<E>(cancelEvent)` (a new `await()` cancels the pending one with `cancelEvent` — the shape `wait_click()` needs)
- `signalDone`/`waitForDone`/`getDoneArmed`/`setBroadcastFn` and `signalClick`/`waitForClick`/`resetClick`/`ClickEvent` are now thin configurations built on those two factories, with identical exported signatures — `app.ts`, `mcp.ts`, and `ws.ts` needed only an import-path change, no logic changes
- `node_to_frame` (U4e) needed no code change: it was already the "local resolver" variant D4 describes — the browser calls `POST /seek` directly from `Mermaid.svelte`'s click listener, never round-tripping through the server's return channel — now documented as such in `04_architecture.md` §9.2 (U7) rather than force-fit into the new module
- Behavior-preserving refactor: `tests/unit/server/events.test.ts` renamed to `interaction.test.ts`, all prior behavioral assertions kept verbatim, plus new tests exercising the two factories directly. Full suite: 431 tests passing (up from 423), `tsc --noEmit` and `npm run lint` clean

## 0.25.7 — 2026-07-09

- **Sprint 45 — MCP payload contract update (U0/U2):** `type: "step-frames"` no longer exists as a top-level content type — `render()` is single-frame only (its `type` enum drops to the five `FRAME_TYPES`, `options.node_to_frame` removed). `init_step_frames`/`append_frame`/`commit_step_frames` is now the sole way to create a multi-frame sequence; `node_to_frame` moves to an optional `commit_step_frames(id, node_to_frame?)` parameter, its only entry point now (U4e). No back-compat shim, per `02` N4 — pre-release, zero external consumers
- **`slideshow()` slides are single-frame only:** the step-frames-slide-expands-into-per-frame-timer-ticks behavior is removed along with the top-level type it depended on; `slideshow.ts`'s `Tick`/`SlideTick`/`FrameTick`/`expandSlides`/`broadcastTick` machinery collapses to one `broadcastSlide()` call per slide
- **`validate.ts`:** `validatePayload()` and `KNOWN_TYPES` deleted — they had degenerated to a step-frames-envelope-only wrapper around `validateFrame()`, which every content path (`render()`, each `slideshow()` slide, `append_frame()`) now calls directly
- **`persist.ts`:** `PersistableContent`'s `type: CanvasType | "step-frames"` + `payload: string` shape replaced with `frames: Frame[]` + optional `rawPayload` — callers already hold resolved `Frame[]` internally, so the `toFrames()` envelope-unwrapping step it used to perform is gone
- Server unit tests rewritten against the new contract (423 tests, down from 444 — consolidates what used to be duplicate one-shot-vs-incremental step-frames test pairs into single incremental-protocol-only tests) plus `tests/e2e/canvas.spec.ts` updated to build step-frames sequences via the incremental REST protocol instead of one-shot `render(type="step-frames")`. `README.md`, `03_requirements.md`, and `04_architecture.md` updated to describe the shipped contract; `tests/human_driven/showcase.js` rewritten (Sections 1, 7, 8, 14) and verified end-to-end against a live `npm run dev:test` server

## 0.25.6 — 2026-07-08

- **Sprint 44 — Snapshot migration real run (U2):** ran `server/migrate-snapshots.ts` against the real `~/.agent-whiteboard/` directory (161 snapshot files across ~10 workspaces). Backed up first to `~/.agent-whiteboard.backup-20260708-205116/`; verified a real run against a throwaway copy byte-for-byte against the backup (id/timestamp/workspace/title/nodeToFrame/frames/rawPayload all preserved, 0 mismatches, 0 pre-migration files missing an `id`) before running for real. Post-run: re-diffed against the backup (0 mismatches), confirmed idempotency (re-run reports 0 migrated / 161 already-migrated / 0 errors), and smoke-tested `GET /snapshots` / `POST /snapshots/load` / `GET /export` end-to-end against real migrated data with a live server. No code changes — operational only

## 0.25.5 — 2026-07-08

- **Sprint 43 — Snapshot schema + migration script (U2):** on-disk snapshot files move from the old top-level `type`/`payload`/`options` triple to a `Presentation`-shaped `{ id, timestamp, workspace, cursor, frames[], title?, nodeToFrame?, rawPayload? }` schema (`SnapshotFile` in `server/snapshot.ts`). A one-shot render is a single-element `frames` array; a step-frames sequence is the full array with each frame's already-resolved effective type. `rawPayload` — the verbatim step-frames envelope, kept only when `frames.length > 1` — lets `export(id)` return byte-identical content instead of a reconstruction; a committed 1-frame sequence collapses into a plain record with no `rawPayload`, mirroring the WS contract's Sprint 42 policy
- **Full cutover (user decision, not deferred):** every read path — `snapshot-reader.ts` (`listSnapshots`/`findSnapshotById`/`findSnapshotByIdInWorkspace`, plus a new `badgeType()` helper deriving the list's display type since there's no top-level `type` field anymore), `POST /snapshots/load`, `POST /export-html`, and `export-html.ts` — rewritten onto the new schema in this same sprint, so the repo stays working the moment real data is migrated (Sprint 44)
- **`server/migrate-snapshots.ts`:** one-time, idempotent migration script — `migrateSnapshotFile()` is a pure old-to-new transform (backfills a missing `id`, detects already-migrated files via presence of a `frames` array), `migrateDirectory()` is the filesystem driver with dry-run support (required before the real run, per N5 in `02`), plus a CLI entry point
- **Fixed a pre-existing client crash found during this sprint's manual test gate** (unrelated to the schema work — zero client files touched by Sprint 42 or 43): `App.svelte`'s `rendererProps` computed eagerly off `currentComponentType` alone; a WS `clear()` racing with an already-cached renderer type's first-ever async load could leave `currentComponentType` pointing at a type with no content, crashing on `registry.ts`'s non-null `presentation` assertions. Fixed by reusing the template's `currentComponentType === rendererKey` guard in the reactive statement itself
- Verified by the full unit suite (444 tests, up from 415 — new `migrate-snapshots.test.ts` plus every fixture touching the on-disk schema rewritten across `snapshot`/`persist`/`snapshot-reader`/`app`/`mcp`/`export-html` tests) and typecheck (`tsc` + `svelte-check`, 0 errors); e2e: 37/38, the one failure is the same pre-existing dev-server race confirmed unrelated in the Sprint 42 changelog entry

## 0.25.4 — 2026-07-08

- **Sprint 42 — WebSocket contract update (U3):** the v0.23 broadcast projector now always carries `id`, `cursor`, and `total` on every content `replace` message, replacing the old `stepFrames` boolean plus optional `currentFrame`/`totalFrames` pair. A one-shot render is `cursor: 0, total: 1`; a step-frames frame is `cursor: N, total: M`. `ReplaceBroadcast` in `server/ws.ts` becomes a discriminated union (content vs. the `init_step_frames` placeholder) so the type system requires every real call site to supply `id`/`cursor`/`total`; `broadcastStepFrames()`'s signature reorders to `(frames, frameType, cursor, id, title?)` since `id` is no longer optional
- **Every server call site updated:** `render-core.ts`, `slideshow.ts`, `app.ts`, and `mcp.ts` now pass `cursor`/`total` on every broadcast; a fresh id is synthesized via `generateSnapshotId()` wherever the in-memory `Presentation` or an on-disk snapshot might lack one (legacy pre-v0.11 snapshots loaded via `POST /snapshots/load`), rather than omitting the field as before
- **Client step-bar visibility now derives from `total > 1`** instead of the removed `stepFrames` flag: a committed 1-frame step-frames sequence is now treated as static (no navigation UI needed, matching a one-shot render) — a deliberate behavior decision, not an oversight
- Verified by the full unit suite (415 tests, up from 414 — `ws.test.ts`/`canvasStore.test.ts`/`app.test.ts`/`mcp.test.ts`/`slideshow.test.ts` rewritten against the new shape) and typecheck (`tsc` + `svelte-check`, 0 errors); e2e: 36/38, the same 2 pre-existing dev-server-race failures confirmed present at the same rate on unmodified pre-Sprint-42 code via a stash-and-compare run

## 0.25.3 — 2026-07-08

- **Sprint 41 — Client reducer rewrite (U3):** `canvasStore.ts` mirrors `session.ts`'s server-side shape: `{ presentation: Presentation | null; driver }` instead of a `type`-tagged `CanvasState` union. New `client/src/presentation.ts` defines `Frame`/`Presentation`, matching `server/presentation.ts`
- **`frames` holds just the current frame; `cursor` stays 0 until Sprint 42** changes the WS payload to carry the full sequence — the client only ever receives one frame per broadcast today. `currentFrame`/`totalFrames` stay as separate display-only metadata for the step-bar
- **`driver` is `"manual"` whenever the current content is part of a step-frames sequence** (`cmd.stepFrames`), mirroring `session.ts`'s driver semantics — the step-bar now shows on `driver === "manual"` instead of a `type !== "step-frames-placeholder" && stepFrames` check
- **`App.svelte` and `registry.ts` updated** to read `presentation`/`driver`/`placeholder` instead of pattern-matching `canvas.type`
- **Pure internal refactor, no WS contract change** (that's Sprint 42): verified by the full unit suite (414 tests, `canvasStore.test.ts`/`registry.test.ts` rewritten against the new shape) and typecheck (`tsc` + `svelte-check`, 0 errors); e2e failures across repeated runs are a pre-existing dev-server race, confirmed present at the same rate on unmodified pre-Sprint-41 code

## 0.25.2 — 2026-07-08

- **Sprint 40 — Server reducer rewrite (U3):** `session.ts`'s `CanvasState` 3-way union (`empty` | single-type | `step-frames`) is replaced by one `{ presentation: Presentation | null; driver }` model. `driver` is `"static"` for a one-frame render, `"manual"` whenever a step-frames sequence is loaded (one-shot render, `append_frame`, `commit_step_frames`, or a slideshow tick/finalize) — exactly the set of cases the old `type === "step-frames"` branch covered, so `step()`/`seek()` behavior (including "Prev/Next keeps working during a slideshow", F7) is unchanged
- **`setStepFrames()` resolves each frame's effective type once, at intake** (`frame.type ?? frameType`), instead of every reader doing that lookup inline
- **New `isStepSequence()` type guard** replaces the old `canvas.type === "step-frames"` check at every read site (`app.ts`'s `/step`/`/seek`, `mcp.ts`'s `step`/`seek` tools, `slideshow.ts`'s tick broadcast and finalize)
- **Pure internal refactor, no contract change:** no WS/MCP/snapshot schema change (that's Sprint 42/45); verified by the full unit suite (413 tests — `session.test.ts` rewritten against the new shape) and the e2e suite (37/38 passing; the one failure is the pre-existing webServer-startup race noted in the 0.24.0 changelog, unrelated since this change only touches `server/*.ts`)

## 0.25.1 — 2026-07-08

- **v0.26 (Architecture Consolidation — Unified Presentation Model) split into 10 sprints (39–48):** the milestone's original single Sprint 39 bundled 7 tasks together; split along real seams (server/client reducer, migration build/run, return-channel refactor/new-behavior) and folded contract-test rewrites into each sprint that introduces the change instead of one final rewrite sprint — see `docs/05_dev-plan.md` and `docs/milestones/Milestone_v0.26.md`
- **Sprint 39 — Presentation/Frame data model (U2):** introduces `Presentation`/`Frame` as the target content model (`docs/04_architecture.md` §9.1) in new `server/presentation.ts`, and extracts `validateFrame()` as the single atomic-frame validator. `validatePayload()` is now a thin step-frames-envelope dispatcher that loops `validateFrame()` per frame; `step-frames-builder.ts`'s `appendFrame()` calls `validateFrame()` directly instead of going through the envelope path
- **Removes a real duplication:** `app.ts` had its own locally-redeclared `KNOWN_TYPES`/`FRAME_TYPES` literals, independent copies of `validate.ts`'s lists — both now import the canonical exports
- **Pure internal refactor, no contract change:** no MCP tool signature, WebSocket message shape, or snapshot schema changed; verified by the full test suite (409 tests, up from 392 — 17 new tests directly covering `validateFrame()`/`validatePayload()`) passing unchanged

## 0.25.0 — 2026-07-07

- **Architecture Consolidation — Persistence Policy & Finalize Dedup milestone (Sprint 38):** slice C of the architecture consolidation promoted from `desing-analysis/` (FR22) — the persistence/finalize-side counterpart to v0.23's unified broadcast projector
- **New persist-trigger vocabulary, enforced by a registry:** `server/persist.ts` defines `PersistTrigger` (`immediate | on-finalize | transient | never`) and a `COMMAND_PERSIST_TRIGGERS` map from command name to trigger; `getPersistTrigger()` throws for any unregistered command instead of silently doing nothing. This is the direct structural fix for the FR20/B15 class of bug — `slideshow()` used to have no persistence decision recorded anywhere and simply never called `saveSnapshot()`
- **One shared finalize/persist implementation (`persistContent()`) replaces three independent copies:** `render-core.ts`'s `commitRenderResult()` and `commitStepFramesResult()`, and `slideshow.ts`'s `finalizeSlideshow()`, each used to re-implement the same step-frames JSON assembly and "a write failure must never block" backstop separately. All three now call `persistContent()` (`assembleStepFramesPayload()` covers the JSON assembly), each declaring its own trigger: `render`/one-shot step-frames = `immediate`; `append_frame` = `transient`; `commit_step_frames`/slideshow-end = `on-finalize`; `step`/`seek`/`clear`/history-load = `never` (these never called `saveSnapshot()` before either — now documented in the registry rather than left implicit)
- **Pure internal refactor, no contract change:** F7 (slideshow finalize-on-end), F10 (render snapshot persistence), and F15 (incremental step-frames finalization) behavior is unchanged — verified by the full pre-existing test suite (`slideshow.test.ts`, `snapshot.test.ts`, `app.test.ts`, `mcp.test.ts`) passing unmodified, plus 15 new tests in `persist.test.ts` covering registry enforcement and per-trigger write behavior (392 total, up from 377)

## 0.24.0 — 2026-07-07

- **Architecture Consolidation — Client Renderer Registry milestone (Sprint 37):** slice B of the architecture consolidation promoted from `desing-analysis/` (FR22) — a pure client-side refactor, isolated and low-risk
- **`App.svelte`'s hardcoded `{#if canvas.type === "mermaid"} … {:else if …}` dispatch chain replaced by a `type → component` registry:** `client/src/renderers/registry.ts` maps each canvas type (`mermaid`, `svg`, `html`, `katex`, `vega-lite`, `step-frames-placeholder`) to its component plus a props-mapping function; `App.svelte` resolves and renders via `<svelte:component>` instead of a growing `{:else if}` ladder. Adding a future renderer type is now one registry entry — no `App.svelte` changes needed (U6/D3 in `04_architecture.md` §9)
- **v0.21 lazy-loading of the heavy rendering libraries preserved:** the registry resolves each wrapper component (`Mermaid.svelte`, `Html.svelte`, `Katex.svelte`, `VegaLite.svelte`, `StepFramesPlaceholder.svelte`) from a static import rather than a dynamic `import()` of the wrapper file — the wrappers are tiny (~13kB combined) next to the actual v0.21 win (mermaid.js/katex/vega-embed, hundreds of kB each), which lives inside each wrapper, untouched, and stays genuinely lazy (confirmed via `npm run build`: separate `mermaid.core-*`/`katex-*`/`embed-*` chunks, fetched only on first use of that type). Dynamically importing the wrappers too was tried and reverted during implementation — it shrank the main bundle just enough to shift page-load timing and made a pre-existing, razor-thin dev-server race (a REST-triggered `render()` arriving before the fresh page's own `/stream` WebSocket handshake completes) fail far more often in the Playwright e2e suite
- No WebSocket message shape, MCP contract, or snapshot schema change; verified against the full unit suite (377 tests, up from 371 — 6 new tests directly covering the registry) and the 38-test e2e suite, both passing unchanged and stable across repeated runs

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
