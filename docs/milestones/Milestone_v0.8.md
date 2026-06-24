# Milestone v0.8 — Incremental Step-Frames Creation

> Sprint 21. Status: in progress.
> Objective: Allow agents to build complex step-frames sequences one frame at a time instead of generating the entire payload in a single call, reducing syntax errors and LLM generation time.

---

## Context

Generating a complete step-frames JSON payload in one `render()` call requires the LLM to produce a deeply nested structure with many character escapes in a single shot. This leads to frequent syntax errors and slow generation. 

The fix is a three-tool protocol:
1. `init_step_frames()` — create an empty skeleton; server returns a unique ID and pushes a 0-frame placeholder to the browser.
2. `append_frame()` — validate and append one frame at a time; no browser update yet.
3. `commit_step_frames()` — assemble and render the complete sequence (equivalent to `render(type="step-frames", ...)`).

Partial sequences expire automatically after 30 minutes of inactivity.

> **Planned next improvement (not in this milestone):** Make `append_frame()` push an incremental browser update after each call, so the user can watch the graph being built in real time.

---

## Requirements Addressed

- **F15** (new): Incremental step-frames creation — three-tool protocol, REST fallback endpoints, TTL cleanup.
- **I1–I4** (new assumptions): In-memory builder state, sequential append, 0-frame placeholder render, commit equivalence.

---

## Tasks

- [x] **T1 — `server/step-frames-builder.ts`**: In-memory map `id → { frame_type, workspace, title, frames[], timer }`. `createBuilder()` generates a UUID, sets a 30-min inactivity TTL via `setTimeout`. `appendFrame()` validates payload (reuse existing `validate.ts` logic), appends to frames[], resets TTL. `commitBuilder()` assembles full step-frames JSON, deletes the entry. `expireBuilder()` (TTL callback) silently deletes the entry. All operations return typed results; no throws.
  - DoD: unit tests cover create, append (valid/invalid payload), commit (normal, empty, expired), TTL expiry.

- [x] **T2 — MCP tools**: Add `init_step_frames`, `append_frame`, `commit_step_frames` to `server/mcp.ts`. JSON schemas expose all parameters; descriptions explain the three-step protocol and the TTL.
  - `init_step_frames`: params `frame_type` (enum, required), `workspace` (string, required), `title` (string, optional).
  - `append_frame`: params `id` (string, required), `payload` (string, required), `label` (string, optional).
  - `commit_step_frames`: params `id` (string, required).
  - DoD: tools visible in MCP; end-to-end manually verified (init → append × N → commit → diagram appears in browser).

- [x] **T3 — REST fallback endpoints**: Add to `server/app.ts`:
  - `POST /step-frames/init` — body: `{ frame_type, workspace, title? }` → `{ ok, id }`.
  - `POST /step-frames/:id/frame` — body: `{ payload, label? }` → `{ ok, frame_count }`.
  - `POST /step-frames/:id/commit` — no body → `{ ok }`.
  - DoD: unit tests in `tests/unit/server/app.test.ts` cover all three endpoints (success, unknown ID, empty commit, invalid payload).

- [x] **T4 — Browser placeholder**: Handle new WebSocket event `{ action: "replace", type: "step-frames-placeholder", title, frameCount: 0 }` in the Svelte client. Display a placeholder canvas state (e.g., "Building step-frames… 0 frames"). Existing step-frames renderer handles the committed result unchanged.
  - DoD: Playwright e2e test confirms placeholder appears after `init_step_frames()` and is replaced by the real diagram after `commit_step_frames()`.

---

## Acceptance Criteria

- [x] `init_step_frames(frame_type, workspace, title?)` returns `{ ok: true, id }` and pushes a 0-frame placeholder to the browser; invalid workspace or unsupported frame_type returns `{ ok: false, error }`.
- [x] `append_frame(id, payload, label?)` returns `{ ok: true, frame_count: N }`; invalid payload returns `{ ok: false, error }` without dropping prior frames; unknown/expired id returns `{ ok: false, error: "step-frames session not found or expired" }`.
- [x] `commit_step_frames(id)` renders the assembled sequence identically to `render(type="step-frames", ...)`; zero-frame sequence returns `{ ok: false, error: "cannot commit empty step-frames sequence" }`.
- [x] Partial sequences with no activity for 30 minutes are silently deleted; subsequent calls with that ID return the expired error.
- [x] All three REST fallback endpoints (`POST /step-frames/init`, `POST /step-frames/:id/frame`, `POST /step-frames/:id/commit`) behave identically to their MCP counterparts.
- [x] Existing `render(type="step-frames", ...)` behaviour is unchanged.
