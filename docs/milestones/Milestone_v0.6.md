# Milestone v0.6 — Dynamic Workspace Routing

> Sprint 19. Planned.
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

| Task | Description | DoD |
|------|-------------|-----|
| F14.1 | Update `render()` MCP tool signature and validation | Accepts `options.workspace?: string`; validates alphanumeric + dash/underscore/dot/space; rejects path separators and `..`; returns `{ ok: false, error: "..." }` on invalid name; PR merged |
| F14.2 | Update `snapshot.ts` — workspace parameter handling | `saveSnapshot()` function accepts optional explicit `workspace` parameter; precedence: explicit param > env var > default; snapshot file routed to correct workspace folder; PR merged |
| F14.3 | Update `POST /render` REST endpoint | Body accepts optional `workspace` field; same validation and routing as MCP tool; returns error if invalid; PR merged |
| F14.4 | Test: workspace name validation | Unit test for safe-name pattern; rejects `..`, `/`, null bytes; accepts dashes/underscores/dots/spaces; test passes |
| F14.5 | Test: snapshot routing — per-call workspace | Integration test: render with `options.workspace="course_1"` writes snapshot to `~/.agent-whiteboard/course_1/`; history panel still uses env var workspace; test passes |
| F14.6 | Update requirements & docs — v0.6 → `03_requirements.md` | F14 requirement updated from "planned" to "v0.6"; MCP tool description updated; PR merged |
| F14.7 | Documentation: README or inline help | Document `options.workspace` parameter, precedence order, use case (multi-course on one machine); add example: `render({ type: "mermaid", payload: "...", options: { workspace: "course_2" } })` |

---

## Rollout

1. Implement F14.1 – F14.3
2. Add tests (F14.4 – F14.5)
3. Update docs (F14.6 – F14.7)
4. Release as v0.6 patch (or minor, depending on semver policy)
