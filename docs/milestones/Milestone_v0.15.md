# Milestone v0.15 — Agent-Facing HTML Export (Sprint 28)

**Status:** in progress

> Objective: make the self-contained HTML export (F17, v0.13/v0.14) available to the agent, not just the browser HistoryPanel. The agent needs to (1) list a workspace's snapshots to discover what it can export, and (2) request an export of 1..N of them. Addressing is by snapshot `id` (UUID), not filename — see decision L5 in `02_assumptions-and-risks.md`.

---

## Context

Raw idea (FR15, `01`): "the export as self-contained html should be also available for agents." Resolved via a `/grill-me` design interview (2026-07-02) into the following decisions (full detail in L5/L6, `02`):

- New agent-facing tools (`list_snapshots`, `export_html`) address snapshots by `id`, not filename — every snapshot has carried an `id` since v0.11, and `scripts/backfill-snapshot-ids.py` has already closed the gap for older files.
- Existing browser-facing endpoints (`GET /snapshots`, `GET /snapshots/all`, `POST /snapshots/load`, `POST /snapshots/delete-files`) and `HistoryPanel.svelte` are **not** retrofitted to `id` in this milestone — that is a separate, larger refactor, deferred to a future milestone.
- `POST /export-html` is extended (not duplicated) to accept `{ workspace, id }` items alongside the existing `{ workspace, filename }` items.
- `GET /snapshots` is extended additively: each entry gains an `id` field, and the endpoint accepts an optional explicit `?workspace=` query param (mandatory for agent use, still defaults to `lastWorkspace` for the browser).
- The new `export_html` MCP tool writes the assembled HTML to disk and returns a path, rather than returning the HTML (which can be several MB once the `mermaid.js` bundle is embedded, see L1) inline in the tool response.

---

## Requirements Addressed

- **FR15** (`01`) → F11, F17, F18 updates + new MCP tools (`03`)
- **L5, L6** (`02`) — addressing-scheme and disk-write design decisions

---

### Sprint 28 — Agent-Facing HTML Export

- [x] **T1 — `server/snapshot-reader.ts`:** add `findSnapshotByIdInWorkspace(workspace, id, dir)` — like `findSnapshotById()` but scoped to a single workspace directory (no cross-workspace scan). Returns the full parsed snapshot record (needed by the export pipeline: `type`, `payload`, `timestamp`, `options`), not just `payload` like `findSnapshotById()` does.
- [x] **T2 — `server/snapshot-reader.ts`:** add `id` to `SnapshotEntry` and populate it in `listSnapshots()`. Update `listAllSnapshots()`'s call site if needed (no interface break expected — `id` is additive).
- [x] **T3 — `server/app.ts` (`GET /snapshots`):** accept an optional `?workspace=` query param; validate with the same safe-name check as `POST /snapshots/load`; fall back to `lastWorkspace` when absent (unchanged browser behavior).
- [x] **T4 — `server/export-html.ts` / `server/app.ts` (`POST /export-html`):** extend item resolution to accept `{ workspace, id }` in addition to `{ workspace, filename }`; resolve `id` items via `findSnapshotByIdInWorkspace()`. Unresolvable ids are skipped like unreadable files today.
- [x] **T5 — `server/mcp.ts`:** register `list_snapshots(workspace)` MCP tool — validates `workspace`, calls `listSnapshots()`, returns `{ ok: true, snapshots }`.
- [x] **T6 — `server/mcp.ts` + `server/export-html.ts`:** register `export_html(workspace, ids, output_path?)` MCP tool — validates `workspace` and non-empty `ids`, builds `{ workspace, id }` items, calls `generateExportHtml()`, writes the result to `output_path` (mkdir -p, no restriction) or the default `<WHITEBOARD_SNAPSHOTS_DIR>/<workspace>/exports/<name>-YYYYMMDD-HHmmss.html` (reuse `buildDownloadFilename()`), returns `{ ok: true, path }`.
- [x] **T7 — `tests/unit/server/app.test.ts`:** unit tests for `GET /snapshots?workspace=` (explicit param, id field present, fallback to lastWorkspace preserved), `POST /export-html` with `{ workspace, id }` items (found, not-found/skipped, mixed filename+id in one request), and the two new MCP tool handlers (`list_snapshots`, `export_html` — success, empty ids, unresolvable ids, custom `output_path`, default path).
- [ ] **T8 — Manual verification:** call `list_snapshots()` then `export_html()` against a real workspace via Claude Code; confirm the returned path exists, opens correctly, and matches the diagrams selected by id.

---

## Definition of Done — v0.15

- Agent can call `list_snapshots(workspace)` to discover exportable snapshots (id, timestamp, type, title) for a given workspace.
- Agent can call `export_html(workspace, ids, output_path?)` to export 1..N of those snapshots (by id) to a self-contained HTML file written to disk, receiving the file path back.
- `POST /export-html` continues to work unchanged for the browser (filename-based items); it also accepts id-based items from the agent path.
- `GET /snapshots` continues to work unchanged for the browser (implicit `lastWorkspace`, filename-keyed rows); it also accepts an explicit `?workspace=` param and includes `id` in each entry.
- No changes to `HistoryPanel.svelte` or any other browser-facing delete/load endpoint in this milestone.
- All existing tests pass; new tests cover the extended endpoints and the two new MCP tools.
