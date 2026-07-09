# Milestone v0.28 — `app.ts` Responsibility Cleanup (Sprints 58–61)

**Status:** in progress

> Opened 2026-07-10 via `/doc-creator-driver:intake` (feature intake, `01` FR23). Follow-up to the v0.27 REST/MCP parity work: that audit was scoped to REST↔MCP drift and couldn't see responsibilities misplaced *within* `app.ts` itself (duplication inside one transport's file, not between transports). See `02` §N7, `03` §9, `04` §9.7. Item 5 from FR23 (the `{ok,error,category?}` error shape) is explicitly deferred, out of scope for this milestone. One task per sprint, one branch/tag per sprint, matching the convention established in `Milestone_v0.27.md`.

### Sprint 58 — Extract `/snapshots/load`'s commit logic into `render-core.ts`
- [x] **NF25.** Move the validate-frames → decide single-frame-vs-step-frames → `setCanvas`/`setStepFrames` → `broadcastReplace` → `setLastWorkspace` sequence out of `app.ts`'s `/snapshots/load` handler into a new `render-core.ts` function (e.g. `applyLoadedSnapshotResult`), joining `commitRenderResult`/`commitStepFramesResult`/etc. with persist-trigger `never`.
  - *Acceptance:* `/snapshots/load` behaves identically (existing test suite passes unchanged); the handler body is reduced to request-shape parsing + file loading + calling the new function.
  - *Regression coverage:* existing `/snapshots/load` tests in `app.test.ts` pass unchanged; no new MCP surface implied — this stays REST-only.

### Sprint 59 — Rename `snapshot.ts` → `snapshot-writer.ts`, add delete operations
- [x] **NF26.** Rename `server/snapshot.ts` to `server/snapshot-writer.ts` (update all ~8 import sites: `app.ts`, `render-core.ts`, `slideshow.ts`, `persist.ts`, and their tests). Add `deleteSnapshotFiles(workspace, root, filenames)` and `deleteWorkspace(workspace, root)`, moved out of `app.ts`'s two delete handlers, each internally composing file deletion with `viewport-cache.ts`'s `deleteViewports()` cleanup. Move `validateWorkspaceForDelete`'s containment/`existsSync` logic here too, built on top of `validateWorkspaceInput()`. Move `readSnapshotIdSafe` to `snapshot-reader.ts` (it's a read).
  - *Acceptance:* `/snapshots/delete-files` and `/snapshots/delete-workspace` behave identically (existing tests pass unchanged); both handlers are reduced to request-shape parsing + calling the moved functions; `app.ts` no longer imports `fs`'s `unlinkSync`/`rmSync`/`readdirSync` for snapshot mutation.
  - *Regression coverage:* existing delete-endpoint tests in `app.test.ts` pass unchanged (rename only touches import paths); rename `tests/unit/server/snapshot.test.ts` → `snapshot-writer.test.ts`.

### Sprint 60 — Consolidate remaining workspace-validation paths onto `validateWorkspaceInput()`
- [ ] **NF27.** `/snapshots/load`'s inline optional-workspace check and `/export-html`'s silent-skip check both switch to `validateWorkspaceInput()`. (The delete-path consolidation already shipped as part of NF26.)
  - *Acceptance:* same accept/reject/skip behavior per call site as today, just one shared implementation underneath — `/export-html` still silently skips an invalid-workspace item (list-filtering), `/snapshots/load` still rejects the whole request.
  - *Regression coverage:* existing tests for both endpoints pass unchanged.

### Sprint 61 — Dedupe the snapshot-filename safety regex
- [ ] **NF28.** `/^[^/]+_screen\.json$/`, copy-pasted in `/snapshots/load` and `snapshot-writer.ts`'s delete-files logic (post-NF26), becomes one exported constant/helper.
  - *Acceptance:* no behavior change; both call sites import the shared pattern.
  - *Regression coverage:* existing filename-validation tests at both sites pass unchanged.

---

## Definition of Done — v0.28
- `app.ts` contains no canvas-state-mutation logic outside its route handlers' thin parse-and-delegate shape (NF25).
- Snapshot file writes, reads, and deletes each live in exactly one module (`snapshot-writer.ts`, `snapshot-reader.ts`) — `app.ts` performs no direct filesystem mutation (NF26).
- Exactly one workspace-validation implementation is used everywhere in `app.ts` (NF27).
- The snapshot-filename safety pattern exists in exactly one place (NF28).
- `02` §N7, `03` §9, `04` §9.7 updated from open/scheduled to resolved.
- Full unit + e2e suite green; `tsc --noEmit` (server + client) and `npm run lint` clean.
