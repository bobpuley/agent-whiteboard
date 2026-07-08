# Milestone v0.26 — Architecture Consolidation: Unified Presentation Model (Sprints 39–48)

**Status:** planned

> Opened 2026-07-07 via `/doc-creator-driver:intake`, slice D of the architecture consolidation promoted from `desing-analysis/` (FR22 in `01_input-ideas.md`; full target architecture and decision points D1–D5 in `04_architecture.md` §9). This is the highest-value, highest-risk slice — the one the retired `desing-analysis/baseline-comparison.md` recommended gating on continued feature growth, but the user chose to adopt on architecture-quality principle ahead of a public release (`02` §N2/N4). Its changes are coupled (data model, reducer, WS contract, snapshot schema, MCP payload all move together) and cannot be split across a version boundary without a compat shim already ruled out (`02` N4) — so it stays **one milestone**, sequenced as 10 sprints (39–48) with individual acceptance criteria per `02` §N3, each landing in dependency order before the next starts. Tests for each contract change are rewritten within the same sprint that introduces it (not deferred to one final sprint) — the milestone's own traceability note attributes B5 to exactly that split between implementation and test coverage. **This milestone must complete before any public release.**

### Sprint 39 — Presentation/Frame data model (U2)
- [x] **Define the `Presentation`/`Frame` data model.** `Presentation { id, title?, cursor, frames: Frame[] }`, `Frame { type, payload, label? }`, replacing today's three parallel content shapes (bare `render`, the step-frames envelope, the slideshow envelope). Implement `validateFrame()` as the one validator, looped over every frame of every command — replaces the separate one-shot/incremental validation paths. *Acceptance: the type exists and is used internally; `validateFrame()` is called on every frame of every command path with no second validation implementation remaining; new unit tests cover `validateFrame()` directly and the old one-shot/incremental validation tests are removed.*

### Sprint 40 — Server reducer rewrite (U3, session.ts)
> Depends on Sprint 39's data model.
- [x] **Rewrite the server-side canvas-state reducer.** Replace `session.ts`'s `CanvasState` 3-way union with the single Presentation + cursor + driver (`static|manual|timed`) model. *Acceptance: `session.ts` doesn't branch on `type === "step-frames"` anywhere; it is the one server-side source of truth for the current presentation and cursor; `session.ts` unit tests are rewritten against the new shape.*

### Sprint 41 — Client reducer rewrite (U3, canvasStore.ts)
> Depends on Sprint 40's server reducer (mirrors its shape).
- [ ] **Rewrite the client-side canvas-state store.** Replace `canvasStore.ts`'s client-side mirror union with the same Presentation + cursor + driver model. *Acceptance: `canvasStore.ts` doesn't branch on `type === "step-frames"` anywhere; `canvasStore.ts` tests are rewritten against the new shape.*

### Sprint 42 — WebSocket contract update
> Depends on Sprint 41's client reducer.
- [ ] **Update the WebSocket contract.** The v0.23 projector now always carries `id` + `cursor` + `total`, replacing the `stepFrames` boolean flag entirely. *Acceptance: the new shape is documented in `04_architecture.md`; unit tests assert it on every broadcast path (render, step, seek, history-load, slideshow tick/finalize); old `stepFrames`-boolean assertions are removed.*

### Sprint 43 — Snapshot schema + migration script (build)
> Depends on Sprint 42's finalized on-disk-facing schema.
- [ ] **Define the schema and build the migration script.** Define the unified `frames[]` on-disk schema. Write a one-time, deterministic, idempotent migration script upgrading old snapshot files to the new schema (no legacy dual-read path — OQ5a). *Acceptance: migration script is covered by tests against representative fixture snapshots of every content type (mermaid/svg/html/katex/vega-lite, one-shot and step-frames).*

