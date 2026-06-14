# Milestone v0.7 — Mandatory Workspace Parameter

> Sprint 20. Status: planned.
> Objective: Promote `options.workspace` in `render()` from optional to required; remove the implicit fallback chain and deprecate `WHITEBOARD_WORKSPACE` env var.

---

## Context

v0.6 shipped `options.workspace` as an optional override in `render()`, with a three-level fallback chain:
`options.workspace` → `WHITEBOARD_WORKSPACE` env var → `basename(process.cwd())`.

This makes workspace routing implicit and error-prone: a session that forgets to pass `options.workspace` silently routes snapshots to the wrong folder. Promoting workspace to mandatory forces the agent to be explicit at every call site, eliminating accidental cross-workspace snapshot pollution.

This is a **breaking change**: any `render()` call that omits `options.workspace` will now receive `{ ok: false, error: "workspace is required" }` instead of succeeding silently.

---

## Requirements Addressed

- **F14** (updated): `options.workspace` is now required in `render()` and `POST /render`.
- **G2** (updated): workspace is always supplied by the agent; no server-side derivation.
- **G2b** (superseded): three-level precedence chain removed.
- **G2c** (open): `isCurrent` field in `GET /snapshots/all` — how to determine current workspace without `WHITEBOARD_WORKSPACE`.

---

## Open Question (must resolve before Sprint 20 implementation)

**G2c — `isCurrent` without env var:** with `WHITEBOARD_WORKSPACE` removed, the server has no startup-time signal for "current workspace." Candidates:
- (a) Drop `isCurrent` from `GET /snapshots/all` — history accordion shows all workspaces collapsed equally.
- (b) Server tracks last workspace used in a `render()` call (in-memory); returns it as `isCurrent`.
- (c) Client (browser) remembers last loaded workspace in `localStorage`.

Decision needed before implementation. Prefer option that does not introduce new config surface.

---

## Acceptance Criteria

- [ ] `render()` MCP tool JSON schema marks `options.workspace` as required; absent value returns `{ ok: false, error: "workspace is required" }` before any render or snapshot write
- [ ] `POST /render` REST endpoint requires `workspace` in the request body; same error shape
- [ ] Workspace safety validation unchanged (alphanumeric, dashes, underscores, dots, spaces; no path separators or `..`)
- [ ] `snapshot.ts` `saveSnapshot()` receives workspace directly from options — no env var lookup, no `basename(process.cwd())`
- [ ] `WHITEBOARD_WORKSPACE` env var is no longer read anywhere in the server codebase
- [ ] `GET /snapshots/all` `isCurrent` field resolved per G2c decision above
- [ ] All existing tests that call `render()` without workspace updated to pass workspace explicitly
- [ ] New tests: verify `{ ok: false, error: "workspace is required" }` when workspace is absent
- [ ] New tests: verify env var no longer affects snapshot routing

---

## Tasks

- [ ] **F14.1b** — Update `render()` MCP tool JSON schema: `options.workspace` promoted from optional string to required string; update tool description to state it is mandatory
- [ ] **F14.2b** — Update `snapshot.ts` `saveSnapshot()`: remove env var and `basename(process.cwd())` fallback; workspace is always passed explicitly; throw if absent (should never happen after F14.1b)
- [ ] **F14.3b** — Update `POST /render` REST endpoint: validate `workspace` field presence before other checks; return `{ ok: false, error: "workspace is required" }` with 400 if missing
- [ ] **F14.4b** — Resolve G2c: implement chosen `isCurrent` strategy for `GET /snapshots/all`
- [ ] **F14.5b** — Update all unit and e2e tests that call `render()` to include `options.workspace`; add tests for missing-workspace error path
- [ ] **F14.6b** — Remove all `WHITEBOARD_WORKSPACE` env var reads from server code and config examples; update any README / doc references
