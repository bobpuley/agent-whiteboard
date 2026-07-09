# Architecture

> Decisions made here supersede deferred items in `01_input-ideas.md` and `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. Stack Decisions

| Layer                      | Choice                                                                                                                                                                                                                                                                                                       | Rationale                                                                                                                                                                                                                                              |
|----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Backend runtime            | Node.js ≥ 18 (LTS)                                                                                                                                                                                                                                                                                           | Better concurrency for multi-user WebSocket at scale; single runtime with browser; easier binary packaging in future. Node 18 is the minimum for Hono and `@modelcontextprotocol/sdk`.                                                                 |
| Backend framework          | Hono                                                                                                                                                                                                                                                                                                         | First-class TypeScript, ~15 kB bundle, minimal overhead; Express ruled out — heavier, bolted-on types                                                                                                                                                  |
| MCP server                 | Node.js MCP SDK (`@modelcontextprotocol/sdk`)                                                                                                                                                                                                                                                                | Official SDK, Node-native. Pin to exact version at `npm init` (Sprint 0); treat upgrades as deliberate decisions.                                                                                                                                      |
| MCP transport              | SSE (HTTP + Server-Sent Events)                                                                                                                                                                                                                                                                              | Server has its own lifecycle (also drives browser); SSE avoids a second process. stdio ruled out — requires Claude Code to spawn the server, but server must already be running for the browser.                                                       |
| Frontend framework         | Svelte                                                                                                                                                                                                                                                                                                       | Minimal bundle, reactive by default, no virtual DOM overhead; replaceable at low cost given thin v1 UX                                                                                                                                                 |
| Rendering libraries        | Mermaid.js ^11, KaTeX, vega-lite + vega-embed, DOMPurify (all npm, bundled by Vite)                                                                                                                                                                                                                         | Mermaid pinned to ^11 (breaking changes between major versions make floating risky). KaTeX, Vega-Lite, SVG/HTML (DOMPurify) added in Sprint 5 ✅. D2 and D3 deferred (D2 requires server-side render process; D3 is post-Phase-2 nice-to-have). **Planned (v0.20):** explicit `Content-Security-Policy` header + Mermaid `securityLevel` set explicitly rather than left at default — hardening only, no rendering-behavior change expected; verified against the full e2e suite before landing (see M3 in `02`, NF11 in `03`). **Planned (v0.21):** Mermaid/KaTeX/vega-embed switch from eager bundling to per-type dynamic `import()` (see M6 in `02`, NF13 in `03`). |
| Server-side rendering (export) | `happy-dom` (npm, server-only, v0.13) | DOM host for `DOMPurify` (SVG/HTML sanitization) during HTML export. One `Window` instance per export call, patched onto Node's `global.*` for the call's duration and torn down after all items are rendered. KaTeX and Vega-Lite do not require `happy-dom` (no DOM dependency). **Mermaid usage removed (v0.14, shipped):** `happy-dom` lacks real text-layout/font-metrics APIs, so `mermaid.render()` inside it produced invisible labels, wrong viewBox, or thrown errors (bug B4, see `01`/`02` L1). `server/export-html.ts` no longer imports `mermaid` or renders it server-side; `happy-dom` is retained only for the KaTeX/Vega-Lite/SVG/HTML paths. **Concurrency hardened v0.18 (bug B14, see `01`/`02` L4):** patching `global.*` per call isn't reentrant — two overlapping `generateExportHtml()` calls (reachable via `POST /export-html` and the `export_html` MCP tool) could stomp on each other's globals and leave `global.document` dangling on an already-closed Window. The implementation (renamed `generateExportHtmlInner()`) is now invoked through a `generateExportHtml()` wrapper that serializes calls via a promise queue, so only one call's globals are active at a time. |
| Client-side rendering (export, Mermaid only) | Embedded `mermaid.js` bundle inline in exported HTML (v0.14, shipped) | Mermaid needs real browser text-layout to size nodes/edges correctly — `happy-dom` cannot provide this. Embedding the full library source (read from `mermaid/dist/mermaid.min.js`, not a CDN `<script src>`) preserves the "opens correctly offline" requirement (F17) while getting real layout from whatever browser opens the file. |
| Transport (server→browser) | WebSocket                                                                                                                                                                                                                                                                                                    | Real-time incremental updates                                                                                                                                                                                                                          |
| Packaging (v1)             | `npm run dev` — dev-only. **Future direction (NF8, FR17, not yet scheduled):** `npx agent-whiteboard`, chosen over global npm install / standalone binary / Electron / Chrome extension / Docker as the lowest-friction fit for this architecture — no rearchitecture, only a `bin` entry + static-serving for `dist/client` (currently missing from the Hono app) + real version/`private` fields. | Repo now has a GitHub remote (as of 2026-07); packaging is no longer a non-concern, but implementation is deferred — captured in `01`/`02`/`03` (FR17, G2d, NF8), not milestone-scheduled |
| Dev server                 | Separate Vite dev server (`localhost:5173`) + Node server (`localhost:3000`); started together via `concurrently`; Vite proxies every browser-invoked endpoint (`/render`, `/clear`, `/export*`, `/step`, `/seek`, `/node-click`, `/wait-click`, `/snapshots*`, `/viewport`, `/user-done`, `/mcp`) to Node — matched by string-prefix, so e.g. `/export` also covers `/export-html`. **`/stream` requires `ws: true`** in Vite proxy config (WebSocket proxying is opt-in; HTTP proxy alone does not cover WS connections). **Gap found and fixed v0.22 (bug B16, see `01`):** `/seek` — the endpoint the browser calls directly for `node_to_frame` (U4e) clicks — was missing from the proxy list, so every such click 404'd in dev mode only (production, single-origin, was unaffected). Added. | HMR on Svelte side; Node server implementation unchanged; production static build deferred to Phase 2                                                                                                                                                  |
| Browser auto-open          | `open` npm package                                                                                                                                                                                                                                                                                           | Cross-platform (macOS/Linux/Windows) with a single API call; no platform-specific logic                                                                                                                                                                |
| Linting (planned, v0.20)   | ESLint, with `eslint-plugin-svelte` (client) + `@typescript-eslint` (client + server), runnable via an npm script                                                                                                                                                                                           | Codebase had no automated lint through Sprint 32; added retroactively rather than at project start. Scoped conservatively to catch real bugs (the a11y/unsafe-cast class of finding from the 2026-07-04 review), not full stylistic conformance — does not gate `npm run build` yet. See M1 in `02`, NF9 in `03`. |

---

## 2. System Architecture

```
[Claude Code agent]
    │
    └── MCP tool calls (render / clear / export / step)
           │
           ▼
    [MCP + HTTP Server]  (Node.js, :3000)
    │  • MCP tool handlers
    │  • REST POST /render, POST /clear, GET /export, POST /step  (curl-friendly fallback)
    │  • WebSocket /stream  (push to browser)
    │  • Serves the Svelte SPA (static files in production)
    │  • In-memory session state (one canvas at a time)
    │
    │  ── dev only ──────────────────────────────────────
    │  Vite dev server (:5173) runs alongside Node (:3000)
    │  Browser opens :5173; Vite proxies /render, /stream,
    │  /mcp to :3000. Node serves static files only in the
    │  production build (Phase 2 packaging concern).
           │
           ▼
    [Browser SPA]  (Svelte)
    │  • Receives render commands via WebSocket
    │  • Renders: Mermaid, SVG/HTML, KaTeX, Vega-Lite (v1); step-through frames
    │  • export() returns last render() payload as text (all types)
    │  • Auto-opens on server start
    │  • Done button → POST /user-done → signalDone() → wakes wait_done() tool
    │  • History panel (v0.4): toggle button → GET /snapshots → list; click entry → POST /snapshots/load → canvas updated
    │  • History panel workspace accordion (v0.5): toggle button → GET /snapshots/all → accordion grouped by workspace (current auto-expanded); click entry → POST /snapshots/load { workspace, filename } → canvas updated
    │  • Right-side controls panel (v0.10): small fixed panel on right edge; contains history toggle + Done button (icon-only); replaces footer/bottom-right placement from v0.2–v0.9. **v0.16:** gains delete and export icon buttons (see below) — panel now reads top-to-bottom as history, delete, export, done.
    │  • History panel lock/unlock (v0.10): toggle in panel header; locked = panel stays open after snapshot load
    │  • Done button conditional visibility (v0.12): button hidden by default; shown only when server emits { action: "set_done_armed", armed: true }; hidden again on armed: false; server pushes current state to every new WebSocket connection
    │  • History panel delete/export — REPLACED in v0.16 (see below). Superseded design (v0.12–v0.13, kept here for change history): recycle bin + export icons in the panel header toggled inline selection mode with checkboxes on every row across all workspace accordions at once, a per-workspace "Delete folder"/"Export workspace" action bar, and an always-visible per-row hover-delete button. All of this UI is removed in v0.16.
    │  • Delete/export modal (v0.16, shipped — see FR16 in `01`, K3 in `02`): clicking the delete or export icon in the right-side controls panel opens a 2-step modal instead of toggling inline selection mode. Step 1: pick a workspace from a list (skipped, opening directly to step 2, when only one workspace has snapshots). Step 2: zoomed into that workspace — a single "Delete/Export entire workspace" action, or check a subset of its snapshots and act on just those via a footer "N selected" bar. Whole-workspace delete requires a second confirming interaction (replaces the old `window.confirm()`); whole-workspace export does not. Calls the same server endpoints as before (`POST /snapshots/delete-files`, `POST /snapshots/delete-workspace`, `POST /export-html`) — pure client-side UI change, no new endpoints. Prototyped in `mockup/whiteboard-view-v2.html`.
    │  • Mermaid zoom/pan fit + persistence (v0.19, shipped — see FR18 in `01`, C3 in `02`; **per-frame re-fit, v0.26.1, bug B19 in `01`**): every new `render()`/`commit_step_frames()` result auto-fits (scale-to-contain, centered) on first display; `step()`/`seek()` within a sequence **now also re-fits each frame independently** (reversing the original "whole sequence shares one viewport" behavior — FR21 in `01`, scheduled as part of B19's fix). Zoom/pan changes are debounced (~800ms) and POSTed to `/viewport`, keyed by **`id:frameIndex`** (composite key, was snapshot `id` alone), and stored server-side in a viewport-cache file separate from the snapshot JSON files. The server includes the cached viewport in the WebSocket broadcast whenever that `id`+frame combination is (re)displayed; the browser applies it instead of auto-fitting. Mermaid-only; no MCP tool.
```

**Unified broadcast projector (v0.23, shipped — U5 in §9.2):** every server→browser `{ action: "replace", ... }` message — from `render()`, `step()`, `seek()`, history-load (`POST /snapshots/load`), and slideshow ticks/finalization — is built by one function, `broadcastReplace()` in `server/ws.ts` (with `broadcastStepFrames()` as a thin convenience wrapper over it for the frames-array + index call shape). Previously each of `app.ts` (×4), `mcp.ts` (×2), `render-core.ts` (×3), `slideshow.ts` (×3), and `ws.ts` (×1) hand-assembled this object inline — 13 independent construction sites that could (and did — see B15) drift out of sync on which fields (`id`, `viewport`, `nodeToFrame`, the step-frames cursor) they remembered to include. All 13 now call `broadcastReplace()` (or `broadcastStepFrames()`, itself built on top of it), so a field one call path carries can no longer silently be missing from another *when that field is part of `broadcastReplace()`'s own parameter list*. Pure internal refactor: the WebSocket message shape and every existing API contract are unchanged (verified by the full unit + e2e suites passing with unmodified behavior — see `05`, `Milestone_v0.23.md`). **Caveat exposed by bug B18 (`01`, found 2026-07-09):** the guarantee only holds for `broadcastReplace()` callers directly — `broadcastStepFrames()`'s own signature can still omit a field (it has no `nodeToFrame` parameter), reintroducing exactly the drift-between-call-paths class this refactor was meant to eliminate, one layer up. See `02` C2e.

**Shipped in MVP (not Phase 2):**
- Full server-side Mermaid parse validation — Sprint 6 ✅
- `step()` tool + step-through frame sequences — Sprint 7 ✅
- SVG/HTML, Vega-Lite, KaTeX renderers — Sprint 5 ✅ (D2 is post-Phase-2 — requires server-side render process)
- `options.title` overlay — Sprint 8 ✅

**Shipped in Phase 2:**
- Slideshow / auto-play (`slideshow()`, `slideshow_stop()`) — Sprint 9 ✅. Each slide broadcast using the same WebSocket event format as `POST /render`. (Historical: `step-frames` slides expanded into individual timer ticks — removed v0.26 Sprint 45 along with `type: "step-frames"` as a top-level content type; a slide is always exactly one frame now.)
- `wait_done()` tool + Done button — Sprint 10 ✅. `signalDone()` called by `POST /user-done`; `waitForDone()` called by both `POST /wait-done` (REST) and `wait_done()` (MCP tool). Built on the `Interaction` primitive in `server/interaction.ts` since v0.26 Sprint 46 (was its own EventEmitter bus in the now-removed `server/events.ts` through v0.25). See §3, §4, and §9.2 (U7).
- Channels API experiment (`server/channel.ts`) — Sprint 10 ✅. Stdio MCP channel server + HTTP relay on port 3001. Useful for async push events; not used as the primary "wait for user" primitive (see `02` E1).
- `wait_click()` tool (plain click, no popup) + `POST /node-click` endpoint — Sprint 12 ✅. Browser arms click listeners on Mermaid SVG nodes/edges; `signalClick()`/`waitForClick()` built on the `Interaction` primitive in `server/interaction.ts` (v0.26 Sprint 46; previously its own EventEmitter bus in `server/events.ts`). See §3 and §4.

**Remaining Phase 2 / Phase 3:**
- `wait_click()` — `node_actions` popup menu + edge support (Sprint 14) ✅
- `POST /wait-click` REST fallback does not yet arm the browser (bug fix, Sprint 13) ✅
- `seek(frame)` MCP tool + `POST /seek` REST endpoint — client-controlled frame navigation (Sprint 13) ✅
- `node_to_frame` — declarative node→frame map for autonomous browser navigation (Sprint 13) ✅. Originally `options.node_to_frame` on `render()`; moved to a `commit_step_frames(id, node_to_frame?)` parameter in v0.26 Sprint 45 when the one-shot `render(type="step-frames")` path it depended on was removed.
- **Render snapshot persistence** (`server/snapshot.ts`) — Sprint 16 (see F10 in `03`) ✅
- **History navigator** (`GET /snapshots`, `POST /snapshots/load`, `client/src/HistoryPanel.svelte`) — Sprint 17 (see F11–F12, U7 in `03`)
- Multi-panel / named tabs
- Binary export (PNG/SVG/PDF)
- `options.theme` and action-variant options for `render()`
- Multi-user session management *(Phase 3)*
- Remote deployment / auth *(Phase 3)*

---

## 3. MCP Tool Implementations

> **Broadcast construction (v0.23):** every "pushes ... to browser via WebSocket" action described in this table is implemented as a call to the single `broadcastReplace()` builder in `server/ws.ts` (or its `broadcastStepFrames()` convenience wrapper for the frames-array + index shape used by `step`, `append_frame`'s live preview, and `commit_step_frames`). There is no per-tool broadcast-construction code left — see §2's "Unified broadcast projector" note and §9.2 (U5).

| Tool                              | Server-side action                                                                                                                                                                                                                  |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `render(type, payload[, options])`| Validates payload for the given type via `validateFrame()`; pushes render command to browser via WebSocket; stores as current canvas state. `options.title` (optional string, MVP) displays a label above the canvas. `options.theme` and action variants are Phase 2. **Single-frame only (v0.26 Sprint 45):** `type` is one of the five `FRAME_TYPES` — `type: "step-frames"` no longer exists; a multi-frame Presentation is created exclusively via `init_step_frames`/`append_frame`/`commit_step_frames` below. **v0.11 ✅:** returns `{ ok: true, id: "<uuid>" }` — the UUID of the snapshot written for this call. `id` is omitted if the snapshot write fails (non-fatal). |
| `clear()`                         | Resets in-memory canvas state and step cursor; sends clear command to browser                                                                                                                                                       |
| `export([id])`                    | Without `id`: returns the last submitted source payload verbatim as a string (current behavior). With optional `id` (UUID, v0.11 ✅): scans all workspace snapshot files for a record whose `id` field matches and returns its payload. Empty string if canvas is empty or cleared (no-id case). Error `{ ok: false, error: "graph not found" }` if id provided but no matching snapshot found. Old snapshots without an `id` field are not addressable. See F16 (`03`). Implemented in `server/snapshot-reader.ts` (`findSnapshotById`). |
| `step(direction)`                 | Advances (`"next"`) or rewinds (`"prev"`) the step cursor for a loaded `step-frames` sequence. Broadcasts the target frame using its effective type (`frame.type ?? frameType`, v0.17). Returns `{ ok: true, current_frame: N, total_frames: M }`. No-op (returns error) if no step-frames sequence is loaded. (MVP — Sprint 7 ✅) |
| `seek(frame)` *(Sprint 13)*       | Jumps the step-frame cursor to an arbitrary frame index. Broadcasts the target frame using its effective type (`frame.type ?? frameType`, v0.17). Useful for random-access navigation without repeated `step()` calls. Returns `{ ok: true, current_frame: N, total_frames: M }`. Error if no `step-frames` sequence is loaded or frame is out of range. (Phase 2 — Sprint 13) |
| `wait_done()`                     | Calls `waitForDone()` from `server/interaction.ts` — suspends until `signalDone()` fires (user clicks Done) or the 10-minute timeout elapses. Returns `{ ok: true }`. All concurrent `wait_done()` calls resolve simultaneously on a single click (broadcast-mode `Interaction`, see §9.2 U7). **Arming also supersedes a pending `wait_click()` (v0.26 Sprint 47, OQ11)** — see below. (Phase 2 — Sprint 10 ✅; rebuilt on the `Interaction` primitive v0.26 Sprint 46) |
| `wait_click()` *(Sprint 12 ✅)*   | Arms the browser click listener; suspends until `signalClick(event)` fires (user clicks a node/edge) or the 10-minute timeout elapses. No `node_actions` in Sprint 12 — any click is accepted, no popup. Only one `wait_click()` active at a time; a second `wait_click()` call, or an arming `wait_done()` call, supersedes it. Returns `{ ok: true, type: "node"\|"edge", id, label, action: null }` on click (`action` is always present; null in Sprint 12 because no popup menu exists yet); `{ ok: true, type: "timeout" }` on plain 10-minute inactivity; `{ ok: true, type: "superseded" }` when cancelled by a new arm (v0.26 Sprint 47, distinct from a genuine timeout — was also `"timeout"` through v0.25). (Phase 2 — Sprint 12 ✅; supersession v0.26 Sprint 47) |
| `wait_click(node_actions)` *(Sprint 14)*  | Extends Sprint 12 with optional `node_actions`: map of node ID → string[] — pushed to browser via WebSocket `set_node_actions` before suspending. Nodes with registered actions show a popup menu on click; user selects one. Returns `{ ok: true, type, id, label, action }` — `action` is **always present**: null when no popup was shown or when user clicked without selecting a menu item; string value when a menu item was selected. (Phase 2 — Sprint 14) |
| `init_step_frames(frame_type, workspace, title?)` *(v0.8)* | Creates a new entry in the in-memory step-frames builder map (`server/step-frames-builder.ts`) keyed by a UUID. Validates `workspace` (same rules as `render()`) and `frame_type`. Pushes a 0-frame placeholder to the browser via WebSocket. Returns `{ ok: true, id }`. Sets an inactivity TTL timer (30 min). |
| `append_frame(id, payload, label?, type?)` *(v0.8; live preview v0.9; per-frame `type` v0.17)* | Looks up the builder entry by ID. Validates `payload` against `type ?? frame_type` (same `validateFrame()` hard gate as `render()`). Appends `{ label?, payload, type? }` to the frame list. Resets the TTL timer. **Pushes the full accumulated partial step-frames sequence to the browser via WebSocket** (`cursor` set to N-1 so the browser shows the latest frame, using that frame's effective type). In-memory canvas state is NOT updated — only `commit_step_frames()` does that. Returns `{ ok: true, frame_count: N }`. Invalid payloads are rejected before any broadcast; prior frames and browser state are preserved. |
| `commit_step_frames(id, node_to_frame?)` *(v0.8; finalization-only v0.9; `node_to_frame` param v0.26)* | Assembles the full step-frames JSON from the builder entry. Cancels any running slideshow (same as `render()`). Updates in-memory canvas state and calls `saveSnapshot()`. Pushes a final WebSocket broadcast (for consistency and to handle edge cases such as `clear()` between appends). Deletes the builder entry. `node_to_frame` (optional, v0.26 Sprint 45): node ID → frame index map, stored on the canvas state and *intended* to be included in every broadcast for this sequence — the sole entry point for U4e's autonomous click navigation now that `render()` no longer accepts `options.node_to_frame`. **Known gap, unfixed (bug B18 in `01`, found 2026-07-09):** the final live broadcast this call pushes goes through `broadcastStepFrames()` (`server/ws.ts`), whose signature has no `nodeToFrame` parameter — the map computed and persisted earlier in `commitStepFramesResult()` (`server/render-core.ts`) never reaches `broadcastReplace()` for this call path, so the browser never enables click listeners on a live commit. History-reload (`POST /snapshots/load`) calls `broadcastReplace()` directly with the map and is unaffected — see `02` C2e for why this is a recurrence of the same drift class as C2d/B15, not a new architectural question. **v0.11 ✅:** returns `{ ok: true, id: "<uuid>" }` — the UUID of the snapshot written for this call (omitted if write fails). After commit, `export()` returns the assembled full step-frames JSON. `clear()` during an active session does NOT cancel the builder entry — TTL handles cleanup. |
| `list_snapshots(workspace)` *(v0.15)* | Validates `workspace` (same safety check as `render()`). Calls `listSnapshots(workspace, dir)` in `server/snapshot-reader.ts` (the same function `GET /snapshots` uses). Returns `{ ok: true, snapshots: [{ id, timestamp, type, title? }] }`, newest-first. Empty array if the workspace has no snapshots. |
| `export_html(workspace, ids, output_path?)` *(v0.15)* | Validates `workspace` (same safety check as `render()`) and that `ids` is a non-empty array. Builds `items = ids.map(id => ({ workspace, id }))` and calls the same `generateExportHtml()` pipeline as `POST /export-html` (`server/export-html.ts`), extended to resolve `{ workspace, id }` items via a new `findSnapshotByIdInWorkspace(workspace, id, dir)` lookup (scoped variant of `findSnapshotById`, restricted to one workspace directory). Unresolvable ids are skipped; if none resolve, returns `{ ok: false, error: "no valid items to export" }`. On success, writes the assembled HTML to `output_path` (creating parent directories as needed) or, if omitted, to `<WHITEBOARD_SNAPSHOTS_DIR>/<workspace>/exports/<name>-YYYYMMDD-HHmmss.html` (reusing `buildDownloadFilename()`). Returns `{ ok: true, path: "<absolute path>" }`, or `{ ok: false, error: "..." }` on a write failure. |

**Resolved (v0.17, was B5, found 2026-07-03):** `StepFrame` (`session.ts`) gained an optional `type?: string` field. Every frame is now validated against its effective type (`frame.type ?? frame_type`) — `validatePayload()`'s `step-frames` branch (`validate.ts`) loops over `spec.frames` and validates each one, so `render(type="step-frames")`, `append_frame()`, `POST /slideshow`, and `POST /snapshots/load` (all of which route step-frames validation through `validatePayload()`) reject a malformed frame anywhere in the sequence before anything is accepted (closes F3a-gap in `03`). Every broadcast site that pushes a step-frame to the browser — `ws.ts`'s `broadcastStepFrames()`, `app.ts`'s `POST /render`/`POST /step`/`POST /seek`/`POST /snapshots/load`, `mcp.ts`'s `render`/`step`/`seek` tool handlers, and `slideshow.ts`'s tick/slide expansion — sends `frame.type ?? frameType` instead of the sequence-level type. `ws.ts` already sent a `type` field per broadcast, so the browser client needed no changes — it already re-selects a renderer per WebSocket message with zero cross-frame assumptions. A step-frames sequence can now mix content types (e.g. a mermaid frame followed by a katex frame) across both creation paths, and the incremental builder (`append_frame(id, payload, label?, type?)`) is a strict superset of the one-shot path. **Superseded (v0.26 Sprint 45):** the "both creation paths" comparison above is historical — the one-shot `render(type="step-frames", ...)` path this section compared against is removed; `validatePayload()` is removed too (it degenerated to a pure passthrough to `validateFrame()` once the step-frames envelope branch was the only thing distinguishing it), and every call site above now calls `validateFrame()` directly. `slideshow.ts`'s tick/slide expansion is also removed — see F7 in `03`.

### Validation — two layers

**Layer 1 — MCP tool definition** (agent-facing, in `mcp.ts`)
The tool's JSON Schema and description are read by the agent when it loads the MCP server. Rich schemas and inline examples are the primary defence against hallucinated payloads.

| Type      | Schema hint exposed to agent                                                                                                                         |
|-----------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mermaid` | `string` — must begin with a valid diagram keyword (`graph`, `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `mindmap`) |

Additional types exposed in v1 (Sprint 5 ✅): `vega-lite`, `katex`, `svg`, `html`. These five `FRAME_TYPES` are the complete set `render()` accepts — a step-through sequence is built via `init_step_frames`/`append_frame`/`commit_step_frames` (Sprint 7 ✅; sole creation path v0.26 Sprint 45), not a sixth `render()` type.
Post-Phase-2 (deferred): `d2` — requires a server-side render process, not client-side.

**Layer 2 — Server-side validation** (safety net, in `session.ts` or `mcp.ts`)
Lightweight checks after the agent call arrives. On failure, returns a structured error the agent can act on:

```json
{ "ok": false, "error": "invalid payload: mermaid source must begin with a diagram keyword (e.g. 'graph TD')" }
```

On success:

```json
{ "ok": true }
```

**Validation is a hard gate:** on failure, nothing is pushed to the browser and the error is returned to the agent only. The browser state is unchanged.

### MCP tool response shapes

| Tool     | Success                                                                                                                                 | Failure                           |
|----------|-----------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------|
| `render` | `{ "ok": true, "id": "<uuid>" }` — UUID of the snapshot written; `id` omitted if snapshot write failed (v0.11 ✅). | `{ "ok": false, "error": "..." }` |
| `clear`  | `{ "ok": true }`                                                                                                                        | — (always succeeds)               |
| `export` | Without `id`: `{ "ok": true, "data": "<source>" }` — verbatim last `render()` payload; empty string if canvas is blank. With `id`: `{ "ok": true, "data": "<source>" }` — payload of the matching snapshot (v0.11 ✅). | Without `id`: always succeeds. With `id`: `{ "ok": false, "error": "graph not found" }` if no snapshot matches. |
| `step`       | `{ "ok": true, "current_frame": N, "total_frames": M }`                                                                              | `{ "ok": false, "error": "..." }` |
| `seek`       | `{ "ok": true, "current_frame": N, "total_frames": M }`                                                                              | `{ "ok": false, "error": "..." }` |
| `wait_click` | `{ "ok": true, "type": "node"\|"edge", "id": "<id>", "label": "<label>", "action": "<string or null>" }` — `action` field always present; null when no menu shown or click was plain; string value when menu item was selected. On timeout: `{ "ok": true, "type": "timeout" }`. On supersession by a new `wait_click()`/`wait_done()` arm (v0.26 Sprint 47): `{ "ok": true, "type": "superseded" }`. | — |
| `init_step_frames` | `{ "ok": true, "id": "<uuid>" }` | `{ "ok": false, "error": "..." }` — unsupported `frame_type` or missing/invalid `workspace` |
| `append_frame` | `{ "ok": true, "frame_count": N }` | `{ "ok": false, "error": "..." }` — unknown/expired ID or invalid payload |
| `commit_step_frames` | `{ "ok": true, "id": "<uuid>" }` — UUID of the snapshot written; `id` omitted if snapshot write failed (v0.11 ✅). | `{ "ok": false, "error": "..." }` — unknown/expired ID or zero frames |
| `list_snapshots` | `{ "ok": true, "snapshots": [...] }` (empty array if none) | `{ "ok": false, "error": "..." }` — missing/invalid `workspace` |
| `export_html` | `{ "ok": true, "path": "<absolute path>" }` | `{ "ok": false, "error": "..." }` — missing/invalid `workspace`, empty `ids`, no ids resolvable, or disk write failure |

**Browser-side render errors:** if the payload passes server validation but the renderer fails (e.g. Mermaid.js throws), the browser displays the error message inline on the canvas in place of the diagram.

### REST fallback response shapes

The REST fallback endpoints (`POST /render`, `POST /clear`, `GET /export`) return the same JSON shapes as the MCP tool responses above. `GET /export` returns the JSON body `{ "ok": true, "data": "<source>" }` — verbatim last `render()` payload for any type (not raw text). **v0.11 ✅:** `GET /export?id=<uuid>` returns the payload of the snapshot with that UUID; 404 `{ "ok": false, "error": "graph not found" }` if no match. `POST /render` and `POST /step-frames/:id/commit` both return `{ "ok": true, "id": "<uuid>" }` on success (id omitted if snapshot write fails).

`POST /step` was added in Sprint 7 (MVP ✅). Body: `{ "direction": "next" | "prev" }`. Returns the same shape as the MCP `step()` response.

`POST /user-done` was added in Sprint 10 (Phase 2 ✅). No body required. Calls `signalDone()` to wake all pending `wait_done()` calls; also forwards to channel relay. Returns `{ ok: true }`.

`POST /wait-done` was added in Sprint 10 (Phase 2 ✅). No body. Long-polls until `signalDone()` fires or the 10-minute timeout elapses. Returns `{ ok: true }`.

`POST /node-click` — Phase 2 (Sprint 12). Body: `{ "type": "node"|"edge", "id": "<id>", "label": "<label>", "action": "<chosen>" }`. Calls `signalClick(event)` (`interaction.ts`) to resolve any pending `waitForClick()`. Returns `{ "ok": true }`. No-op if no `wait_click()` is pending.

`POST /wait-click` accepts an optional `node_actions` body (`Record<string, string[]>`). If provided, the server validates it and broadcasts it to the browser via `set_node_actions` — popup menus appear for registered nodes exactly as they do via the MCP `wait_click(node_actions)` tool. Invalid `node_actions` returns `{ ok: false, error: "..." }` with 400. Omitting the body (or sending an empty body) arms a plain-click listener with no popup.

`POST /seek` — Phase 2 (Sprint 13). Body: `{ "frame": N }`. Calls `seekStepFrame(N)`, broadcasts the target frame to the browser. Returns the same shape as the MCP `seek()` response: `{ "ok": true, "current_frame": N, "total_frames": M }`. Error if no step-frames sequence is loaded or frame is out of range.

`POST /slideshow` failure behavior: If validation fails for any slide in the playlist, the server returns `{ ok: false, error: "..." }`. No timer is started, and the canvas state is unchanged (remains as the last successful `render()` or `clear()`). If a slideshow is already running and a new `POST /slideshow` request fails, the running slideshow continues unaffected (error returned, new request rejected).

`GET /snapshots` — v0.4 (Sprint 17); extended v0.15 (Sprint 28). No body. Optional `?workspace=<name>` query param (v0.15, validated with the same safety check as `POST /snapshots/load`); if omitted, reads `<WHITEBOARD_SNAPSHOTS_DIR>/<lastWorkspace>/` (where `lastWorkspace` is the workspace from the most recent successful `render()` call in the session; see G2c) — this is the browser's existing call pattern, unchanged. Returns `{ ok: true, snapshots: [{ id, filename, timestamp, type, title? }] }` sorted newest-first (`id` field added v0.15 — purely additive, the browser ignores it). Empty array if directory absent or no `render()` has been called yet. Unreadable/malformed files silently skipped (warning to stderr). The `list_snapshots(workspace)` MCP tool calls this endpoint's underlying `listSnapshots()` function directly with an explicit, mandatory `workspace`.

`GET /snapshots/all` — v0.5 (Sprint 18). No body. Scans all subdirectories of `WHITEBOARD_SNAPSHOTS_DIR`, reads each workspace's `*_screen.json` files, and returns them grouped. Response: `{ ok: true, workspaces: [{ name, isCurrent, snapshots: [{ filename, timestamp, type, title? }] }] }`. Each workspace's list sorted newest-first. `isCurrent: true` for the workspace matching `lastWorkspace` (in-memory, updated on every successful `render()`; see G2c). Workspaces with no readable snapshots omitted. Returns `{ ok: true, workspaces: [] }` if root absent.

`POST /snapshots/load` — v0.4 (Sprint 17), extended in v0.5 (Sprint 18). Body: `{ "filename": "…" }` (current workspace) or `{ "filename": "…", "workspace": "…" }` (explicit workspace). Filename safety: must match `*_screen.json`, no `/` or `..`. Workspace safety (when provided): plain directory name only — no path separators, no `..`, no null bytes; must exist under `WHITEBOARD_SNAPSHOTS_DIR`. Reads the snapshot, validates its payload (same hard gate as `POST /render`), broadcasts to browser via WebSocket, updates in-memory canvas state. **Write-silent:** does NOT call `saveSnapshot()`. Returns `{ ok: true }` or `{ ok: false, error: "…" }` (file not found, path-safety failure, or invalid payload).

`POST /snapshots/delete-files` — v0.12. Body: `{ "workspace": "…", "filenames": ["…", …] }`. Workspace and filename safety checks same as `POST /snapshots/load`. Deletes matching files from disk; missing files silently skipped. Returns `{ ok: true, deleted: N }` (N = count of files actually removed). Handles single delete and multi-select delete with the same endpoint.

`POST /snapshots/delete-workspace` — v0.12. Body: `{ "workspace": "…" }`. Workspace safety check. Removes the entire workspace directory and all its contents (`rmdirSync` recursive). If the deleted workspace matches `lastWorkspace`, resets `lastWorkspace` to `""`. Returns `{ ok: true }`. Non-existent workspace returns `{ ok: false, error: "workspace not found" }`.

`POST /export-html` — v0.13; extended v0.15 (Sprint 28). Body: `{ "items": [{ "workspace": "…", "filename": "…" }, ...] }` (browser) — each item may instead be `{ "workspace": "…", "id": "…" }` (v0.15, agent) — both forms may appear in the same request. Workspace and filename safety checks same as `POST /snapshots/load`; `id` items are resolved by scanning the workspace directory for a matching `id` field (scoped variant of `findSnapshotById`). Renders each valid snapshot server-side (Mermaid → embedded client-side, see F17 fix v0.14; KaTeX via `katex.renderToString()`; Vega-Lite via `vega.View().toSVG()`; SVG/HTML via DOMPurify + `happy-dom`; step-frames expanded per frame). Unreadable, malformed, or unresolvable (`id` not found) items are silently skipped. Assembles a single self-contained HTML file (no external references, all CSS inline). Returns `Content-Type: text/html; charset=utf-8` with `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHmmss.html"` on success; `{ ok: false, error: "no valid items to export" }` (400) if no valid items remain after skipping. Implemented in `server/export-html.ts`. The `export_html(workspace, ids, output_path?)` MCP tool builds `{ workspace, id }` items from `ids` and calls this same endpoint's underlying `generateExportHtml()`, then writes the response body to disk itself instead of returning it inline (see `02` L6).

---

## 4. Data Flows

### Render Command

```
agent calls render(type="mermaid", payload="graph TD; A-->B")
  → MCP server validates payload
  → stores as current canvas state (in-memory)
  → pushes JSON command over WebSocket to browser:
      { action: "replace", type: "mermaid", payload: "graph TD; A-->B" }
      (action is always "replace" in v1 — hardcoded server-side; Phase 2 adds "append" etc.)
  → browser receives, hands off to Mermaid.js renderer
  → diagram appears in browser tab
  → MCP tool returns { ok: true }
```

### Render Snapshot (Phase 2 — Sprint 16; workspace mandatory from v0.7)

```
agent calls render(type="mermaid", payload="graph TD; A-->B", options={workspace:"my-course", title:"..."})
  → MCP server validates options.workspace is present and passes safety check
  → IF workspace missing or invalid: returns { ok: false, error: "..." } — nothing written or pushed
  → MCP server validates payload  (hard gate — see §3)
  → IF payload validation passes:
      → stores as current canvas state (in-memory)
      → pushes render command over WebSocket to browser
      → persistContent() takes the caller-supplied frames[] (and rawPayload for a
        multi-frame sequence — collapsed to undefined when frames.length <= 1,
        same policy as the WS contract) and calls saveSnapshot() — v0.26 Sprint 45
        removed the type/payload-to-frames[] conversion step (toFrames()) that
        used to live in persist.ts; callers (render-core.ts, slideshow.ts) already
        hold resolved Frame[] internally and pass them straight through
      → calls saveSnapshot(frames, options, rawPayload?, id?)  [snapshot.ts]
          → workspace: options.workspace (always present; no env var fallback)
          → resolves dir: WHITEBOARD_SNAPSHOTS_DIR env || ~/.agent-whiteboard/
          → path: <dir>/<workspace>/<yyyyMMdd_HHmmss>_<id>_screen.json
          → creates directory if absent (mkdirSync recursive)
          → writes JSON: { id, timestamp, workspace, cursor: 0, frames, title?, nodeToFrame?, rawPayload? }
          → if write fails: logs warning to stderr, does NOT propagate error
  → IF payload validation fails: returns { ok: false, error: "..." } — no snapshot written
```

**Unified `frames[]` snapshot schema (v0.26 Sprint 43):** replaces the old top-level `type`/`payload`/`options` triple. See `SnapshotFile` in `server/snapshot.ts` and F10 in `03_requirements.md` for the full field list. Every reader (`snapshot-reader.ts`, `POST /snapshots/load`, `export-html.ts`) understands only this shape — a one-time migration script (`server/migrate-snapshots.ts`) upgrades pre-Sprint-43 files; there is no dual-read path for the old shape (OQ5a in `02`).

Snapshot directory layout:
```
~/.agent-whiteboard/
└── my-course/                 ← workspace (from options.workspace, always agent-supplied — see F14/G2)
    ├── 20260609_143000_<id>_screen.json
    ├── 20260609_143215_<id>_screen.json
    └── …
```

### Clear Command

```
agent calls clear()
  → MCP server resets in-memory canvas state
  → pushes JSON command over WebSocket to browser:
      { action: "clear" }
  → browser clears the canvas (blank state)
  → MCP tool returns { ok: true }
```

### Export Command

```
agent calls export()
  → MCP server reads current in-memory canvas state
  → if canvas is empty (never rendered, or cleared):
      MCP tool returns { ok: true, data: "" }
  → otherwise:
      MCP tool returns { ok: true, data: "<source>" }  (verbatim last render() payload, any type)
  (no WebSocket push — export is a read-only query; browser state is unchanged)
```

### Done Signal

```
agent calls wait_done()
  → server sets doneArmed = true  (in-memory flag in interaction.ts)
  → server pushes { action: "set_done_armed", armed: true } to browser via WebSocket
  → browser shows Done button

user clicks Done button in browser
  → browser fires POST /user-done to Hono server
  → server calls signalDone()  (broadcast-mode Interaction in interaction.ts)
  → all pending waitForDone() promises resolve
  → any suspended wait_done() MCP tool calls return { ok: true } to agent
  → server sets doneArmed = false
  → server pushes { action: "set_done_armed", armed: false } to browser via WebSocket
  → browser hides Done button
  → server also forwards to channel relay on port 3001 (if running)
  → browser button shows "Sent ✓" for 2s before hiding

On WebSocket connect (new connection or page reload):
  → server immediately pushes { action: "set_done_armed", armed: <current doneArmed> }
  → browser initialises Done button visibility correctly (see H8)

Timeout (10 minutes with no click):
  → waitForDone() resolves with { ok: true }
  → server sets doneArmed = false and pushes armed: false to browser
```

### Slideshow Command (Phase 2 — Sprint 9; step-frames-slide expansion removed v0.26 Sprint 45)

```
agent calls slideshow(slides=[...], delay_ms=1000, workspace="course_2")
  → MCP server validates workspace (v0.22, same rule as render()) and each slide (same rules as render)
  → startSlideshow() cancels any previous session (finalizing it — see below), begins server-side timer
  → each tick broadcasts one slide to browser (a slide is always exactly one frame — v0.26):
        { action: "replace", type: slide_type, payload: slide_payload, id, cursor: 0, total: 1, title?: slide_title }
  → browser renders each slide in sequence
  → after last slide, slideshow stops (no loop in v1) and finalizes (persists) the session — see below
  → MCP tool returns { ok: true }
```

(Historical, through v0.25: a `type: "step-frames"` slide expanded into one timer tick per frame — `frame N: { action: "replace", type: frames[N].type ?? frame_type, payload: frames[N].payload, id, cursor: N, total: M, title?: frames[N].label }`, each frame broadcast at `delay_ms` intervals, same `id` shared across all frames of one sequence. Removed v0.26 Sprint 45 along with `type: "step-frames"` as a top-level content type — no back-compat shim, per `02` N4. A step-frames sequence built via `commit_step_frames()` can still be manually navigated with `step()`/`seek()` during or after a slideshow; it just can no longer be auto-advanced as a slideshow tick.)

**`id` parity fixed v0.22 (bug B15, see `01`/`02` C2d):** every tick above now carries a freshly-generated `id` — `generateSnapshotId()` is called directly in `slideshow.ts`, not through `commitRenderResult()`, since slideshow ticks are still not persisted to disk per-tick (see finalize-on-end below).

**Finalize-on-end persistence + required `workspace` (v0.22, FR20 in `01`):** `slideshow()`/`POST /slideshow` previously had no `workspace` parameter at all — it's now required, validated the same way as `render()` (F14). Individual ticks are never written to disk; `slideshow.ts` tracks the session's workspace in module state and, when the session ends — the timer runs out naturally, `slideshow_stop()`/`cancelSlideshow()` is called explicitly, or a new `render()`/`slideshow()` call supersedes it — a `finalizeSlideshow()` helper reads the current in-memory canvas state (`getCanvas()`) and calls `saveSnapshot()` exactly once, reusing the `id` already broadcast live. `clear()` is the one call site that skips this: `cancelSlideshow({ persist: false })`, preserving F10's "clear() never produces a snapshot" guarantee. This mirrors `commit_step_frames()`'s "transient until finalized" pattern (F15) rather than persisting once per slide.

### History Load (v0.4 — Sprint 17; extended v0.5 — Sprint 18)

```
[v0.4] user opens history panel in browser
  → browser fetches GET /snapshots
  → server reads <WHITEBOARD_SNAPSHOTS_DIR>/<workspace>/ directory
  → returns list sorted newest-first
  → browser renders flat list in HistoryPanel

[v0.5] user opens history panel in browser
  → browser fetches GET /snapshots/all
  → server calls listAllSnapshots()  [snapshot-reader.ts]
      → scans all subdirectories under WHITEBOARD_SNAPSHOTS_DIR
      → for each workspace dir: reads *_screen.json files, returns { name, isCurrent, snapshots }
      → workspaces with no readable snapshots are omitted
  → browser renders accordion in HistoryPanel:
      → current workspace section auto-expanded
      → all other workspace sections collapsed

user clicks a snapshot entry (any workspace)
  → browser fires POST /snapshots/load: { workspace: "…", filename: "20260609_143000_screen.json" }
  → server validates workspace name (safe-name pattern, exists under snapshots root)
  → server validates filename (no path traversal)
  → server reads snapshot from disk at <root>/<workspace>/<filename>
  → server validates payload (same hard gate as POST /render)
  → IF valid:
      → server updates in-memory canvas state
      → server broadcasts render command to browser via WebSocket (same format as render())
      → does NOT call saveSnapshot()
      → updates lastWorkspace to the loaded snapshot's workspace (v0.10, see H6)
      → returns { ok: true }
  → IF invalid:
      → returns { ok: false, error: "..." }
  → browser: if panel is unlocked (default), closes panel; if locked, stays open (v0.10)
  → canvas displays loaded snapshot
```

**Interaction with pending wait_click() / wait_done():** loading a history entry replaces the canvas but does NOT cancel any pending tool calls. Both continue waiting until their 10-minute timeout elapses or the user signals them through normal channels (Done button / node click). See assumption H2.

**Slideshow cancellation:** `POST /render`, `POST /clear`, or a new `POST /slideshow` call cancels any running slideshow. `POST /slideshow/stop` also cancels. `POST /step` and `POST /seek` do not cancel.

### Incremental Step-Frames Creation (v0.8; sole creation path v0.26 Sprint 45)

```
agent calls init_step_frames(frame_type="mermaid", workspace="my-course", title="TCP Handshake")
  → server validates workspace and frame_type
  → creates entry in step-frames-builder map: { id: uuid, frame_type, workspace, title, frames: [] }
  → starts 30-min inactivity TTL timer for this id
  → pushes 0-frame placeholder to browser via WebSocket:
      { action: "replace", type: "step-frames-placeholder", title: "TCP Handshake", frameCount: 0 }
  → returns { ok: true, id: "<uuid>" }

agent calls append_frame(id="<uuid>", payload="graph TD; A-->B", label="Step 1")
  → server looks up id in builder map
  → validates payload against frame_type (same hard gate as render())
  → IF valid: appends { label: "Step 1", payload: "graph TD; A-->B" } to frames[]
  → resets TTL timer
  → pushes partial step-frames to browser via WebSocket (v0.9 live preview):
      { action: "replace", type: "mermaid", payload: "graph TD; A-->B",
        frameLabel: "Step 1", id, cursor: 0, total: 1, title?: <builder title> }
      (only the latest frame's resolved type/payload is sent, not the full
      frames[] array — the browser always displays exactly one frame at a
      time; cursor/total replace the old stepFrames/currentFrame/totalFrames
      fields — v0.26 Sprint 42)
  → in-memory canvas state is NOT updated yet
  → returns { ok: true, frame_count: 1 }

... agent repeats for each frame; browser updates after every append ...

agent calls commit_step_frames(id="<uuid>", node_to_frame={"A": 0}?)
  → server assembles full step-frames JSON:
      { frame_type: "mermaid", frames: [{ label, payload }, ...] }
  → cancels any running slideshow (same as render())
  → updates in-memory canvas state, including node_to_frame if provided (so export() returns the assembled JSON)
  → resolves each frame's effective type, calls saveSnapshot(frames, {workspace, title, node_to_frame}, rawPayload, id)
  → pushes final WebSocket broadcast (handles edge case where clear() was called between appends)
  → deletes builder entry for this id
  → returns { ok: true }
  (after commit, export() returns the assembled full step-frames JSON)

TTL expiry (background):
  → 30 minutes after last append_frame() or init_step_frames() with no commit
  → builder entry is silently deleted from the map
  → any subsequent append_frame/commit_step_frames with that id returns:
      { ok: false, error: "step-frames session not found or expired" }

Interaction with clear():
  → clear() does NOT cancel in-progress builder entries
  → the canvas is blanked but the builder entry remains alive
  → the agent may continue appending and then commit
  → the committed diagram replaces the blank canvas
```

**REST fallback endpoints (v0.8; live preview v0.9):**
- `POST /step-frames/init` — body: `{ frame_type, workspace, title? }` → `{ ok: true, id }`
- `POST /step-frames/:id/frame` — body: `{ payload, label?, type? }` → `{ ok: true, frame_count: N }`. v0.9: also pushes partial step-frames to browser after each valid append (same as MCP `append_frame()`). v0.17: optional `type` overrides the sequence's `frame_type` for this one frame.
- `POST /step-frames/:id/commit` — body: `{ node_to_frame? }` (optional) → `{ ok: true }`. v0.9: finalization only (snapshot, in-memory state, slideshow cancel, builder cleanup); final broadcast still sent for consistency. v0.26 Sprint 45: `node_to_frame` param — see U4e in `03`.

### HTML Export (v0.13)

```
[path A — "Export selected"]
user enters export mode (clicks export icon in header) → checkboxes appear on all rows
user checks ≥1 items → clicks "Export selected" in select-bar
  → browser POSTs to /export-html: { items: [{ workspace, filename }, …] }

[path B — "Export workspace"]
user enters export mode → clicks "Export workspace" on a workspace accordion header
  → browser collects all { workspace, filename } pairs for that workspace
  → browser POSTs to /export-html: { items: [{ workspace, filename }, …] }

  → server/export-html.ts receives request
  → for each item:
      → validate workspace (safe-name) and filename (no traversal)
      → read snapshot JSON from <WHITEBOARD_SNAPSHOTS_DIR>/<workspace>/<filename>
      → IF unreadable or malformed: skip silently; continue
  → IF no valid items remain: return { ok: false, error: "no valid items to export" } (400)
  → create one happy-dom Window instance for this export call (used by katex/vega-lite/svg/html paths only — see below)
  → for each valid snapshot item:
      → dispatch to renderer by type:
          "mermaid"    → (v0.14, shipped): NOT rendered server-side. Raw Mermaid source is written
                         into a container <pre class="mermaid">…</pre> in the output; actual
                         rendering happens later, client-side, when the exported file is opened
                         (see below). [Superseded (v0.13) behavior: mermaid.render() using happy-dom
                         Window globals → SVG string — produced invisible labels / wrong viewBox /
                         thrown errors because happy-dom has no real text-layout engine; bug B4,
                         see `01`/`02` L1 — fixed by this v0.14 change]
          "katex"      → katex.renderToString(payload, { displayMode: true, throwOnError: false }) → HTML string
          "vega-lite"  → vl.compile(spec).spec → vega.parse() → new vega.View().toSVG() → SVG string
          "svg"        → DOMPurify(window).sanitize(payload, { USE_PROFILES: { svg: true } })
          "html"       → DOMPurify(window).sanitize(payload, { USE_PROFILES: { html: true } })
          "step-frames"→ expand each frame → render each frame by frame_type (recursive; mermaid frames
                         become their own client-rendered containers, same as above)
      → IF render fails (non-mermaid types, or malformed step-frames JSON): replace content with
        inline <p class="export-error">error message</p>
  → tear down happy-dom Window
  → assemble HTML document:
      → <nav>: table of contents — workspace list → item list (linking to section anchors)
      → <main>: workspace <section id="ws-{name}"> → item <section id="item-{id}">
          → for step-frames: frame sub-sections <section class="frame" id="item-{id}-frame-{n}">
      → <style>: layout CSS always included; KaTeX CSS included only when ≥1 katex items present
      → IF ≥1 mermaid items present (plain or step-frames frame_type): embed the full mermaid.js
        library source inline as a <script> block, plus a small bootstrap <script> that calls
        mermaid.initialize({ startOnLoad: false }) and mermaid.run() against every
        <pre class="mermaid"> container once the DOM is loaded — this executes in whatever real
        browser opens the exported file, giving Mermaid the actual text-layout APIs it needs
      → ordering: items within workspace sorted chronologically (oldest first by timestamp);
                  workspaces ordered by their earliest item's timestamp
  → determine download filename:
      → single workspace: sanitize name (non-[a-zA-Z0-9_.-] → "-", truncate to 24 chars) + "-" + timestamp
      → multiple workspaces: "export-" + timestamp
  → return response: Content-Type: text/html; charset=utf-8
                      Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHmmss.html"
  → browser receives response → triggers download via <a download> element
  → user opens the downloaded file → browser executes the embedded mermaid.js bundle →
    diagrams render with correct labels and viewBox, exactly as the live whiteboard does
    (v0.14, shipped — see bug B4)
```

### Agent-Facing HTML Export (v0.15)

```
agent calls list_snapshots(workspace="my-course")
  → server validates workspace (same safety check as render())
  → calls listSnapshots(workspace, dir)  [snapshot-reader.ts — same function GET /snapshots uses]
  → returns { ok: true, snapshots: [{ id, timestamp, type, title? }, ...] }  (newest-first)

agent calls export_html(workspace="my-course", ids=["<uuid-1>", "<uuid-2>"], output_path?="/abs/path/out.html")
  → server validates workspace and that ids is a non-empty array
  → builds items = ids.map(id => ({ workspace, id }))
  → calls generateExportHtml(items)  [export-html.ts — same pipeline as POST /export-html]
      → each { workspace, id } item resolved via findSnapshotByIdInWorkspace(workspace, id, dir)
        (scoped variant of findSnapshotById, restricted to one workspace directory)
      → ids that don't resolve are skipped, same as unreadable files in the v0.13 flow
      → IF zero items resolve: returns { ok: false, error: "no valid items to export" }
  → on success, writes the assembled HTML string to disk instead of returning it in the response:
      → IF output_path provided: mkdir -p its parent directory, write there
        (no path restriction — see L6 in `02`; relative paths resolve against the
        server process's cwd, not the agent's)
      → ELSE: write to <WHITEBOARD_SNAPSHOTS_DIR>/<workspace>/exports/<name>-YYYYMMDD-HHmmss.html
        (same buildDownloadFilename() naming convention as the browser download)
  → returns { ok: true, path: "<absolute path>" }
```

**Relationship to the v0.13 browser flow:** both `list_snapshots`/`export_html` and the HistoryPanel's export mode ultimately call the same `generateExportHtml()` — the only difference is how items are addressed (`id` vs `filename`) and how the result is delivered (written to disk vs returned as an HTTP response body for browser download). See L5 (`02`) for why the two addressing schemes coexist rather than being unified in this milestone.

### Mermaid Viewport Persistence (v0.19; per-frame re-fit v0.26.1, bug B19/FR21 in `01`)

```
[Display — auto-fit or restore]
server broadcasts a snapshot/frame (fresh render()/commit_step_frames(), a step()/seek() tick
within a sequence, or POST /snapshots/load reload)
  → server looks up "<id>:<frameIndex>" in viewport-cache.json
  → IF entry found: include it in the WebSocket payload:
      { action: "replace", type: "mermaid", payload: "...", cursor: N, viewport: { scale, positionX, positionY } }
      → browser applies the stored viewport (no auto-fit)
  → IF no entry (this id+frame combination never seen before): omit the field
      → browser computes scale-to-contain + centers the diagram (auto-fit)
  (v0.26.1: step()/seek() broadcasts now ALWAYS look up their own cache entry and re-fit or
   restore per frame — reversing the pre-v0.26.1 behavior where the whole sequence shared one
   viewport computed at frame 0 only)

[User adjusts zoom/pan]
user scrolls/drags on the Mermaid canvas
  → browser updates its live transform immediately (unchanged from today)
  → browser starts/resets an 800ms debounce timer
  → after 800ms of no further zoom/pan input:
      → browser computes positionX/positionY as fractions of the container's width/height
      → browser POSTs /viewport: { id: "<current snapshot id>", frame: <current cursor>, scale, positionX, positionY }
      → server writes/overwrites the entry for "<id>:<frame>" in viewport-cache.json
      → returns { ok: true }

[Cleanup]
POST /snapshots/delete-files or POST /snapshots/delete-workspace succeeds
  → server removes every cache entry whose key starts with "<id>:" for each deleted id
    (was an exact-key removal pre-v0.26.1; now a prefix match since one id can own multiple
    per-frame entries)
```

Viewport-cache file layout (v0.26.1 — composite `id:frameIndex` key, replacing the bare `id` key):
```
<WHITEBOARD_SNAPSHOTS_DIR>/viewport-cache.json
{
  "<snapshot-id-1>:0": { "scale": 1.4, "positionX": 0.12, "positionY": -0.05 },
  "<snapshot-id-1>:1": { "scale": 1.1, "positionX": 0.0,  "positionY": 0.02  },
  "<snapshot-id-2>:0": { "scale": 0.8, "positionX": 0.0,  "positionY": 0.0  }
}
```
A one-shot render is always frame `0`. No migration needed for existing cache entries — the file is a cache, not a source of truth (F19); stale bare-`id` keys are simply never matched again and become inert (cleaned up naturally the next time their snapshot is deleted, same as any other orphaned entry per `02` C3's residual-risk note).
One global file (not per-workspace) — snapshot `id`s are already globally unique UUIDs (J1, `02`), so no workspace-scoping is needed to avoid collisions. Read/written directly (no debounce needed server-side; the browser already debounces before sending).

**Not addressed via MCP:** the agent has no tool for this — it's a pure browser⇄server UI concern (D2 in `02`: "the agent is stateless with respect to the whiteboard").

### Node Click Flow (Phase 2 — Sprint 12 plain click)

```
agent calls wait_click()
  → server pushes WebSocket command to browser:
      { action: "set_node_actions", node_actions: {}, enabled: true }
  → browser arms click listener on all Mermaid SVG node/edge elements
      (any click accepted; no popup)
  → server suspends via waitForClick()
  → user clicks a node
  → browser fires POST /node-click:
      { type: "node", id: "A", label: "Client" }
  → server calls signalClick(event)  (single-flight-mode Interaction in interaction.ts)
  → waitForClick() resolves
  → server pushes { action: "set_node_actions", enabled: false } to disarm browser
  → MCP wait_click() returns { ok: true, type: "node", id: "A", label: "Client" }

Agent then handles the result (examples):
  • drill-down: call render() with an expanded diagram
  • navigation: call step() or seek() to the target frame
  • explain: generate explanation in CLI
```

**Sprint 14 extension — `node_actions` popup menu:**
```
agent calls wait_click(node_actions={ "A": ["Explain", "Drill down"] })
  → server pushes { action: "set_node_actions", node_actions: { "A": [...] }, enabled: true }
  → user clicks node A → browser shows inline popup menu
  → user selects "Drill down" → browser fires POST /node-click:
      { type: "node", id: "A", label: "Client", action: "Drill down" }
  → MCP wait_click() returns { ok: true, type: "node", id: "A", label: "Client", action: "Drill down" }
  • clicking a node not in node_actions → plain click (no popup)
  • clicking outside popup dismisses it without firing
```

**Supersession (v0.26 Sprint 47, OQ11):**
```
agent calls wait_click()  — arms the return channel, suspends (call A)
agent calls wait_click() again before call A resolves  — arms again (call B)
  → call A is superseded: waitForClick() resolves it immediately with
    { type: "superseded", id: "", label: "", action: null }
  → MCP wait_click() (call A) returns { ok: true, type: "superseded" }
  → call B remains pending, armed exactly as call A was

agent calls wait_done() while a wait_click() is pending
  → waitForDone() calls clickInteraction.supersede() on arm — the pending
    wait_click() resolves with type: "superseded", same as above
  → wait_done()'s own return value is unaffected: { ok: true } once the user
    clicks Done (or after its own 10-minute timeout)
```
A genuine 10-minute inactivity timeout is unaffected by this change — it still resolves with `type: "timeout"`. Only an explicit new arm (a second `wait_click()`, or an arming `wait_done()`) produces `type: "superseded"`.

**Mermaid node ID extraction (browser-side):**
After `mermaid.render()` produces an SVG, the Svelte component intercepts `click` events on SVG elements with class `.node` (nodes) and `.edgeLabel` (edges).

**Node extraction:**
- Node IDs are embedded in the SVG element's `id` attribute using the pattern `flowchart-<nodeId>-<N>` where N is a counter
- Extraction regex: `/flowchart-(.+?)-\d+$/` — captures `nodeId` from the middle
- Node labels are read from the `.nodeLabel` child element if present, falling back to `.label` child, or the element's `textContent` itself
- Label extraction: `textContent?.trim()` from the identified label element

**Edge extraction:**
- Edge elements are `.edgeLabel` in the SVG
- Edge ID is inherited from the parent group element (the closest ancestor with an `id` attribute), typically `L_<source>_<target>_<N>` or similar
- Edge labels are the `textContent?.trim()` of the clicked element

This extraction logic is hardcoded for `graph`/`flowchart` diagram types; other Mermaid types may have different SVG structures (see U4b for diagram type support matrix).

**`node_to_frame` autonomous navigation (Phase 2 — Sprint 13; entry point moved v0.26 Sprint 45; auto-restore v0.26 Sprint 47):**
When `commit_step_frames(id, node_to_frame={...})` is called, the browser attaches click listeners automatically (no `wait_click()` or agent involvement needed). On click, if the node ID is in the map, the browser calls `POST /seek` with the target frame index; otherwise the click is ignored. (Historical: originally set via `render(type="step-frames", options.node_to_frame={...})`; moved to `commit_step_frames()` when the one-shot `render(type="step-frames")` path was removed — see F15/U4e in `03`.) `wait_click()` and `node_to_frame` are mutually exclusive: `set_node_actions enabled:true` (from a `wait_click()` call) disarms `node_to_frame` for the duration of the call. **Auto-restore (v0.26 Sprint 47, OQ12 — reverses the prior limitation):** after `wait_click()` resolves or times out and `set_node_actions enabled:false` is sent, `client/src/stores/canvasStore.ts`'s reducer restores `nodeToFrameEnabled` to `true` provided the current presentation still carries a `nodeToFrame` map (the map itself is never cleared by arming/disarming a click listener — only the browser's willingness to act on it) — no agent re-render needed to re-enable autonomous navigation. Purely a client-side reducer change; the server broadcasts nothing new for this.

---

## 5. API Payload Shape

```json
{
  "action": "replace",
  "type": "mermaid",
  "payload": "graph TD; A --> B"
}
```

`action` is always `"replace"` in v1 — hardcoded server-side, not part of the MCP tool signature. `append` and other action variants are Phase 2. `options.theme` is Phase 2; `options.title` is MVP (Sprint 8 ✅). Non-Mermaid types (`svg`, `html`, `katex`, `vega-lite`) are all MVP (Sprint 5 ✅); `d2` is post-Phase-2. `render()` is single-frame only — `type: "step-frames"` was a fifth top-level type through v0.25 (MVP, Sprint 7 ✅) but no longer exists (removed v0.26 Sprint 45, see Step-frames protocol below).

### `options` parameter

`render()` accepts a third argument `options` (required from v0.7 — `options.workspace` is mandatory). `options.title` is MVP (Sprint 8 ✅). In Phase 2, `theme` is added:

```json
{
  "theme": "dark"
}
```

| Key     | Type                   | Phase | Default  | Description                              |
|---------|------------------------|-------|----------|------------------------------------------|
| `workspace`      | `string`                          | **required (v0.7)** | — | Workspace name for snapshot routing. Must be provided on every `render()` call. No fallback: absent or invalid value returns `{ ok: false, error: "..." }` before snapshot or render. Same safety check as F12 (alphanumeric, dashes, underscores, dots, spaces; no path separators or `..`). `WHITEBOARD_WORKSPACE` env var is deprecated and removed (v0.7). |
| `title`          | `string`                          | MVP     | `""`    | Displays a label above the canvas for this render call. Hidden if absent or empty. Cleared by `clear()`. Not included in `export()` output. |
| `theme`          | `"dark" \| "light"`              | Phase 2 | `"dark"` | Sets the canvas theme for this render call. Persists until next `render()` or explicit change. |

**`node_to_frame` moved off `render()` in v0.26 Sprint 45** — it applied only to `type="step-frames"`, which no longer exists as a `render()` type. It is now a `commit_step_frames(id, node_to_frame?)` parameter instead (§3 MCP Tool Implementations); see §4 Node Click Flow below for the click-navigation behavior it drives, unchanged.

**Action-variant options (deferred beyond Phase 2):** Agent-controlled customizations to rendering behavior — e.g., "highlight this path in the diagram," "collapse this section," "show only these relationships." Planned as a generic `actions: [{ action, params }]` structure; deferred pending experience with how agents actually use the whiteboard.

### Step-frames protocol (MVP — Sprint 7 ✅; sole creation path v0.26 Sprint 45)

Step-through is a three-tool protocol — the only way to create a multi-frame sequence (`render()` is single-frame only):

1. **Build:** `init_step_frames(frame_type, workspace, title?)` → `append_frame(id, payload, label?, type?)` × N → `commit_step_frames(id, node_to_frame?)`. Validates each frame as it's appended, displays a live preview after each call, and stores the full sequence on commit.
2. **Navigate:** `step(direction="next"|"prev")` — advances or rewinds the cursor. Returns `{ ok: true, current_frame: N, total_frames: M }`. `seek(frame)` jumps to an arbitrary index in one call.
3. **Export:** `export()` — returns the full assembled frames JSON string (not the current frame), so the agent can reconstruct or resume the sequence.

`clear()` resets the step cursor along with the canvas. (Historical, through v0.25: a one-shot `render(type="step-frames", payload=<JSON string>)` path existed alongside this as a fewer-round-trips alternative for short, fully-known-upfront sequences. Removed v0.26 Sprint 45 — no back-compat shim, per `02` N4 — because it duplicated validation/broadcast logic this protocol already covers as a strict superset; see F15 in `03` and D1 in §9.3 below.)

### Step-frames payload shape (MVP — Sprint 7 ✅; per-frame `type` v0.17)

```json
{
  "frame_type": "mermaid",
  "frames": [
    { "label": "Step 1 — initial node", "payload": "graph TD; A" },
    { "label": "Step 2 — add edge",     "payload": "graph TD; A --> B" },
    { "label": "Step 3 — formula",      "payload": "E = mc^2", "type": "katex" }
  ]
}
```

- `frame_type` — default type for frames that omit their own `type`; every frame in a sequence used to share this in v1.
- `label` — optional string; displayed in the UI as a step caption.
- `payload` — same format as a regular `render` payload for the frame's effective type (`type` if present, else `frame_type`).
- `type` (v0.17, optional) — per-frame override of `frame_type`. Lets one sequence mix content types (e.g. a mermaid frame followed by a katex frame). Every frame's payload is validated against its effective type before the sequence is accepted.

---

## 6. Project Structure (proposed)

```
agent-whiteboard/
├── server/
│   ├── index.ts          # entry point — starts HTTP + WebSocket + MCP
│   ├── app.ts            # Hono app + REST endpoints (testable, no startup side effects). Duplicates render/step-frames/workspace-validation logic with mcp.ts below — planned extraction into a shared core module, v0.21 (see M4 in `02`, NF12 in `03`).
│   ├── mcp.ts            # MCP tool definitions and handlers. Same planned shared-core extraction as app.ts, v0.21.
│   ├── session.ts        # in-memory canvas state
│   ├── slideshow.ts      # slideshow timer logic
│   ├── interaction.ts    # Interaction primitive (arm/await/resolve, U7/D4, v0.26 Sprints 46-47) — broadcast-mode signalDone/waitForDone + single-flight-mode signalClick/waitForClick as configurations of it (was a bespoke EventEmitter bus in events.ts through v0.25); supersession (type:"superseded") added Sprint 47
│   ├── validate.ts       # Mermaid keyword + parse validation
│   ├── ws.ts             # WebSocket push to browser
│   ├── snapshot.ts       # render snapshot writer (Phase 2 — Sprint 16)
│   ├── snapshot-reader.ts # snapshot list reader: listSnapshots() for GET /snapshots (v0.4 — Sprint 17; id field + explicit workspace param v0.15); listAllSnapshots() for GET /snapshots/all (v0.5 — Sprint 18); findSnapshotById() for export(id) (v0.11); findSnapshotByIdInWorkspace() for agent-facing POST /export-html { workspace, id } items (v0.15)
│   ├── step-frames-builder.ts  # in-memory map of id → partial step-frames state; TTL cleanup (v0.8)
│   ├── export-html.ts    # HTML assembly for POST /export-html (v0.13). Server-side rendering for katex/vega-lite/svg/html; Mermaid embedded + rendered client-side (v0.14, see bug B4 in `01`). Items addressable by filename (v0.13) or id (v0.15) — also used by the export_html MCP tool, which writes the result to disk instead of returning it in the HTTP response. generateExportHtml() serializes calls via a promise queue around generateExportHtmlInner() (v0.18, see bug B14 in `01`).
│   ├── viewport-cache.ts # (v0.19; composite key v0.26.1, bug B19 in `01`) reads/writes viewport-cache.json (`id:frameIndex` → { scale, positionX, positionY }, was bare `id` pre-v0.26.1); used by POST /viewport (write, now includes frame) and by the render/step/seek/snapshots-load broadcast paths (read, per frame) and the two delete endpoints (cleanup on delete, now a prefix match on `id:`). See F19 in `03`, C3 in `02`.
│   └── channel.ts        # stdio channel server (Channels API experiment)
├── client/               # Svelte SPA
│   ├── src/
│   │   ├── App.svelte    # 449 lines — WebSocket routing, canvas state, step-frame nav, modal orchestration, Done-button lifecycle, all in one component. Planned decomposition into stores/reducers, v0.21 (see M5 in `02`, NF12 in `03`); must land before the dynamic-import work below so lazy-load boundaries sit at the new component/store boundaries.
│   │   ├── ws.ts         # WebSocket client
│   │   ├── HistoryPanel.svelte  # collapsible snapshot history navigator (v0.4 — Sprint 17). v0.16: inline selection-mode UI (header icons, per-row checkboxes, select-bar, ws-actions-bar) removed — becomes pure browse/load.
│   │   ├── DeleteExportModal.svelte  # 2-step delete/export modal (v0.16, shipped) — workspace picker → zoomed-in whole-workspace / subset action. Triggered from App.svelte's controls panel.
│   │   └── renderers/    # one file per content type. Mermaid/KaTeX/Vega-Embed are currently all eagerly bundled — planned dynamic `import()` per type, v0.21, after the App.svelte decomposition above (see M6 in `02`, NF13 in `03`).
│   │       ├── Mermaid.svelte  # (v0.19) auto-fit on new snapshot id+frame; debounced POST /viewport on zoom/pan change; applies server-supplied viewport when present instead of auto-fitting. Pins the inserted SVG's width/height attributes to its viewBox right after insertion (v0.22, bug B17 in `01`) — Mermaid's own width="100%" SVG has no definite size to resolve against in this deliberately-unsized container, so some browsers silently substituted the CSS default replaced-element size (300x150) instead, breaking the fit-scale's assumed base size. Re-fit-per-frame for step-frames sequences of varying size: scheduled v0.26.1 (bug B19/FR21 in `01`, was previously mis-cited here as FR20 — the correct reference is FR21).
│   │       ├── Html.svelte
│   │       ├── Katex.svelte
│   │       └── VegaLite.svelte
│   └── public/
├── tests/                # unified test root — Sprint 15 refactor
│   ├── e2e/
│   │   └── canvas.spec.ts      # Playwright e2e tests (16 tests) — Sprint 11
│   ├── human_driven/
│   │   ├── showcase.js          # manual demo — Sections 1-12 (renderers, seek, interactivity, export-by-id) + 13 (incremental step-frames, v0.22) + 14 (node_to_frame, v0.22); delete/export UI excluded by design (browser-only, no MCP/REST surface to script against beyond export-by-id)
│   │   └── click-demo.js        # manual click/popup demo
│   └── unit/
│       ├── server/
│       │   └── app.test.ts      # Vitest integration tests (see `npm test` output for current count)
│       └── client/              # placeholder — Svelte component unit tests (future)
├── test-results/         # Playwright artifact output (generated, not source)
├── docs/
├── .mcp.json             # MCP server registration — committed to repo
├── playwright.config.ts  # Playwright config — testDir updated to ./tests/e2e — Sprint 15
├── vitest.config.ts      # include updated to tests/unit/server/**/*.test.ts — Sprint 15
├── tsconfig.json         # server TypeScript config (see below)
├── package.json
└── CLAUDE.md
```

### TypeScript configuration (server)

- Module system: **ESM** (`"module": "NodeNext"`, `"moduleResolution": "NodeNext"`)
- Target: `ES2022` (Node 18 supports it natively; no downlevel async needed)
- Strict mode: `true`
- Rationale: Hono and `@modelcontextprotocol/sdk` are ESM-first; CJS interop adds friction

The Svelte/Vite client has its own `tsconfig.json` generated by `create svelte` (also `strict: true`). It was never wired into the build's type-check gate until v0.18 (found during code review, 2026-07-04, see B10 in `01`): root `tsconfig.json` excludes `client/`, and `npm run build` only ran `tsc` against `server/`. **Resolved (v0.18):** `svelte-check` is a dev dependency; `npm run typecheck` runs `svelte-check --tsconfig client/tsconfig.json` and is chained into `npm run build` (`tsc -p tsconfig.json && npm run typecheck && vite build ...`), so a client-side type error now fails the build exactly as a server-side one does. Requires `client/svelte.config.js` (exports `vitePreprocess()`) for `svelte-check` to preprocess `<script lang="ts">` blocks outside a SvelteKit project.

---

## 7. Testing Strategy

Two test layers:

**Layer 1 — Server integration tests (Vitest)**

`tests/unit/server/app.test.ts` — covers all REST endpoints (test count grows over time; run `npm test` for the current count, currently 223). Runs with `npm test`. Scoped via `vitest.config.ts`.

MCP tool handlers are thin wrappers over the same session logic exercised by the REST tests. MCP correctness verified manually: `export()`, `render()`, and `clear()` confirmed working end-to-end (MCP → WebSocket → browser) on 2026-05-31.

**Coverage gap (found 2026-07-04, code review) — remediation planned v0.20:** `export-html.ts`, `slideshow.ts`, `events.ts`, `ws.ts`, `channel.ts`, and `session.ts` have no unit tests today; `mcp.ts` is thin (15 cases) relative to `app.ts` (181). No client unit tests exist at all — only the e2e layer below. Blanket coverage across all of these is planned for v0.20 (NF10 in `03`), both as a real gap-fill and as a safety net for the v0.21 refactors (M2 in `02`).

**Layer 3 — Manual showcase script (`tests/human_driven/showcase.js`)**

Exercises the MCP/REST tool surface end-to-end against a running server + real browser tab, for human eyeballing rather than assertions. **Coverage audited v0.22** (user request, see `01` FR19): Sections 1–12 already covered every renderer type, slideshow (server- and client-driven), seek, `wait_done`/`wait_click` (plain, popup, edge), and export-by-id. Two shipped MCP features had no section: the incremental step-frames protocol (`init_step_frames`/`append_frame`/`commit_step_frames`, F15) and `node_to_frame` autonomous navigation (U4e) — added as Sections 13 and 14. Delete and export-modal UI (U7e–U7i) are deliberately excluded — they're browser-only interactions with no MCP/REST surface for a script to drive beyond what Section 12 (export-by-id) already exercises.

**Layer 2 — Browser e2e tests (Playwright) — Sprint 11 ✅**

`tests/e2e/canvas.spec.ts` and related specs — 31 tests covering the full interactive browser surface (test count grows over time; run `npm run test:e2e` for the current count). Runs with `npm run test:e2e`. Uses system Chrome (`channel: "chrome"`); `dev:test` starts the servers without opening a browser.

Covered scenarios:
- Initial placeholder state (confirms WebSocket connects)
- All 5 renderer types actually render in the browser (Mermaid, HTML, SVG, KaTeX, Vega-Lite)
- Title overlay show/hide/clear
- Clear reverts canvas to placeholder
- Step-frames: step-bar visible, Prev/Next disabled states, frame labels, browser button clicks (full client→server→WebSocket→browser round-trip)
- Done button label feedback and 2 s revert

---

## 8. MCP Registration

`.mcp.json` is committed to the repo root.

> ✅ VERIFIED (Sprint 0, 2026-05-31): Claude Code loads `.mcp.json` automatically on project open. The server must be **enabled manually** via `/mcp enable agent-whiteboard` or the `/mcp` dialog after first open; once enabled, tools are available. Behaviour on older versions or IDE extensions may differ.

```json
{
  "mcpServers": {
    "agent-whiteboard": {
      "type": "sse",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

- The server must be running before Claude Code connects — `npm run dev` starts it.
- Port `3000` is the default; overridable via `PORT` environment variable.
- Binding address defaults to `localhost`; overridable via `HOST` environment variable (see `server/index.ts`). See A1 (`02`) for the local-only deployment rationale.

---

## 9. Target Architecture — Unified Command Pipeline (v0.23–v0.26)

> Promoted from `desing-analysis/` (FR22 in `01`; adoption/sequencing decisions in `02` §N) via a `/grill-me` stress-test during intake, 2026-07-07 — the folder itself is deleted once this section captures its content. **Sections 1–8 above describe the architecture as it stands today (through v0.22)** and are updated in place, concretely, as each slice below actually ships — this section is the target design and the roadmap, not a description of already-shipped behavior.

### 9.1 The core model

Everything renderable collapses to one atom and two orthogonal axes:

- **Frame** = `{ type, payload, label? }` — one atomic renderable (Mermaid source, KaTeX string, Vega-Lite spec, …).
- **Presentation** = `{ id, title?, cursor, frames: Frame[] }` — an ordered list of frames + a cursor.
- **Content axis:** always a Presentation (the only content atom — "slide" and "step-frames" as distinct top-level types disappear).
- **Cursor-driver axis:** `static` (1 frame) · `manual` (agent/user via `step`/`seek`/click) · `timed` (the Playback/slideshow controller).

`render()`, step-frames, and `slideshow()` become the same Presentation differing only by driver and frame count — not three parallel implementations. `step`/`seek` become cursor moves; a history snapshot is a serialized Presentation.

### 9.2 Unit map (9 units + 1 controller)

| # | Unit | Responsibility | Baseline status |
|---|------|-----------------|------------------|
| U0 | Pipeline Runner | Composes `validate → reduce → persist(policy) → project` for every command; the one call both MCP and REST adapters make | New (v0.23 partially via the projector; full form v0.26) |
| U1 | Source Adapters | Translate MCP/REST calls into Commands; zero business logic | Largely shipped — `render-core.ts` already does this for the core paths (v0.21); full thin-adapter parity completes in v0.26 |
| U2 | Content Model + Validation | `Frame`/`Presentation`; one `validateFrame()` looped over every frame | Partially shipped (per-frame validation since v0.17); the unified type replaces the 3-way union in v0.26 |
| U3 | Canvas State (reducer) | Single source of truth: current presentation, cursor, `lastWorkspace`, arm-states, driver | Today's `session.ts`/`canvasStore.ts` 3-way union; rewritten in v0.26 |
| U4 | Persistence | Snapshot read/write, viewport cache, list/delete; enforces the persist policy | Mechanism shipped; explicit required-trigger policy is new (v0.25); schema migration is v0.26 |
| U5 | Projection / Broadcast | The one function building every server→browser message | **Shipped (v0.23)** — `broadcastReplace()`/`broadcastStepFrames()` in `server/ws.ts` collapse the 13 hand-built sites into 1 |
| U6 | Render Surface | Renderer registry (type→component) + canvas controller + auto-fit/viewport + async-ordering guard | Store/reducer decomposition shipped (v0.21); registry is new (v0.24) |
| U7 | Return Channel | One arm/await/resolve Interaction primitive (`wait_done`/`wait_click`/`node_to_frame` as variants) | **Shipped v0.26 Sprints 46–47:** `server/interaction.ts` provides `createBroadcastInteraction()` (wait_done — every pending `await()` resolves independently, one `resolve()` wakes all) and `createSingleFlightInteraction()` (wait_click — a new `await()` supersedes the pending one, or an external `supersede()` call does, distinguishing `type:"superseded"` from a genuine `type:"timeout"` — Sprint 47, OQ11); `signalDone`/`waitForDone`/`signalClick`/`waitForClick` are thin configurations over these, replacing the bespoke EventEmitter bus in the removed `server/events.ts`. Arming `wait_done()` calls `clickInteraction.supersede()`, taking over the return channel from a pending `wait_click()`. `node_to_frame` conforms to the same conceptual shape (arm on `commit_step_frames`, resolve on click) but its resolver runs entirely client-side (`POST /seek` called directly by the browser, no agent round-trip — see U4e), so it has no server-side arm/await state and shares no code with this module; its click-map now auto-restores after `wait_click()` resolves via a `canvasStore.ts` reducer change (Sprint 47, OQ12). |
| U8 | Export (read-side) | `export()`/`export_html` over *persisted* presentations; strictly downstream of U4, read-only | Shipped (v0.13–v0.15); adapts to the new schema in v0.26 |
| — | Playback controller | Timer advancing a cursor; owns no validation/broadcast/persist code of its own | Broadcast construction moved out in v0.23 (`slideshow.ts` now calls `broadcastReplace`/`broadcastStepFrames`, same as every other call path); persist logic (`finalizeSlideshow()`) still lives in `slideshow.ts` until v0.25 (persist policy) |

**Scope boundaries (one-way dependencies):** `U1 Sources → U0 Runner → {U2 Validate, U3 Reduce, U4 Persist(policy), U5 Project} → U6 Render Surface`; `U8 Export → U4 (read-only)`; `U7 Return Channel` emits browser events independently, coupled only to a `cursor`/`id` handle, never to content. U0 is the only unit that knows the pipeline's *sequence*; adapters (U1) never orchestrate.

### 9.3 Decision points (resolved)

| D | Resolution |
|---|------------|
| D1 | Unify content under one `Presentation`/`Frame` model — **yes** (makes the B5/B15/C2b/C2d drift class unrepresentable; costs a payload-schema change, accepted per `02` N2/N4) |
| D2 | Broadcast is a fully agnostic mechanism (no per-feature branches); persistence = one agnostic write mechanism + a required per-command trigger (`immediate\|on-finalize\|transient\|never`) — the trigger is what a new feature must declare, not an opt-in it can skip |
| D3 | One renderer-registry abstraction, keyed by `type`, with two capability slots (`renderLive` for U6, `renderStatic` for U8/export) — one registration serves both live and export |
| D4 | One Interaction primitive for the return channel — `arm(affordance, options) → await → resolve(event)\|timeout`; `wait_done`/`wait_click` are configurations of it, `node_to_frame` is the same arm with a local (not agent-round-trip) resolver |
| D5 | MCP and REST are both thin adapters over one core, full verb parity — removes the class of duplication that caused B6 (`workspace:"."` wipe) |

**Contract changes this implies:** one `Presentation` payload/model (per-frame `type`, `type:"step-frames"` removed as a top-level type); unified `frames[]` snapshot schema + one-time migration (no legacy dual-read path, OQ5a); WS `replace` message always carries `id`+`cursor`+`total`, replacing the `stepFrames` boolean flag; neutral `{ok,error,category?}` error shape (REST maps `category`→HTTP status, MCP passes it through verbatim); `wait_click` gains `type:"superseded"`; `clickMap`/`node_to_frame` auto-restores after `wait_click` resolves (previously required a fresh `render()` call — see U4e in `03`). MCP tool *verbs* (`render`/`slideshow`/`step`/`seek`/…) are unchanged for agent ergonomics — they become sugar over "commit a Presentation + set a driver," per D5.

### 9.4 Traceability — structural fix per historical drift bug

| Past failure | Root cause | Structural fix |
|---|---|---|
| B15/C2d — slideshow no `id`, no auto-fit | Second broadcast builder in `slideshow.ts` | **U5 (v0.23, shipped):** one Projection builder (`broadcastReplace()`); slideshow calls it like every other producer instead of building its own message |
| FR20/B15 — slideshow missing from history | `slideshow()` never called `saveSnapshot()` | D2/U4 (v0.25): persist trigger is required, not opt-in |
| B5 — one-shot step-frames skipped validation | Two validation paths (one-shot vs. incremental) | U2 (v0.26): one `validateFrame()` over every frame, one content model |
| B6 — `workspace:"."` wipe | `app.ts`/`mcp.ts` duplicated validation | U1/D5 (v0.26, full parity): one core, thin adapters — **caveat (2026-07-09):** a re-audit (`02` N6, `03` §8) found "full parity" was true only for the 5 commands already routed through `render-core.ts`; `step`/`seek` and `slideshow` validation were never migrated. See 9.6. |
| B8 — stale async render | Per-renderer ad hoc ordering guard | U6 (v0.24 registry lands the shared surface; guard itself already shipped v0.18) |

### 9.5 Adoption sequencing (ROI ÷ blast-radius)

| Slice | Milestone | Scope | Risk |
|---|---|---|---|
| A — Unify the projector | **v0.23 — shipped** | U5 only, over today's `CanvasState` — no schema change | Low-med; message shape unchanged (verified by full unit + e2e suites) |
| B — Client renderer registry | **v0.24** | U6 registry, replacing the `{#if}` chain | Low; isolated to the client |
| C — Persistence policy + finalize dedup | **v0.25** | U4 trigger vocabulary + shared finalize, after A | Low-med |
| D — Full Presentation/Frame model + migration + contract break | **v0.26** | U0/U2/U3 rewrite, WS contract, snapshot schema, MCP payload, U7 return-channel generalization | High (C1–C4 in the retired `baseline-comparison.md`) — deliberately accepted per `02` N2, sequenced last, gated before any public release (`02` N4) |

### 9.6 REST/MCP Parity Remediation (v0.27)

> A+B+C+D (9.5) closed U1/D5 "thin adapter, full parity" for the commands already routed through `render-core.ts` at the time each slice shipped. A follow-up duplication audit (`docs/raw/design-problems.md`, F1–F7; `02` §N6; `03` §8) found this incomplete for commands added or left alone along the way. This slice finishes what D5 already claims as done:

| Finding | Gap vs. D5's "full parity" | Fix | Requirement |
|---|---|---|---|
| F1 | MCP `slideshow` never migrated to U2's `validateFrame()` | Route it through `validate.ts` like every other content-accepting command | NF18 |
| F2 | `step`/`seek` never migrated to U1 (`render-core.ts`) | Extract shared functions, matching `render`/step-frames commands | NF19 |
| F3 | `list_snapshots`/`GET /snapshots` — U1 adapters diverge on workspace resolution, not just implementation | Workspace mandatory, no fallback, both transports (aligns with D5 + the render()/slideshow() precedent) | NF20 |
| F4 | `export-html` — U8 item-addressing shape diverges between adapters | Both transports address items by `ids` only | NF21 |
| F5 | Snapshots-root path resolution has no owning unit — reimplemented ad hoc wherever U4 (persistence) or U1 (adapters) need it | One exported resolver, all call sites import it | NF22 |
| F6 | Frame-array predicate (U2-adjacent) reimplemented inline in `app.ts` instead of reusing `snapshot-reader.ts`'s | Reuse the existing single implementation | NF23 |
| F7 | `node_actions`/`node_to_frame` shape validation — same U1 divergence pattern as F1/F3, lower severity | REST reuses MCP's zod schemas via `.safeParse()` instead of hand-written type guards | NF24 |

No new units and no contract change beyond NF20/NF21 (both scoped in `03` §8 with an explicit browser-compatibility check before implementation) — this is U1/U2 catching up to the design D5 already specifies, not a new design.

Per `02` §N3, v0.26 stays one milestone (its changes are coupled and cannot land across a version boundary without a compat shim already ruled out) but its sprint tasks are strictly ordered with individual acceptance criteria — see `Milestone_v0.26.md`.
