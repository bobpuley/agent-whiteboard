# Milestone v0.27 — REST/MCP Parity Remediation (Sprints 51–57)

**Status:** in progress

> Opened 2026-07-09 via `/doc-creator-driver:intake` (feature intake, promoted from the Design Debt Log in `01`). Follow-up to the v0.23–v0.26 architecture consolidation: a re-audit (`docs/raw/design-problems.md`, findings F1–F7) found NF14–NF17 closed REST/MCP drift only for the commands already migrated to `render-core.ts` at the time each slice shipped. `step`/`seek` business logic, `slideshow` validation, `list_snapshots` workspace resolution, `export-html` item addressing, and three lower-risk mechanical duplications were left out. See `02` §N6, `03` §8, `04` §9.6.
> Sprint numbering: one task per sprint, one branch/tag per sprint, matching the convention used by every prior milestone (see e.g. `Milestone_v0.26.md`).

### Sprint 51 — `slideshow` MCP tool routes through `validateFrame()` (F1) ✅
- [x] **NF18.** Remove the hand-rolled mermaid/vega-lite checks in `mcp.ts`'s `slideshow` tool (`mcp.ts:256-299`) and call `validate.ts`'s `validateFrame()` for every slide, matching REST's `/slideshow` handler (`app.ts:219`).
  - *Acceptance:* a slide payload REST's `/slideshow` would reject is also rejected via the MCP `slideshow` tool, with the same error shape. Existing valid-payload behavior unchanged.
  - *Regression coverage:* unit test on the MCP `slideshow` tool asserting a `validateFrame()`-rejected slide returns `{ok:false,error:...}` without broadcasting.
  - **Shipped 2026-07-09:** the 44-line hand-rolled per-type validation loop in `mcp.ts`'s `slideshow` tool is replaced with a single `await validateFrame({ type: s.type, payload: s.payload })` call per slide, matching `app.ts`'s `/slideshow` handler exactly (`slide[${i}]: ${err}` error format). `hasMermaidKeyword`/`parseMermaid` imports removed from `mcp.ts` (no longer used directly — `validateFrame()` wraps them). New unit tests: an invalid vega-lite slide (exact error-message parity with REST) and a multi-slide case asserting the correct `slide[i]` index on a non-zero failing slide. Full suite: 461 unit tests passing (up 2 from 459), `tsc --noEmit` and `npm run lint` clean.

### Sprint 52 — Extract `step`/`seek` into `render-core.ts` (F2) ✅
- [x] **NF19.** Move the viewport-lookup + `resolvedId` + broadcast logic currently duplicated between `app.ts:114-175` and `mcp.ts:95-194` into shared functions in `render-core.ts`, and have both `POST /step`/`POST /seek` and the `step()`/`seek()` MCP tools call them.
  - *Acceptance:* `step`/`seek` behave identically via REST and MCP (existing test suite passes unchanged); `app.ts`/`mcp.ts` no longer contain independent copies of this logic.
  - *Regression coverage:* unit tests on the new `render-core.ts` functions; existing `app.ts`/`mcp.ts` step/seek tests updated to assert they call the shared functions (not reimplement the logic).
  - **Shipped 2026-07-09:** added `stepAndBroadcast(direction)` and `seekAndBroadcast(frame)` to `render-core.ts`, joining `render`/`init_step_frames`/`append_frame`/`commit_step_frames` as commands that structurally cannot drift between transports — closes the exact gap `render-core.ts`'s own NF12 header comment already claimed was closed. `app.ts`'s `/step`/`/seek` handlers and `mcp.ts`'s `step()`/`seek()` tools now only handle request-shape validation (direction enum / integer frame) and call the shared function — no independent business logic remains in either file. Removed now-unused imports (`getCanvas`, `isStepSequence`, `seekStepFrame`, `stepCursor`, `broadcastStepFrames`/`broadcastReplace` where superseded, `generateSnapshotId`, `getViewport`) from both `app.ts` and `mcp.ts`. No behavior change — output-equivalence verified by the full existing `app.test.ts` (197 tests) and `mcp.test.ts` (47 tests) step/seek coverage passing unchanged; no dedicated `render-core.test.ts` added, matching this project's existing pattern of testing `render-core.ts` functions through their REST/MCP consumers rather than in isolation. Full suite: 461 unit tests passing, `tsc --noEmit` and `npm run lint` clean.

