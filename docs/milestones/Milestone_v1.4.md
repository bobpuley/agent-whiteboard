# Milestone v1.4 — Design Debt: Server Hardening & Performance (Sprint 83)

**Status:** in progress

> Opened 2026-09-06 via `/doc-creator-driver:intake` (bug report batch). Promotes 2 findings logged in the Design Debt Log (`01_input-ideas.md`, from `docs/06_nodejs_review.md`, 2026-07-18) into scheduled work — see `02`/`03`/`04` §6 (v1.4 / NF48–NF49).

### Sprint 83 — Body size limit, async fs I/O (NF48–NF49)

- [x] **NF48 — Add a global request body size limit.** Install Hono's `bodyLimit` middleware in `createApp()` (5–10 MB cap) ahead of route handlers, applied to all JSON-accepting routes.
  - *Acceptance:* a request with a body over the configured limit receives a 413 response instead of being parsed and rendered.
- [x] **NF49 — Move snapshot/viewport-cache persistence to async fs I/O.** Swap `readFileSync`/`writeFileSync`/`readdirSync` for `fs/promises` equivalents in `server/viewport-cache.ts`, `server/snapshot-reader.ts`, `server/snapshot-writer.ts`, especially the loop-heavy read paths (`listSnapshots`, `listAllSnapshots`, delete operations). Debounce viewport-cache writes or keep an in-memory cache flushed periodically instead of a full synchronous rewrite per update.
  - *Acceptance:* `listSnapshots`/`listAllSnapshots`/delete operations no longer block the event loop for their duration; rapid successive viewport updates no longer trigger a full synchronous file rewrite per event.

> **Implementation note:** NF48 is a small, independent, one-middleware change. NF49 touches 3 files and ~15 call sites — do the mechanical read/write swap first, then decide the viewport-cache debounce/in-memory strategy as a follow-up within the same sprint.

> **Scoping decision (NF49, implemented 2026-09-07):** `snapshot-writer.ts`'s `saveSnapshot()`/`generateSnapshotId()` were deliberately left synchronous — a single non-loop write per render/commit, not one of the "loop-heavy read/delete paths" the acceptance criteria names, and converting it would cascade `async` through `render-core.ts`'s `commitRenderResult`/`commitStepFramesResult` and every REST/MCP caller with no test coverage requiring it. Converted: `snapshot-reader.ts` (all read functions), `snapshot-writer.ts`'s `validateWorkspaceForDelete`/`deleteSnapshotFiles`/`deleteWorkspace`, and `viewport-cache.ts` (full async rewrite with an in-memory cache + coalesced/debounced disk flush, plus `render-core.ts`'s `stepAndBroadcast`/`seekAndBroadcast`, the only two callers of `getViewport`).

---

## Definition of Done — v1.4
- Both tasks above shipped with passing acceptance criteria.
- Full unit + integration test suite green, including a 413-on-oversized-body test and a test verifying the event loop isn't blocked by a large snapshot listing.
- No MCP/REST contract changes — internal I/O-strategy changes only.
- `01`/`02`/`03`/`04` entries for these 2 findings updated from "logged, unscheduled" to resolved; Design Debt Log bullet(s) removed or marked done.
