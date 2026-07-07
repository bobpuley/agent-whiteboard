# Milestone v0.23 — Architecture Consolidation: Unified Projector (Sprint 36)

**Status:** planned

> Opened 2026-07-07 via `/doc-creator-driver:intake`, slice A of the architecture consolidation promoted from `desing-analysis/` (FR22 in `01_input-ideas.md`; adoption/sequencing rationale in `02_assumptions-and-risks.md` §N; full target architecture in `04_architecture.md` §9). This is the analysis's own "80/20": the single highest-value, lowest-risk structural win, landed over today's `CanvasState` with no schema change.

### Sprint 36 — Unified Projector
- [ ] **Build one shared broadcast builder (U5)** that always includes `id`, cursor (`currentFrame`/`totalFrames` equivalent), and viewport, replacing the 13 independently hand-built `{ action: "replace", ... }` construction sites currently spread across `app.ts` (×4), `mcp.ts` (×2), `render-core.ts` (×3), `slideshow.ts` (×3), and `ws.ts` (×1). This is the structural end of the B15/C2b/C2d drift class — a later broadcast producer forgetting a field the others already have becomes impossible because there is only one producer.
- [ ] **Migrate `render-core.ts`'s existing broadcast construction** to call the new shared builder instead of assembling the message inline.
- [ ] **Migrate `slideshow.ts`'s three broadcast builders** (`broadcastTick`, `broadcastSlide` plain, `broadcastSlide` step-frames) to the new builder — directly targets the root cause of B15 (slideshow missing `id`) and the general C2d class (slideshow independently re-implementing broadcast construction).
- [ ] **Migrate the remaining direct-broadcast call sites** in `app.ts`/`mcp.ts` (`step`, `seek`, history-load) to the shared builder.
- [ ] **Verify byte-for-byte message-shape equivalence** against the full existing test suite (365 unit tests + e2e) — this is a pure internal refactor; the WebSocket contract must not change in this milestone (that's v0.26's job).

> **Implementation note:** this milestone deliberately does not touch the content model, the snapshot schema, or the MCP payload contract — only *how* the existing broadcast shape gets constructed. Landing it first, isolated, gives the safest possible validation that "one projector" actually works before the higher-risk slices (persistence policy in v0.25, full content-model rewrite in v0.26) build on top of it.

---

## Definition of Done — v0.23
- All known hand-built `{ action: "replace", ... }` broadcast sites (13, across `app.ts`/`mcp.ts`/`render-core.ts`/`slideshow.ts`/`ws.ts`) are replaced by one shared builder function.
- Full existing test suite (unit + e2e) passes unchanged — no WebSocket message shape or API contract change in this milestone.
- New unit tests directly cover the shared builder's `id`/cursor/viewport inclusion on every call path (render, step, seek, history-load, slideshow tick/finalize).
- `04_architecture.md` §2/§3 updated to describe the single projector in place of the per-site broadcast descriptions.