### Sprint 44 — Snapshot migration real run
> Depends on Sprint 43's tested script. Do not start until Sprints 39–43 are stable and reviewed — a bug in the reducer/contract discovered after migrating real data is a much worse position than discovering it before.
- [ ] **Run the migration against real data.** Back up `~/.agent-whiteboard/` (54 snapshots across 8 workspaces as of 2026-07-07, see `02` N5), run the script against the backup copy first in a dry-run mode, verify output, only then run for real. *Acceptance: a real backup exists before the real run; the real run is verified against the backup afterward.*

### Sprint 45 — MCP payload contract update
> Depends on the data model (Sprint 39) and WS contract (Sprint 42).
- [ ] **Update the MCP payload contract.** Remove `type:"step-frames"` as a top-level content type (a multi-frame Presentation replaces it); keep `render`/`slideshow`/`step`/`seek`/etc. as ergonomic sugar over "commit a Presentation + set a driver" per D5. Update `README.md`, MCP tool schemas/descriptions, and `tests/human_driven/showcase.js` to the new contract. No back-compat shim (`02` N4 — pre-release, zero external consumers). *Acceptance: showcase script runs clean end-to-end against the new contract; README's MCP tool surface table matches the shipped schema exactly; MCP-payload-shape tests are rewritten against the new contract.*

### Sprint 46 — Return channel: Interaction primitive unification (U7, D4)
> Depends on the data model (Sprint 39) and the reducers (Sprints 40–41). Behavior-preserving refactor — no new behavior yet.
- [ ] **Unify the return channel onto one Interaction primitive.** Implement the one arm/await/resolve Interaction primitive; `wait_done`/`wait_click` become configurations of it; `node_to_frame` becomes the same arm with a local (cursor-seek) resolver instead of an agent round-trip. *Acceptance: existing `wait_done`/`wait_click`/`node_to_frame` behavior is unchanged; their existing tests are rewritten to target the new primitive while asserting identical behavior.*

### Sprint 47 — Return channel: supersession & auto-restore
> Depends on Sprint 46's unified primitive. New behavior, not a refactor.
- [ ] **Add supersession and auto-restore.** `wait_click` gains `type:"superseded"` when a new `wait_click()`/`wait_done()` cancels a pending one (OQ11); `node_to_frame`/`clickMap` auto-restores after a `wait_click()` call resolves, instead of requiring the agent to call `render()` again (OQ12 — reverses U4e's current documented limitation in `03`). *Acceptance: new tests cover supersession and auto-restore explicitly.*

### Sprint 48 — Full-suite regression & contract parity check
> Depends on all of Sprints 39–47 — necessarily last. Verification only; no new implementation or test rewrites (those already landed sprint-by-sprint above).
- [ ] **Verify the full suite against the finished contract.** Run the full unit + e2e suite; grep for any remaining assertions against the old WS message shape, old MCP payload schema, or old snapshot schema; confirm no back-compat shim was introduced along the way. *Acceptance: full unit + e2e suite passes against the new contract with no old-shape assertions remaining anywhere; total test count and coverage breadth is at least equal to the pre-migration baseline (365 unit / current e2e count).*

---

## Definition of Done — v0.26
- `Presentation`/`Frame` is the sole internal content representation on both server and client; `type:"step-frames"` no longer exists as a top-level content type anywhere in the codebase.
- The WebSocket contract, MCP payload contract, and on-disk snapshot schema all reflect the unified model; `04_architecture.md` and `03_requirements.md` are updated to describe the shipped (not just planned) contract.
- The one-time snapshot migration has been run successfully against the real `~/.agent-whiteboard/` directory, with a verified backup taken beforehand.
- `README.md` and `tests/human_driven/showcase.js` reflect the new MCP contract with no references to the old payload shape.
- Full test suite (unit + e2e) has been rewritten sprint-by-sprint alongside each contract change and passes in full against the new contract; no back-compat shim exists for the old MCP payload shape or old snapshot schema (deliberate, per `02` N4).
- This milestone is complete and merged before any public release is scheduled.
