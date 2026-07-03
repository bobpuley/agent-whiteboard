# Milestone v0.17 — Step-Frames Per-Frame Type & Validation Parity (Sprint 30)

**Status:** in progress

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

- [ ] **T1 — `server/session.ts`:** add an optional `type?: string` field to the `StepFrame` interface.
- [ ] **T2 — `server/app.ts` (`POST /render`, one-shot path, ~L80-98):** before calling `setStepFrames()`, validate every frame in `spec.frames` with `await validatePayload(frame.type ?? spec.frame_type, frame.payload)`; on the first invalid frame, return `{ ok: false, error: "..." }` (same shape as the existing shape-check errors) without calling `setStepFrames()` or broadcasting. Update the broadcast at L84-94 to send `type: frames[0].type ?? spec.frame_type` instead of the current `type: spec.frame_type`.
- [ ] **T3 — `server/step-frames-builder.ts` (`append_frame`, ~L50):** accept an optional `type` alongside `payload`; validate with `await validatePayload(type ?? entry.frame_type, payload)`; store `{ label?, payload, type? }` on the entry's frame list; the partial-sequence broadcast pushed after each valid append must send the effective per-frame type, not `entry.frame_type`.
- [ ] **T4 — `server/app.ts` (`POST /step-frames/:id/frame`, ~L258):** mirror T3 — accept optional `type` in the request body, pass through to `appendFrame()`.
- [ ] **T5 — `step()` / `seek()` broadcast paths (`server/session.ts`, wherever the current frame is re-broadcast on navigation):** send `frames[N].type ?? frameType` as the event's `type`, not the sequence-level `frameType`, so navigating to a mixed-type sequence renders each frame with its own renderer.
- [ ] **T6 — MCP tool schemas (`init_step_frames`, `append_frame`) and REST body validation:** document/accept the new optional `type` parameter on `append_frame`; `frame_type` on `init_step_frames`/`render` becomes the sequence-wide default used when a frame omits `type`.
- [ ] **T7 — Docs:** update `03_requirements.md` (F3a-gap → resolved, F15), `02_assumptions-and-risks.md` (I6 → resolved), `04_architecture.md` (MCP Tool Surface table, step-frames payload shape section, `StepFrame` note) to reflect the shipped behavior; remove "not yet scheduled" language.
- [ ] **T8 — Tests:** unit test that a malformed mermaid frame inside a one-shot `render(type="step-frames")` payload is rejected with `{ ok: false, error }` and never reaches `setStepFrames()`/broadcast (regression test for B5). Unit test that `append_frame()` rejects a frame whose per-frame `type` fails validation even when `entry.frame_type` would have passed. Integration/manual test: a sequence mixing a `mermaid` frame and a `katex` frame, built via `append_frame()`, renders each frame correctly on step/seek.

> **Implementation note:** `server/ws.ts` already sends a `type` field per broadcast event, so the browser client needs no changes — it already re-selects a renderer per WebSocket message with no cross-frame assumptions (confirmed in the `04` architecture note).

---

## Definition of Done — v0.17

- `render(type="step-frames", ...)` rejects a payload containing any frame that fails `validatePayload()` for its effective type, before touching canvas state or broadcasting — closing the B5 gap.
- `append_frame()` accepts an optional per-frame `type`, validated the same way, with parity to the one-shot path.
- A step-frames sequence can mix frame types (e.g. mermaid + katex) across both creation paths, and `step()`/`seek()` render each frame with its own type.
- `03`, `02`, `04` updated to reflect resolved status (F3a-gap, I6, and the `04` architecture note no longer read "not yet scheduled").
- New unit tests cover the B5 regression (malformed one-shot frame rejected) and per-frame type validation; existing tests pass.
