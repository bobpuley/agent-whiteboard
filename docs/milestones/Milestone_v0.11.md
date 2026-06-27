# Milestone v0.11 — Export by Graph ID

> Status: in progress.
> Objective: Allow the agent to retrieve any previously rendered graph's payload by a stable UUID, not just the last rendered one.

---

## Context

`export()` currently returns only the last `render()` payload — once the agent renders a new diagram, the old one is gone (unless the agent tracked it in the terminal). FR7 adds a durable ID to every rendered graph so the agent can retrieve any past payload by ID.

---

## Requirements Addressed

- **FR7** → F16 (export by graph ID; snapshot schema gains `id` field; `render()` + `commit_step_frames()` return `id` in response)
- **J1** (assumption: snapshot schema backward-compatible; old snapshots without `id` are not addressable)

---

## Planned Scope

1. `snapshot.ts` — generate a UUID at write time; include `id` field in snapshot JSON.
2. `render()` and `commit_step_frames()` MCP tools + REST endpoints — return `{ ok: true, id: "<uuid>" }` on success.
3. `export(id?)` MCP tool — optional `id` parameter. With id: scan `WHITEBOARD_SNAPSHOTS_DIR` for snapshot with matching `id` field; return its `payload`. Without id: current behavior.
4. `GET /export` REST endpoint — accept optional `id` query param (or body field); same lookup logic.
5. Error handling: `{ ok: false, error: "graph not found" }` if id provided but no matching snapshot.
6. Old snapshots (no `id` field): not addressable by id — no migration, no backfill.

---

## Tasks

> To be detailed when this milestone is promoted to in-progress.

- [x] **T1 — `server/snapshot.ts`:** Generate UUID (`crypto.randomUUID()`) at snapshot write time; include `id` field in JSON.
- [x] **T2 — `server/mcp.ts` / `server/app.ts`:** Update `render()` + `commit_step_frames()` success responses to include `id`.
- [x] **T3 — `server/mcp.ts` / `server/app.ts`:** Add optional `id` parameter to `export()` MCP tool and `GET /export` REST endpoint; implement snapshot scan logic.
- [x] **T4 — `tests/unit/server/app.test.ts`:** Tests for id-based export (found / not found / old snapshot without id).
- [x] **T5 — `docs/04_architecture.md`:** Update export response shape table and MCP tool description.

---

## Acceptance Criteria

> To be finalized when milestone is promoted to in-progress.

- `render()` success response includes `{ ok: true, id: "<uuid>" }`.
- `export(id)` returns the payload of the snapshot with that UUID.
- `export()` (no id) returns the current canvas state (unchanged).
- Old snapshots without an `id` field are silently non-addressable.
- All existing tests pass; new tests cover the id-based path.
