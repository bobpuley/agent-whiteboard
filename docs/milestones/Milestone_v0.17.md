# Milestone v0.17 — Step-Frames Per-Frame Type & Validation Parity (Sprint 30)

**Status:** released

> Objective: close the validation gap between the two step-frames creation paths (B5) by giving `StepFrame` an optional per-frame `type`, validating every frame — in both `render(type="step-frames")` and `append_frame()` — against its effective type (`frame.type ?? frame_type`), and broadcasting that effective type per frame. This makes the incremental builder path a strict superset of the one-shot path and, as a side effect, allows a single step-frames sequence to mix content types (e.g. a mermaid frame followed by a katex frame). Full scope per the analysis already captured in `03_requirements.md` (F3a-gap), `02_assumptions-and-risks.md` (I6), and `04_architecture.md` (L109 note) — not a narrower validation-only fix.

---

## Context

Found 2026-07-03 during README/release-readiness review, logged as B5 in `01`. `render(type="step-frames", ...)` (MCP tool and `POST /render`) only checks payload *shape* (`frame_type` is a string, `frames` is a non-empty array, each `frame.payload` is a string) — it never calls `validatePayload(frame_type, frame.payload)` per frame, so a malformed mermaid or vega-lite frame is silently accepted and only fails (or silently mis-renders) when the user steps or seeks to it. `append_frame()` (`server/step-frames-builder.ts`) already calls `validatePayload(entry.frame_type, payload)` per frame at append time — the two creation paths for the same payload shape have had different validation guarantees since the incremental builder was added in v0.8, never a deliberate decision (F3a-gap, `03`).

`StepFrame` (`server/session.ts`) has no `type` field today — `frame_type` is one string shared by the entire sequence, threaded as-is through `session.ts`, `server/step-frames-builder.ts`, `server/validate.ts`, and `server/ws.ts`. Fixing B5 properly touches the same code path as adding a per-frame type, so the two are scoped together here rather than fixed twice.

---

## Requirements Addressed

- **B5** (`01`) / **F3a-gap** (`03`) — validation hard gate not honored on the one-shot step-frames path
- **I6** (`02`) — invalidated assumption of validation parity between the two creation paths
- Architecture note, `04` (§ MCP Tool Surface, `init_step_frames`/`append_frame` block) — per-frame `type` fix direction

---

### Sprint 30 — Step-Frames Per-Frame Type & Validation Parity

- [x] **T1 — `server/session.ts`:** add an optional `type?: string` field to the `StepFrame` interface.
- [x] **T2 — `server/validate.ts` (`validatePayload`, step-frames branch):** validate every frame with `await validatePayload(frame.type ?? spec.frame_type, frame.payload)`, returning `frame[N]: <error>` on the first invalid frame. Since `POST /render`, `POST /slideshow`, and `POST /snapshots/load` all funnel step-frames validation through this shared function, this single change closes B5 for all of them at once (not just the one-shot `render()` path called out in the original bug report) — deliberate scope widening since it was the same underlying gap and no additional surface area was needed.
- [x] **T3 — `server/step-frames-builder.ts` (`append_frame`):** accepts an optional `type` alongside `payload`; validates with `await validatePayload(type ?? entry.frame_type, payload)`; stores `{ label?, payload, type? }` on the entry's frame list. The partial-sequence broadcast (already fixed in T5 below) picks up the per-frame type automatically via `broadcastStepFrames()`.
- [x] **T4 — `server/app.ts` (`POST /step-frames/:id/frame`) + `server/mcp.ts` (`append_frame` tool):** both accept an optional `type` in the request body / tool args and pass it through to `appendFrame()`. MCP schema constrains `type` to the same enum as `render()`'s base types.
- [x] **T5 — Broadcast the effective per-frame type everywhere a frame is pushed to the browser:** `server/ws.ts` (`broadcastStepFrames`), `server/app.ts` (`POST /render`, `POST /step`, `POST /seek`, `POST /snapshots/load`), and `server/slideshow.ts` (`broadcastTick`, `broadcastSlide`) all now send `frame.type ?? frameType` instead of the sequence-level type, so navigating (step/seek) or auto-advancing (slideshow) through a mixed-type sequence renders each frame with its own renderer.
- [x] **T6a — `server/mcp.ts` `render` tool step-frames branch:** refactored to call the shared `validatePayload("step-frames", payload)` (now per-frame-validated, T2) instead of hand-rolling the shape check inline — closes the MCP-side half of B5 (the REST side was already closed by T2) and removes ~45 lines of duplicated validation logic. Broadcast now sends `frames[0].type ?? spec.frame_type`. `step()`/`seek()` MCP tool broadcasts also switched to `frame.type ?? state.frameType`.
- [x] **T6b — MCP tool schemas:** `append_frame`'s zod schema gains an optional `type` enum parameter (same enum as `render()`'s base types), documented as a per-frame override of the sequence's `frame_type`.
- [x] **T7 — Docs:** `03_requirements.md` (F3a-gap → resolved, F15, `append_frame` MCP Tool Surface row), `02_assumptions-and-risks.md` (I6 → resolved), `04_architecture.md` (known-gap note → resolved, `render`/`step`/`seek`/`append_frame` rows, REST fallback description, step-frames payload shape section + JSON example, slideshow data-flow example) all updated to reflect the shipped behavior. Stale in-product text also fixed: `mcp.ts`'s `render` and `init_step_frames` tool descriptions no longer claim the one-shot path skips validation.
- [x] **T8 — Tests:** covered across `app.test.ts`, `mcp.test.ts`, and `step-frames-builder.test.ts` — B5 regression (malformed one-shot frame rejected, nothing broadcast) at both the REST and MCP layers; `append_frame()` rejecting a per-frame `type` override that fails validation even when `entry.frame_type` would pass; and an end-to-end integration test building a mermaid+katex sequence via `init_step_frames`/`append_frame`/`commit_step_frames`, then confirming `step()` and `seek()` broadcast each frame using its own effective type. 220/220 tests pass; `tsc --noEmit` clean.

> **Implementation note:** `server/ws.ts` already sends a `type` field per broadcast event, so the browser client needs no changes — it already re-selects a renderer per WebSocket message with no cross-frame assumptions (confirmed in the `04` architecture note).

---

## Definition of Done — v0.17

- `render(type="step-frames", ...)` rejects a payload containing any frame that fails `validatePayload()` for its effective type, before touching canvas state or broadcasting — closing the B5 gap.
- `append_frame()` accepts an optional per-frame `type`, validated the same way, with parity to the one-shot path.
- A step-frames sequence can mix frame types (e.g. mermaid + katex) across both creation paths, and `step()`/`seek()` render each frame with its own type.
- `03`, `02`, `04` updated to reflect resolved status (F3a-gap, I6, and the `04` architecture note no longer read "not yet scheduled").
- New unit tests cover the B5 regression (malformed one-shot frame rejected) and per-frame type validation; existing tests pass.
