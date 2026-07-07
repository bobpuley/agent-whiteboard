# Milestone v0.25 — Architecture Consolidation: Persistence Policy & Finalize Dedup (Sprint 38)

**Status:** planned

> Opened 2026-07-07 via `/doc-creator-driver:intake`, slice C of the architecture consolidation promoted from `desing-analysis/` (FR22 in `01_input-ideas.md`; adoption/sequencing rationale in `02_assumptions-and-risks.md` §N; full target architecture in `04_architecture.md` §9). Builds on v0.23's unified projector — this slice does the same consolidation for the persistence/finalize side.

### Sprint 38 — Persistence Policy & Finalize Dedup
- [ ] **Define the persist-trigger vocabulary** (`immediate | on-finalize | transient | never`) as an explicit property every command path must declare — a new feature cannot route through the pipeline without choosing one. This is the direct structural fix for the FR20/B15 class of bug ("slideshow silently never persisted" because persistence was opt-in, not required).
- [ ] **Extract one shared finalize/persist implementation**, replacing `slideshow.ts`'s `finalizeSlideshow()` re-assembly logic and the duplicate finalize/persist copies in `render-core.ts` (`commitStepFramesResult` and friends) that currently re-implement the same JSON-assembly and "write must not block" backstop independently.
- [ ] **Wire `render`, step-frames (one-shot + incremental), and `slideshow`** through the one shared finalize/persist call, each supplying its own trigger (`render`/one-shot step-frames = `immediate`; `append_frame` = `transient`; `commit_step_frames`/slideshow-end = `on-finalize`; `step`/`seek`/history-load/`clear` = `never`).
- [ ] **Confirm existing persistence semantics are preserved exactly** — F7 (slideshow finalize-on-end), F10 (render snapshot persistence), and F15 (incremental step-frames finalization) behavior must be identical to v0.22, just implemented once instead of per-feature.

> **Implementation note:** this is the last slice landing before the full content-model rewrite (v0.26) — it deliberately keeps today's `CanvasState` shape and only consolidates *when* persistence fires, not *what* gets persisted. That separation is what keeps this milestone low-medium risk.

---

## Definition of Done — v0.25
- One shared persist/finalize implementation exists; `slideshow.ts`'s and `render-core.ts`'s separate re-assembly/finalize logic is removed in favor of it.
- Every command path declares an explicit persist trigger; there is no code path that can silently skip the decision.
- Existing persistence behavior (F7/F10/F15 semantics) is unchanged — verified by the full existing test suite passing unchanged.
- New unit tests confirm a command's persist trigger is enforced (e.g. a command without one fails loudly rather than silently never persisting).