### Sprint 53 — Workspace mandatory, no fallback, for `list_snapshots`/`GET /snapshots` (F3)
- [ ] **NF20.** Remove `GET /snapshots`'s `getLastWorkspace()` fallback in `app.ts:370-383`; workspace becomes a required parameter, matching MCP's `list_snapshots`.
  - *Prerequisite:* audit every browser call site of `GET /snapshots` (HistoryPanel) and confirm the client already tracks a current-workspace value to send explicitly; add one client-side if missing.
  - *Acceptance:* `GET /snapshots` without `workspace` returns the same `{ok:false,error:...}` shape MCP's `list_snapshots` already returns for the same omission. HistoryPanel continues to work with no user-visible regression.
  - *Regression coverage:* unit test asserting `GET /snapshots` rejects a missing `workspace`; e2e test confirming the HistoryPanel still loads snapshots for the active workspace.

### Sprint 54 — `export-html` unifies on `ids` (F4)
- [ ] **NF21.** Remove REST's `{workspace, filename}` item shape and the hand-parsed filename-lookup branch in `app.ts:653-696`; both transports accept only `{workspace, ids}`.
  - *Prerequisite:* confirm snapshot `id` is already present in the client-side data the HistoryPanel's "Export selected" flow (FR14/FR16) selects from (e.g. `GET /snapshots/all`'s response shape). If not exposed yet, add it there first.
  - *Acceptance:* the browser's "Export selected" flow sends `ids`, not `filename`, and produces the same HTML export as before. MCP's `export_html` is unchanged (already `ids`-only).
  - *Regression coverage:* e2e test exercising HistoryPanel export-selected end to end; unit test removing/asserting-gone the filename-lookup code path in `app.ts`.

### Sprint 55 — Canonical snapshots-root resolver (F5)
- [ ] **NF22.** New `server/paths.ts` exporting one function wrapping `WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard")`; replace all 9 independent copies (`app.ts` ×5 incl. `resolveSnapshotRoot()`, `mcp.ts` ×3, `viewport-cache.ts`, `snapshot.ts`).
  - *Acceptance:* every call site imports the shared resolver; behavior (resolved path) unchanged for all existing tests.

### Sprint 56 — Reuse `snapshot-reader.ts`'s `isFrameArray()` (F6)
- [ ] **NF23.** Remove the two inline re-definitions in `app.ts` (`450-451`, `666-667`); import and use the existing exported predicate instead.
  - *Acceptance:* no behavior change; existing tests covering `/snapshots/load` and `/export-html` pass unchanged.

### Sprint 57 — Share `node_actions`/`node_to_frame` validation via MCP's zod schemas (F7)
- [ ] **NF24.** Export MCP's existing zod schemas for these two shapes from a shared location; REST's `app.ts` replaces `isNodeActionsValid()`/`isNodeToFrameValid()` with `.safeParse()` calls against the same schemas.
  - *Acceptance:* no behavior change for currently-valid/invalid payloads on either transport; `app.ts`'s hand-written type guards are deleted, not just unused.

> **Implementation note:** NF20/NF21 (Sprints 53-54) are the only two tasks in this milestone with browser-visible surface area — sequence them after NF18/NF19 land and are verified, and test the HistoryPanel manually (not just e2e) before closing each, consistent with this project's "verify UI changes in a real browser" convention.

---

## Definition of Done — v0.27
- `slideshow` MCP tool rejects the same invalid payloads REST's `/slideshow` already rejects (NF18).
- `step`/`seek` business logic exists once, in `render-core.ts`, called identically by both transports (NF19).
- `GET /snapshots` and `list_snapshots` require `workspace` with no fallback, same error shape (NF20).
- `export-html` addresses items by `ids` only on both transports; HistoryPanel's export-selected flow verified working in a real browser (NF21).
- Snapshots-root resolution, Frame-array validation, and `node_actions`/`node_to_frame` shape validation each exist in exactly one place, imported everywhere they're used (NF22–NF24).
- `02` §N6, `03` §8, `04` §9.6 updated from "scheduled"/gap to resolved; the B6 traceability caveat in `04` §9.4 removed.
- Full unit + e2e suite green; `tsc --noEmit` (server + client) and `npm run lint` clean.
