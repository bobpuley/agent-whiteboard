# Milestone v0.6 — Dynamic Workspace Routing

> Sprint 19. Released 2026-06-13.
> Objective: Enable per-session workspace routing without env var setup or server restart.

---

## Context

Current state (v0.5): workspace name is determined by `WHITEBOARD_WORKSPACE` env var or `basename(process.cwd())` at server startup. For teaching scenarios (one dev machine, multiple courses), the user must either:
1. Restart the server for each course
2. Use a shell wrapper script to set env vars before launching Claude

FR0 enables the agent to specify the workspace name directly in `render()` calls, routing snapshots dynamically per-call without infrastructure overhead.

---

## Requirements Addressed

- **F14:** Dynamic workspace override in `render(options.workspace)`
- **G2b:** Workspace override precedence (per-call > env var > default)

---

## Acceptance Criteria

- [x] `render()` tool accepts optional `options.workspace` string
- [x] `POST /render` REST endpoint respects `options.workspace` in the request body
- [x] Workspace name is validated: alphanumeric, dashes, underscores, dots, spaces only (no path separators, `..`, null bytes)
- [x] Invalid workspace names are rejected with `{ ok: false, error: "..." }`
- [x] Valid workspace overrides the snapshot file path only (does NOT affect history panel scope or in-memory state)
- [x] Snapshot file is written to `~/.agent-whiteboard/<workspace>/<timestamp>_screen.json` when `options.workspace` is provided
- [x] History panel continues to use the current workspace (from env var or default), not the per-call workspace
- [x] MCP tool schema updated with `options.workspace` in the JSON Schema description
- [x] Tests: validate workspace name safety, confirm snapshot routing, verify history panel scope is unchanged

---

## Tasks

- [x] **F14.1** — Update `render()` MCP tool signature and validation: accepts `options.workspace?: string`; validates alphanumeric + dash/underscore/dot/space; rejects path separators and `..`; returns `{ ok: false, error: "..." }` on invalid name
- [x] **F14.2** — Update `snapshot.ts`: `saveSnapshot()` accepts optional explicit `workspace` param; precedence: explicit param > env var > default; snapshot routed to correct workspace folder
- [x] **F14.3** — Update `POST /render` REST endpoint: body accepts optional `workspace` field; same validation and routing as MCP tool; returns error if invalid
- [x] **F14.4** — Test: workspace name validation — unit tests for safe-name pattern; rejects `..`, `/`, null bytes; accepts dashes/underscores/dots/spaces
- [x] **F14.5** — Test: snapshot routing — integration test: render with `options.workspace="course_1"` writes snapshot to correct folder; history panel still uses env var workspace

---

## Rollout

1. Implement F14.1 – F14.3
2. Add tests (F14.4 – F14.5)
3. Update docs (F14.6 – F14.7)
4. Release as v0.6 patch (or minor, depending on semver policy)
