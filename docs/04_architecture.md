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
| Rendering libraries        | Mermaid.js ^11, KaTeX, vega-lite + vega-embed, DOMPurify (all npm, bundled by Vite)                                                                                                                                                                                                                         | Mermaid pinned to ^11 (breaking changes between major versions make floating risky). KaTeX, Vega-Lite, SVG/HTML (DOMPurify) added in Sprint 5 ✅. D2 and D3 deferred (D2 requires server-side render process; D3 is post-Phase-2 nice-to-have). |
| Transport (server→browser) | WebSocket                                                                                                                                                                                                                                                                                                    | Real-time incremental updates                                                                                                                                                                                                                          |
| Packaging (v1)             | `npm run dev` — dev-only, no distribution concern yet                                                                                                                                                                                                                                                        | No remote repo yet; packaging deferred                                                                                                                                                                                                                 |
| Dev server                 | Separate Vite dev server (`localhost:5173`) + Node server (`localhost:3000`); started together via `concurrently`; Vite proxies `/render`, `/stream`, `/mcp` to Node. **`/stream` requires `ws: true`** in Vite proxy config (WebSocket proxying is opt-in; HTTP proxy alone does not cover WS connections). | HMR on Svelte side; Node server implementation unchanged; production static build deferred to Phase 2                                                                                                                                                  |
| Browser auto-open          | `open` npm package                                                                                                                                                                                                                                                                                           | Cross-platform (macOS/Linux/Windows) with a single API call; no platform-specific logic                                                                                                                                                                |

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
```

**Shipped in MVP (not Phase 2):**
- Full server-side Mermaid parse validation — Sprint 6 ✅
- `step()` tool + step-through frame sequences — Sprint 7 ✅
- SVG/HTML, Vega-Lite, KaTeX renderers — Sprint 5 ✅ (D2 is post-Phase-2 — requires server-side render process)
- `options.title` overlay — Sprint 8 ✅

**Shipped in Phase 2:**
- Slideshow / auto-play (`slideshow()`, `slideshow_stop()`) — Sprint 9 ✅. Each slide broadcast using the same WebSocket event format as `POST /render`. `step-frames` slides expanded into individual timer ticks.
- `wait_done()` tool + Done button — Sprint 10 ✅. `server/events.ts` EventEmitter bus; `signalDone()` called by `POST /user-done`; `waitForDone()` called by both `POST /wait-done` (REST) and `wait_done()` (MCP tool). See §3 and §4.
- Channels API experiment (`server/channel.ts`) — Sprint 10 ✅. Stdio MCP channel server + HTTP relay on port 3001. Useful for async push events; not used as the primary "wait for user" primitive (see `02` E1).
- `wait_click()` tool (plain click, no popup) + `POST /node-click` endpoint — Sprint 12 ✅. Browser arms click listeners on Mermaid SVG nodes/edges; `signalClick()`/`waitForClick()` EventEmitter bus in `server/events.ts`. See §3 and §4.

**Remaining Phase 2 / Phase 3:**
- `wait_click()` — `node_actions` popup menu + edge support (Sprint 14) ✅
- `POST /wait-click` REST fallback does not yet arm the browser (bug fix, Sprint 13) ✅
- `seek(frame)` MCP tool + `POST /seek` REST endpoint — client-controlled frame navigation (Sprint 13) ✅
- `options.node_to_frame` on `render()` — declarative node→frame map for autonomous browser navigation (Sprint 13) ✅
- **Render snapshot persistence** (`server/snapshot.ts`) — Sprint 16 (see F10 in `03`) ✅
- **History navigator** (`GET /snapshots`, `POST /snapshots/load`, `client/src/HistoryPanel.svelte`) — Sprint 17 (see F11–F12, U7 in `03`)
- Multi-panel / named tabs
- Binary export (PNG/SVG/PDF)
- `options.theme` and action-variant options for `render()`
- Multi-user session management *(Phase 3)*
- Remote deployment / auth *(Phase 3)*

---

## 3. MCP Tool Implementations

| Tool                              | Server-side action                                                                                                                                                                                                                  |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `render(type, payload[, options])`| Validates payload for the given type; pushes render command to browser via WebSocket; stores as current canvas state. `options.title` (optional string, MVP) displays a label above the canvas. `options.theme` and action variants are Phase 2. For `step-frames`: loads all frames, displays frame 0, stores full payload. |
| `clear()`                         | Resets in-memory canvas state and step cursor; sends clear command to browser                                                                                                                                                       |
| `export()`                        | Returns the last submitted source payload verbatim as a string. For all types (mermaid, svg, katex, vega-lite, step-frames): returns whatever was passed to `render()`. Empty string if canvas is empty or cleared.                 |
| `step(direction)`                 | Advances (`"next"`) or rewinds (`"prev"`) the step cursor for a loaded `step-frames` sequence. Returns `{ ok: true, current_frame: N, total_frames: M }`. No-op (returns error) if no step-frames sequence is loaded. (MVP — Sprint 7 ✅) |
| `seek(frame)` *(Sprint 13)*       | Jumps the step-frame cursor to an arbitrary frame index. Useful for random-access navigation without repeated `step()` calls. Returns `{ ok: true, current_frame: N, total_frames: M }`. Error if no `step-frames` sequence is loaded or frame is out of range. (Phase 2 — Sprint 13) |
| `wait_done()`                     | Calls `waitForDone()` from `server/events.ts` — suspends until `signalDone()` fires (user clicks Done) or the 10-minute timeout elapses. Returns `{ ok: true }`. All concurrent `wait_done()` calls resolve simultaneously on a single click. (Phase 2 — Sprint 10 ✅) |
| `wait_click()` *(Sprint 12 ✅)*   | Arms the browser click listener; suspends until `signalClick(event)` fires (user clicks a node/edge) or the 10-minute timeout elapses. No `node_actions` in Sprint 12 — any click is accepted, no popup. Only one `wait_click()` active at a time; a second call cancels the first. Returns `{ ok: true, type: "node"\|"edge", id, label, action: null }` on click (`action` is always present; null in Sprint 12 because no popup menu exists yet); `{ ok: true, type: "timeout" }` on timeout. (Phase 2 — Sprint 12 ✅) |
| `wait_click(node_actions)` *(Sprint 14)*  | Extends Sprint 12 with optional `node_actions`: map of node ID → string[] — pushed to browser via WebSocket `set_node_actions` before suspending. Nodes with registered actions show a popup menu on click; user selects one. Returns `{ ok: true, type, id, label, action? }` — `action` present only when a menu item was selected. (Phase 2 — Sprint 14) |

### Validation — two layers

**Layer 1 — MCP tool definition** (agent-facing, in `mcp.ts`)
The tool's JSON Schema and description are read by the agent when it loads the MCP server. Rich schemas and inline examples are the primary defence against hallucinated payloads.

| Type      | Schema hint exposed to agent                                                                                                                         |
|-----------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mermaid` | `string` — must begin with a valid diagram keyword (`graph`, `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `mindmap`) |

Additional types exposed in v1 (Sprint 5 ✅): `vega-lite`, `katex`, `svg`, `html`. Step-frames exposed in v1 (Sprint 7 ✅): `step-frames`.
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
| `render` | `{ "ok": true }`                                                                                                                        | `{ "ok": false, "error": "..." }` |
| `clear`  | `{ "ok": true }`                                                                                                                        | — (always succeeds)               |
| `export` | `{ "ok": true, "data": "<source>" }` — verbatim last `render()` payload; empty string if canvas is blank. Same contract for all types. | — (always succeeds) |
| `step`       | `{ "ok": true, "current_frame": N, "total_frames": M }`                                                                              | `{ "ok": false, "error": "..." }` |
| `seek`       | `{ "ok": true, "current_frame": N, "total_frames": M }`                                                                              | `{ "ok": false, "error": "..." }` |
| `wait_click` | `{ "ok": true, "type": "node"\|"edge", "id": "<id>", "label": "<label>", "action": "<string or null>" }` — `action` field always present; null when no menu shown or click was plain; string value when menu item was selected. On timeout: `{ "ok": true, "type": "timeout" }`. | — |

**Browser-side render errors:** if the payload passes server validation but the renderer fails (e.g. Mermaid.js throws), the browser displays the error message inline on the canvas in place of the diagram.

### REST fallback response shapes

The REST fallback endpoints (`POST /render`, `POST /clear`, `GET /export`) return the same JSON shapes as the MCP tool responses above. `GET /export` returns the JSON body `{ "ok": true, "data": "<source>" }` — verbatim last `render()` payload for any type (not raw text).

`POST /step` was added in Sprint 7 (MVP ✅). Body: `{ "direction": "next" | "prev" }`. Returns the same shape as the MCP `step()` response.

`POST /user-done` was added in Sprint 10 (Phase 2 ✅). No body required. Calls `signalDone()` to wake all pending `wait_done()` calls; also forwards to channel relay. Returns `{ ok: true }`.

`POST /wait-done` was added in Sprint 10 (Phase 2 ✅). No body. Long-polls until `signalDone()` fires or the 10-minute timeout elapses. Returns `{ ok: true }`.

`POST /node-click` — Phase 2 (Sprint 12). Body: `{ "type": "node"|"edge", "id": "<id>", "label": "<label>", "action": "<chosen>" }`. Calls `signalClick(event)` (events.ts) to resolve any pending `waitForClick()`. Returns `{ "ok": true }`. No-op if no `wait_click()` is pending.

`POST /wait-click` accepts an optional `node_actions` body (`Record<string, string[]>`). If provided, the server validates it and broadcasts it to the browser via `set_node_actions` — popup menus appear for registered nodes exactly as they do via the MCP `wait_click(node_actions)` tool. Invalid `node_actions` returns `{ ok: false, error: "..." }` with 400. Omitting the body (or sending an empty body) arms a plain-click listener with no popup.

`POST /seek` — Phase 2 (Sprint 13). Body: `{ "frame": N }`. Calls `seekStepFrame(N)`, broadcasts the target frame to the browser. Returns the same shape as the MCP `seek()` response: `{ "ok": true, "current_frame": N, "total_frames": M }`. Error if no step-frames sequence is loaded or frame is out of range.

`POST /slideshow` failure behavior: If validation fails for any slide in the playlist, the server returns `{ ok: false, error: "..." }`. No timer is started, and the canvas state is unchanged (remains as the last successful `render()` or `clear()`). If a slideshow is already running and a new `POST /slideshow` request fails, the running slideshow continues unaffected (error returned, new request rejected).

`GET /snapshots` — v0.4 (Sprint 17). No body. Reads `<WHITEBOARD_SNAPSHOTS_DIR>/<WHITEBOARD_WORKSPACE>/` and returns `{ ok: true, snapshots: [{ filename, timestamp, type, title? }] }` sorted newest-first. Empty array if directory absent. Unreadable/malformed files silently skipped (warning to stderr).

`GET /snapshots/all` — v0.5 (Sprint 18). No body. Scans all subdirectories of `WHITEBOARD_SNAPSHOTS_DIR`, reads each workspace's `*_screen.json` files, and returns them grouped. Response: `{ ok: true, workspaces: [{ name, isCurrent, snapshots: [{ filename, timestamp, type, title? }] }] }`. Each workspace's list sorted newest-first. `isCurrent: true` for the workspace matching `WHITEBOARD_WORKSPACE`. Workspaces with no readable snapshots omitted. Returns `{ ok: true, workspaces: [] }` if root absent.

`POST /snapshots/load` — v0.4 (Sprint 17), extended in v0.5 (Sprint 18). Body: `{ "filename": "…" }` (current workspace) or `{ "filename": "…", "workspace": "…" }` (explicit workspace). Filename safety: must match `*_screen.json`, no `/` or `..`. Workspace safety (when provided): plain directory name only — no path separators, no `..`, no null bytes; must exist under `WHITEBOARD_SNAPSHOTS_DIR`. Reads the snapshot, validates its payload (same hard gate as `POST /render`), broadcasts to browser via WebSocket, updates in-memory canvas state. **Write-silent:** does NOT call `saveSnapshot()`. Returns `{ ok: true }` or `{ ok: false, error: "…" }` (file not found, path-safety failure, or invalid payload).

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

### Render Snapshot (Phase 2 — Sprint 16)

```
agent calls render(type="mermaid", payload="graph TD; A-->B", options={title:"..."})
  → MCP server validates payload  (hard gate — see §3)
  → IF validation passes:
      → stores as current canvas state (in-memory)
      → pushes render command over WebSocket to browser
      → calls saveSnapshot(type, payload, options)  [snapshot.ts]
          → resolves workspace: WHITEBOARD_WORKSPACE env || basename(process.cwd())
          → resolves dir: WHITEBOARD_SNAPSHOTS_DIR env || ~/.agent-whiteboard/
          → path: <dir>/<workspace>/<yyyyMMdd_HHmmss>_screen.json
          → creates directory if absent (mkdirSync recursive)
          → writes JSON: { timestamp, workspace, type, payload, options }
          → if write fails: logs warning to stderr, does NOT propagate error
  → IF validation fails: returns { ok: false, error: "..." } — no snapshot written
```

Snapshot directory layout:
```
~/.agent-whiteboard/
└── agent-whiteboard/          ← workspace (basename of project dir)
    ├── 20260609_143000_screen.json
    ├── 20260609_143215_screen.json
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
user clicks Done button in browser
  → browser fires POST /user-done to Hono server
  → server calls signalDone()  (events.ts EventEmitter bus)
  → all pending waitForDone() promises resolve
  → any suspended wait_done() MCP tool calls return { ok: true } to agent
  → server also forwards to channel relay on port 3001 (if running)
  → browser button shows "Sent ✓" for 2s
```

### Slideshow Command (Phase 2 — Sprint 9)

```
agent calls slideshow(slides=[...], delay_ms=1000)
  → MCP server validates each slide (same rules as render)
  → startSlideshow() begins server-side timer
  → each tick broadcasts a slide to browser:
      for non-step-frames slides:
        { action: "replace", type: slide_type, payload: slide_payload, title?: slide_title }
      for step-frames slides (expanded into frame ticks):
        frame N: { action: "replace", type: frame_type, payload: frames[N].payload, stepFrames: true, currentFrame: N, totalFrames: M, title?: frames[N].label }
        (each frame broadcast at delay_ms intervals; frame labels shown as titles, not original slide title)
  → browser renders each slide in sequence
  → after last slide, slideshow stops (no loop in v1)
  → MCP tool returns { ok: true }
```

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
      → returns { ok: true }
  → IF invalid:
      → returns { ok: false, error: "..." }
  → browser closes panel; canvas displays loaded snapshot
```

**Interaction with pending wait_click() / wait_done():** loading a history entry replaces the canvas but does NOT cancel any pending tool calls. Both continue waiting until their 10-minute timeout elapses or the user signals them through normal channels (Done button / node click). See assumption H2.

**Slideshow cancellation:** `POST /render`, `POST /clear`, or a new `POST /slideshow` call cancels any running slideshow. `POST /slideshow/stop` also cancels. `POST /step` and `POST /seek` do not cancel.

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
  → server calls signalClick(event)  (events.ts EventEmitter bus)
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

**`node_to_frame` autonomous navigation (Phase 2 — Sprint 13):**
When `render(type="step-frames", options.node_to_frame={...})` is called, the browser attaches click listeners automatically (no `wait_click()` or agent involvement needed). On click, if the node ID is in the map, the browser calls `POST /seek` with the target frame index; otherwise the click is ignored. `wait_click()` and `node_to_frame` are mutually exclusive: `set_node_actions enabled:true` (from a `wait_click()` call) disarms `node_to_frame` for the duration of the call. After `wait_click()` resolves or times out and `set_node_actions enabled:false` is sent, the browser does *not* automatically restore `node_to_frame` — the agent must call `render()` again with the `node_to_frame` map if it wants to re-enable autonomous navigation.

---

## 5. API Payload Shape

```json
{
  "action": "replace",
  "type": "mermaid",
  "payload": "graph TD; A --> B"
}
```

`action` is always `"replace"` in v1 — hardcoded server-side, not part of the MCP tool signature. `append` and other action variants are Phase 2. `options.theme` is Phase 2; `options.title` is MVP (Sprint 8 ✅). Non-Mermaid types (`svg`, `html`, `katex`, `vega-lite`, `step-frames`) are all MVP (Sprints 5 & 7 ✅); `d2` is post-Phase-2.

### `options` parameter

`render()` accepts an optional third argument `options`. `options.title` is MVP (Sprint 8 ✅). In Phase 2, `theme` is added:

```json
{
  "theme": "dark"
}
```

| Key     | Type                   | Phase | Default  | Description                              |
|---------|------------------------|-------|----------|------------------------------------------|
| `title`          | `string`                          | MVP     | `""`    | Displays a label above the canvas for this render call. Hidden if absent or empty. Cleared by `clear()`. Not included in `export()` output. |
| `theme`          | `"dark" \| "light"`              | Phase 2 | `"dark"` | Sets the canvas theme for this render call. Persists until next `render()` or explicit change. |
| `node_to_frame`  | `Record<string, number>`          | Phase 2 (Sprint 13) | — | Only valid when `type="step-frames"`. Declares a node ID → frame index map; the browser attaches click listeners automatically and navigates to the mapped frame on click — no `wait_click()` call needed. `wait_click()` overrides `node_to_frame` for the duration of its call (see §4 Node Click Flow). |

**Action-variant options (deferred beyond Phase 2):** Agent-controlled customizations to rendering behavior — e.g., "highlight this path in the diagram," "collapse this section," "show only these relationships." Planned as a generic `actions: [{ action, params }]` structure; deferred pending experience with how agents actually use the whiteboard.

### Step-frames protocol (MVP — Sprint 7 ✅)

Step-through is a two-tool protocol:

1. **Load:** `render(type="step-frames", payload=<JSON string>)` — validates, stores all frames, displays frame 0. Returns `{ ok: true }`.
2. **Navigate:** `step(direction="next"|"prev")` — advances or rewinds the cursor. Returns `{ ok: true, current_frame: N, total_frames: M }`.
3. **Export:** `export()` — returns the full original frames JSON string (not the current frame), so the agent can reconstruct or resume the sequence.

`clear()` resets the step cursor along with the canvas.

### Step-frames payload shape (MVP — Sprint 7 ✅)

```json
{
  "frame_type": "mermaid",
  "frames": [
    { "label": "Step 1 — initial node", "payload": "graph TD; A" },
    { "label": "Step 2 — add edge",     "payload": "graph TD; A --> B" },
    { "label": "Step 3 — complete",     "payload": "graph TD; A --> B --> C" }
  ]
}
```

- `frame_type` — single type shared by all frames in v1; per-frame type is later.
- `label` — optional string; displayed in the UI as a step caption.
- `payload` — same format as a regular `render` payload for the given `frame_type`.

---

## 6. Project Structure (proposed)

```
agent-whiteboard/
├── server/
│   ├── index.ts          # entry point — starts HTTP + WebSocket + MCP
│   ├── app.ts            # Hono app + REST endpoints (testable, no startup side effects)
│   ├── mcp.ts            # MCP tool definitions and handlers
│   ├── session.ts        # in-memory canvas state
│   ├── slideshow.ts      # slideshow timer logic
│   ├── events.ts         # signalDone/waitForDone + signalClick/waitForClick EventEmitter bus
│   ├── validate.ts       # Mermaid keyword + parse validation
│   ├── ws.ts             # WebSocket push to browser
│   ├── snapshot.ts       # render snapshot writer (Phase 2 — Sprint 16)
│   ├── snapshot-reader.ts # snapshot list reader: listSnapshots() for GET /snapshots (v0.4 — Sprint 17); listAllSnapshots() for GET /snapshots/all (v0.5 — Sprint 18)
│   └── channel.ts        # stdio channel server (Channels API experiment)
├── client/               # Svelte SPA
│   ├── src/
│   │   ├── App.svelte
│   │   ├── ws.ts         # WebSocket client
│   │   ├── HistoryPanel.svelte  # collapsible snapshot history navigator (v0.4 — Sprint 17)
│   │   └── renderers/    # one file per content type
│   │       ├── Mermaid.svelte
│   │       ├── Html.svelte
│   │       ├── Katex.svelte
│   │       └── VegaLite.svelte
│   └── public/
├── tests/                # unified test root — Sprint 15 refactor
│   ├── e2e/
│   │   └── canvas.spec.ts      # Playwright e2e tests (16 tests) — Sprint 11
│   ├── human_driven/
│   │   ├── showcase.js          # manual slideshow demo
│   │   └── click-demo.js        # manual click/popup demo
│   └── unit/
│       ├── server/
│       │   └── app.test.ts      # Vitest integration tests (64 tests)
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

The Svelte/Vite client has its own `tsconfig.json` generated by `create svelte` — no manual config needed.

---

## 7. Testing Strategy

Two test layers:

**Layer 1 — Server integration tests (Vitest)**

`tests/unit/server/app.test.ts` — 72 tests covering all REST endpoints. Runs with `npm test`. Scoped via `vitest.config.ts`.

MCP tool handlers are thin wrappers over the same session logic exercised by the REST tests. MCP correctness verified manually: `export()`, `render()`, and `clear()` confirmed working end-to-end (MCP → WebSocket → browser) on 2026-05-31.

**Layer 2 — Browser e2e tests (Playwright) — Sprint 11 ✅**

`tests/e2e/canvas.spec.ts` — 16 tests covering the full interactive browser surface. Runs with `npm run test:e2e`. Uses system Chrome (`channel: "chrome"`); `dev:test` starts the servers without opening a browser.

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
