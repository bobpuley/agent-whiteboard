# Milestone v1.3 — Design Debt: Data Integrity & Export Isolation (Sprint 82)

**Status:** released

> Opened 2026-09-06 via `/doc-creator-driver:intake` (bug report batch). Promotes 3 findings logged in the Design Debt Log (`01_input-ideas.md`) into scheduled work — see `02`/`03`/`04` §5 (v1.3 / NF45–NF47). 2 from `docs/06_nodejs_review.md` (2026-07-18), 1 from a post-v1.0 dev-mode config finding (2026-07-19).

### Sprint 82 — nodeToFrame validation, export isolation, dev-port config (NF45–NF47)

- [x] **NF45 — Validate `nodeToFrame` read back from disk.** Replace the unchecked type assertions in `server/app.ts`'s snapshot-load route and `server/snapshot-reader.ts`'s `findSnapshotByIdInWorkspace` with `nodeToFrameSchema.safeParse(...)` (the canonical schema in `server/validate.ts`). A failed parse drops the field, matching existing malformed-`frames` handling.
  - *Acceptance:* a snapshot file hand-edited to contain a non-numeric `nodeToFrame` value loads without crashing and without propagating bad data to the browser.
- [x] **NF46 — Isolate the HTML export pipeline's global-state mutation.** Replace or supplement `server/export-html.ts`'s `exportQueue` promise-serialization with true isolation (explicit `window`/`document` instances passed to DOMPurify/mermaid if supported, or worker-thread rendering) so a concurrent, unrelated touch of `global.document`/`window` can't corrupt an in-flight export.
  - *Acceptance:* two concurrent `POST /export-html` (or `export_html` MCP tool) calls don't corrupt each other's output, verified by a test exercising overlapping exports.
- [x] **NF47 — Fix dev-mode port/proxy config.** `client/vite.config.ts` reads `CLIENT_PORT` (default `5173`) for `server.port` and `PORT` (default `3000`) to build every proxy target, instead of hardcoding both.
  - *Acceptance:* setting `PORT=4000` before `npm run dev` results in the client dev server's proxy correctly targeting `:4000` with no manual `vite.config.ts` edit.

> **Implementation note:** NF45 and NF47 are small, independent, mechanical fixes. NF46 is the highest-effort item in this milestone — the isolation mechanism is an implementation decision (see `04` §5) and should be scoped/spiked before committing to an approach.

---

## Definition of Done — v1.3
- All 3 tasks above shipped with passing acceptance criteria.
- Full unit test suite green, including a new test for concurrent export isolation (NF46) and a corrupted-`nodeToFrame`-snapshot test (NF45).
- No MCP/REST contract changes, no snapshot/persistence file format changes.
- `01`/`02`/`03`/`04` entries for these 3 findings updated from "logged, unscheduled" to resolved; Design Debt Log bullet(s) removed or marked done.
