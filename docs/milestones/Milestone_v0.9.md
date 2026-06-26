# Milestone v0.9 — Live Step-Frames Preview

> Sprint 22. Status: planned.
> Objective: Make `append_frame()` push a live browser preview after each call, so the user watches the step-frames sequence grow in real time. `commit_step_frames()` becomes finalization-only (snapshot write, slideshow cancel, in-memory state update).

---

## Context

In v0.8, the browser only shows the assembled step-frames diagram after `commit_step_frames()` is called. While building, the user sees only the "Building step-frames… 0 frames" placeholder. This was noted as a planned improvement in Milestone_v0.8.md.

The new behavior (FR6):
1. `init_step_frames()` — unchanged: pushes 0-frame placeholder.
2. `append_frame()` — validates + appends, then **immediately pushes the full accumulated partial step-frames sequence to the browser** (same WebSocket format as `render(type="step-frames", ...)`), positioned at the latest frame. The user sees the diagram grow one frame at a time.
3. `commit_step_frames()` — **finalization only**: assembles final JSON, writes snapshot, updates in-memory canvas state, cancels slideshow, deletes builder entry. Still pushes a final broadcast for consistency (handles `clear()` edge case).

In-memory canvas state is NOT updated by `append_frame()` — only by `commit_step_frames()`. `export()` therefore returns the assembled JSON only after commit, same contract as v0.8.

---

## Requirements Addressed

- **FR6** (new): Live browser preview on each `append_frame` (01_input-ideas.md).
- **F15** updated: `append_frame()` now pushes to browser; `commit_step_frames()` is finalization-only. REST endpoint `POST /step-frames/:id/frame` mirrors the change.
- **I5** (new assumption): `append_frame()` renders incremental partial step-frames to browser (02_assumptions-and-risks.md).
- **I4** updated: `commit_step_frames()` scope narrowed to finalization (02_assumptions-and-risks.md).

---

## Tasks

- [x] **T1 — `server/step-frames-builder.ts`**: After a valid `appendFrame()`, call `broadcastStepFrames(partialFrames, frameType, title, currentFrame=N-1)` (new helper in `ws.ts`). Do NOT update in-memory canvas state here. Validation and TTL reset remain unchanged.
  - DoD: unit test confirms that after each `appendFrame()` the broadcast is called with the correct partial frame list; in-memory canvas state is unchanged between appends.

- [x] **T2 — `server/ws.ts`**: Extract a `broadcastStepFrames(frames, frameType, title?, currentFrame)` helper (or reuse existing broadcast logic). Called by both `append_frame` (partial) and `commit_step_frames` (final). Keeps broadcast format consistent.
  - DoD: helper emits `{ action: "replace", type: <frameType>, stepFrames: true, frames: [...], currentFrame: N, totalFrames: M, title? }` over WebSocket.

- [x] **T3 — `server/mcp.ts` / `server/app.ts`**: Update `append_frame` MCP tool description and `POST /step-frames/:id/frame` REST endpoint description to reflect live-preview behavior. `commit_step_frames` description updated to "finalization only".
  - DoD: MCP tool description no longer says "Does NOT update the browser"; instead describes the live preview; `commit_step_frames` description says it finalizes (snapshot, state, cleanup) rather than "renders".

- [x] **T4 — `client/src/`**: No client changes expected — the browser's existing step-frames renderer handles any `stepFrames: true` WebSocket event regardless of whether it comes from `append_frame` or `commit_step_frames`. Confirm by running the e2e test suite unchanged.
  - DoD: Playwright e2e tests (`tests/e2e/canvas.spec.ts`) pass without modification.

- [x] **T5 — `tests/unit/server/app.test.ts`**: Add tests:
  - After `POST /step-frames/:id/frame`, a WebSocket broadcast is sent with the partial sequence.
  - After `POST /step-frames/:id/commit`, the broadcast is still sent (final).
  - `export()` before commit returns the canvas state from before the build started (not the partial build).
  - DoD: new tests green; existing 64+ tests unchanged.

---

## Acceptance Criteria

- [x] After each valid `append_frame(id, payload, label?)`, the browser immediately shows the accumulated partial step-frames sequence (N frames, step bar visible, positioned at frame N-1).
- [x] Invalid `append_frame` payloads are rejected before any broadcast; prior frames and browser state are preserved.
- [x] `commit_step_frames(id)` writes a snapshot, updates in-memory canvas state, cancels any running slideshow, and deletes the builder entry. A final broadcast is sent.
- [x] `export()` before `commit_step_frames()` returns the canvas state from before the builder started (not the partial sequence). `export()` after commit returns the fully assembled step-frames JSON.
- [x] Existing `render(type="step-frames", ...)` and `commit_step_frames()` end-to-end behaviour is unchanged.
- [x] All Playwright e2e tests (`npm run test:e2e`) pass. *(14 tests were failing pre-existing due to missing `options.workspace` in e2e render calls — fixed as part of this sprint. All 28 tests now pass.)*
- [x] All Vitest unit/integration tests (`npm test`) pass.
