# Requirements

> Built incrementally from `01_input-ideas.md` and confirmed decisions in `02_assumptions-and-risks.md`.
> Milestone tags: **v0.1** = Core Whiteboard (Sprints 0–8), **v0.2** = Bidirectionality (Sprints 9–14), **v0.3** = Observability & Infrastructure (Sprints 15–16), **planned** = future scope not yet assigned to a milestone.

---

## 1. MCP Tool Surface

The MCP server exposes tools to the agent.

| Tool | Signature | Description | Phase |
|------|-----------|-------------|-------|
| `render` | `render(type, payload, options)` | Push content to the canvas. `type` selects the renderer (e.g. `"mermaid"`). Always replaces the current canvas state in v1. `options.title` (optional string) displays a label above the canvas. `options.theme` and action-variant options deferred to planned. `options.node_to_frame` (v0.2, Sprint 13) — only for `step-frames`: declarative node ID → frame index map; browser navigates frames on click autonomously. `options.workspace` **(required, v0.7)** — workspace name for snapshot routing; no fallback; missing value returns `{ ok: false, error: "workspace is required" }`. **v0.11:** success response includes `{ ok: true, id: "<uuid>" }` — the UUID of the snapshot written for this render call. | v0.1; workspace required v0.7; id in response v0.11 |
| `clear` | `clear()` | Reset the current session canvas. | v0.1 |
| `export` | `export([id])` | Return a canvas source spec. Without `id`: returns the verbatim last `render()` payload (current behavior). With optional `id` (UUID): looks up the snapshot with that ID and returns its payload — the snapshot must have an `id` field (written from v0.11 onward). Response: `{ "ok": true, "data": "<source>" }`. Empty string if canvas is blank (no-id case). Error if id provided but not found. Binary export is planned. | v0.1; id param v0.11 |
| `step` | `step(direction)` | Advance (`"next"`) or rewind (`"prev"`) a step-through sequence. | v0.1 |
| `slideshow` | `slideshow(slides, delay_ms)` | Load a playlist of slides (`[{ type, payload, title? }]`) and auto-advance the canvas on a server-side timer at `delay_ms` intervals. A new call cancels any running slideshow. | v0.2 |
| `slideshow_stop` | `slideshow_stop()` | Cancel the running slideshow timer; last rendered slide remains on screen. | v0.2 |
| `wait_done` | `wait_done()` | Block until the user clicks the Done button in the browser. Returns `{ "ok": true }` when the user signals they are ready to continue. Times out after 10 minutes (returns `{ "ok": true }` regardless). Intended usage: `render(...)` → `wait_done()` → continue lesson. | v0.2 ✅ |
| `seek` | `seek(frame)` | Jump the step-frame cursor to an arbitrary frame index without repeated `step()` calls. Returns `{ "ok": true, "current_frame": N, "total_frames": M }`. Error if no `step-frames` sequence is loaded or frame is out of range. | v0.2 |
| `wait_click` | `wait_click([node_actions])` | Arm the browser for a single node or edge click on the current Mermaid diagram (plain or step-frames). Applies to `graph`/`flowchart` diagrams; other Mermaid types are best-effort. Optional `node_actions` (Sprint 14): map of node ID → string array; browser shows a popup menu for nodes with registered actions; user selects one. Returns `{ "ok": true, "type": "node"\|"edge", "id": "<id>", "label": "<label>", "action": "<chosen action or null>" }` (action field always present; null when no menu was shown or user clicked without selecting; string value when `node_actions` was provided and user selected an item). On timeout after 10 minutes: `{ "ok": true, "type": "timeout" }`. Usage: `render(...)` → `wait_click(node_actions?)` → agent handles click result. | v0.2 |
| `init_step_frames` | `init_step_frames(frame_type, workspace, title?)` | Begin an incremental step-frames sequence. Creates an empty skeleton in server memory, pushes a placeholder render to the browser (0-frame indicator with optional title), and returns a unique ID. `frame_type` is the content type shared by all frames (e.g. `"mermaid"`). `workspace` is required (same rules as `render()`). `title` is optional. Returns `{ "ok": true, "id": "<uuid>" }`. Error if `workspace` is absent/invalid or `frame_type` is unsupported. The ID expires after 30 minutes of inactivity. | v0.8 |
| `append_frame` | `append_frame(id, payload, label?)` | Append one frame to an in-progress step-frames sequence identified by `id`. `payload` is validated against the sequence's `frame_type` (same hard gate as `render()`). `label` is an optional display caption for this frame. Returns `{ "ok": true, "frame_count": N }` where N is the current total number of frames. **After each valid append, immediately pushes the full accumulated partial step-frames sequence to the browser (same WebSocket format as `render(type="step-frames", ...)`, positioned at the latest frame index N-1)** — the user sees the sequence grow one frame at a time. Invalid payloads are rejected before any broadcast; prior frames and browser state are preserved. Error if the `id` is unknown/expired or the payload fails validation. | v0.8; live preview v0.9 |
| `commit_step_frames` | `commit_step_frames(id)` | Finalise an in-progress step-frames sequence. **The primary visual has already been rendered incrementally by `append_frame()`** — `commit_step_frames()` is responsible for finalization only: assembles the full step-frames JSON, writes a snapshot, updates in-memory canvas state (so `export()` returns the complete assembled JSON), cancels any running slideshow, and deletes the builder entry. Still pushes a final WebSocket broadcast as part of the standard pipeline (for consistency and to handle edge cases such as `clear()` between appends). Returns `{ "ok": true }`. Error if the `id` is unknown/expired or the sequence has zero frames. After commit, `export()` returns the assembled full step-frames JSON. `clear()` during an active session does NOT cancel the builder entry — TTL handles cleanup. | v0.8; finalization-only v0.9 |

---

## 2. Rendering Capabilities

> Content types the renderer must support, in priority order.

| ID | Type | Format | Phase |
|----|------|--------|-------|
| V1 | Diagrams | Mermaid | v0.1 |
| V2 | Export — text | Returns verbatim last `render()` payload as text (all content types) | v0.1 |
| V3 | SVG / HTML; Data charts; Math | Inline SVG; HTML+CSS; Vega-Lite JSON; LaTeX / KaTeX | v0.1 |
| V3b | Diagrams | D2 | planned (requires server-side render process) |
| V4 | Export — binary | PNG / SVG / PDF download | planned |
| V5 | Step-through frames | Ordered frame arrays; agent-driven transitions via `step()` | v0.1 |
| V6 | History navigator | Toggleable browser panel listing past snapshots for the current workspace. Each entry: timestamp, type, and title (from `options.title`; falls back to `type + timestamp` if absent). Clicking an entry loads that snapshot onto the canvas (see F11–F12). Panel hidden by default; no snapshot written on load. | v0.4 |
| V6a | History navigator — workspace groups | Panel groups snapshots by workspace in an accordion. Current workspace section is auto-expanded on open; others are collapsed. Any snapshot — including those from other workspaces — can be loaded onto the canvas. Uses `GET /snapshots/all` (see F13). | v0.5 |

---

## 3. Transport

| Layer | Mechanism | Role |
|-------|-----------|------|
| Agent → Server | MCP (primary) | Agent calls tools; server executes render commands |
| Server → Browser | WebSocket (`/stream`) | Incremental, real-time updates pushed to the SPA |
| Agent → Server (alt) | REST `POST /render`, `POST /clear`, `GET /export`, `POST /step`, `POST /seek`, `POST /slideshow`, `POST /slideshow/stop`, `POST /wait-done`, `POST /wait-click`, `POST /step-frames/init`, `POST /step-frames/:id/frame`, `POST /step-frames/:id/commit` | Low-level fallback; also usable via `curl` for debugging. `POST /slideshow` and `POST /slideshow/stop` added in v0.2 alongside the slideshow MCP tools. `POST /step` body: `{ "direction": "next" \| "prev" }`. `POST /seek` body: `{ "frame": N }`; jumps step-frame cursor, returns `{ ok: true, current_frame: N, total_frames: M }` or error. `POST /wait-done` long-polls until the user clicks Done. `POST /wait-click` long-polls until a node/edge click; broadcasts `set_node_actions enabled:true` before suspending and `enabled:false` after resolution. `POST /step-frames/init` body: `{ frame_type, workspace, title? }` → `{ ok, id }` (v0.8). `POST /step-frames/:id/frame` body: `{ payload, label? }` → `{ ok, frame_count }` (v0.8). `POST /step-frames/:id/commit` no body → `{ ok }` (v0.8). |
| Browser → Server | `POST /user-done` | Browser Done button fires this; server calls `signalDone()` to wake any pending `wait_done()` calls, then optionally forwards to the channel relay. |
| Browser → Server | `POST /node-click` | Browser fires when user clicks a node or edge (while `wait_click()` is armed). Body: `{ type: "node"\|"edge", id, label, action? }`. Server calls `signalClick(event)` to resolve pending `wait_click()` calls. Returns `{ ok: true }`. |
| Server → Browser (WebSocket) | `{ action: "set_node_actions", node_actions, enabled }` | Sent when `wait_click()` is called. `node_actions`: map of node ID → string array (empty map = any click accepted, no popup). `enabled: true` arms the click listener; `enabled: false` disarms it (sent after click resolves or on timeout). |

File-system watch (`CLAUDE_SCREEN.md`) is **dropped** — superseded by MCP.

---

## 4. Session Model

- Sessions are **in-memory**, scoped to a single focused explanation.
- `clear()` resets the canvas; server restart clears everything.
- No cross-session persistence in v1 — deferred to planned.
- The agent is stateless with respect to the whiteboard: it sends commands forward-only and keeps its own record in the terminal (Mermaid source, JSON spec printed alongside the render).

---

## 5. Functional Requirements

### Communication & Integration

| ID | Requirement | Phase |
|----|-------------|-------|
| F1 | Accept content via MCP tool calls (primary) and REST fallback endpoints (`POST /render`, `POST /clear`, `GET /export`, `POST /step`) | v0.1 |
| F2 | Support rendering types: Mermaid, SVG, HTML, KaTeX, Vega-Lite. D2 deferred (requires server-side render process). | v0.1 |
| F3 | Full-spec replace: agent always sends the complete updated spec; per-element mutation deferred to planned | v0.1 |
| F3a | Validation is a hard gate: invalid payloads are rejected and returned as `{ ok: false, error: "..." }` to the agent; nothing is pushed to the browser and canvas state is unchanged | v0.1 |
| F4 | REST endpoints are `curl`-friendly fallbacks for agents that do not support MCP and for manual debugging. They mirror the MCP tool surface for core operations (`POST /render`, `POST /clear`, `GET /export`, `POST /step`) but do not expose every MCP feature. Primary path is MCP → WebSocket `/stream`. `POST /wait-click` accepts an optional `node_actions` body (`Record<string, string[]>`); the server broadcasts it to the browser via `set_node_actions` so the popup menu appears for registered nodes — same behaviour as the MCP `wait_click(node_actions)` tool. Invalid `node_actions` returns `{ ok: false, error: "..." }` with 400. | v0.1 |
| F5 | Session management with cross-session persistence (`session_id`, history across restarts) | planned |
| F7 | Slideshow: `POST /slideshow` (and `slideshow()` MCP tool) accepts `{ slides: [{ type, payload, title? }], delay_ms }`. Validation (same hard gate as `POST /render`): each slide's `type` and `payload` are validated; `title` (if present) must be a string; if *any* slide fails validation, the entire slideshow request is rejected with `{ ok: false, error: "..." }` and no timer starts. On success, a server-side timer auto-advances the canvas. Each slide is broadcast to the browser using the **same WebSocket event format** that `POST /render` would produce for that slide's type. For `step-frames` slides, the server **expands each frame into a separate timer tick**: each frame is broadcast in sequence at `delay_ms` intervals (frame 0 immediately, frame 1 after one tick, frame 2 after two ticks, etc.) — the same format as `POST /render` produces for each frame (`{ type: frame_type, payload: frames[N].payload, stepFrames: true, currentFrame: N, totalFrames: M, title?: frame_label }`). Frame labels (from `frames[N].label` in the step-frames payload) are shown as title overlays during auto-advance; the original slideshow slide's `title` is not used during frame ticks. Manual Prev/Next navigation remains functional during and after the slideshow. A new call cancels any running slideshow; `POST /render` and `POST /clear` also cancel it. At most one active slideshow at a time. ✅ Implemented in Sprint 9 (2026-05-31). | v0.2 |
| F8 | Slideshow stop: `POST /slideshow/stop` (and `slideshow_stop()` MCP tool) cancels the running timer; last rendered slide remains on screen. No-op if no slideshow is running. Note: `POST /render` and `POST /clear` also cancel any running slideshow (canvas ownership transfers to agent). `POST /step` and `POST /seek` do not cancel slideshow. | v0.2 |
| F9 | Done signal: `POST /user-done` (browser button) wakes all pending `wait_done()` MCP tool calls via an in-process EventEmitter. `POST /wait-done` (REST) long-polls until the signal fires or the 10-minute timeout elapses. Multiple concurrent `wait_done()` calls are all resolved simultaneously by a single click. | v0.2 ✅ |
| F6 | HTML/SVG payloads must be sanitized with DOMPurify in the browser before render; sanitization is silent (cleaned output rendered, no error state). No server-side hard gate for HTML/SVG — the `type` field is validated but the payload is passed through. | v0.1 |
| F10 | **Render snapshot persistence:** after every successful `render()` call (i.e. payload passes validation), the server writes a JSON snapshot file to `<snapshots_dir>/<workspace>/<timestamp>_screen.json`. Snapshot schema: `{ "timestamp": "<ISO 8601>", "workspace": "<name>", "type": "<renderer type>", "payload": "<verbatim payload>", "options": { … } }`. `options` is the options object passed to `render()`; omitted if absent. `step()`, `seek()`, `clear()`, and failed `render()` calls do not produce snapshot files. Snapshot directory root defaults to `~/.agent-whiteboard/`; overridable via `WHITEBOARD_SNAPSHOTS_DIR` env var (for testing and custom setups). Workspace is always supplied by the agent via `options.workspace` (mandatory since v0.7); no env var or implicit derivation. Directory is created if it does not exist (`mkdir -p` semantics). A write failure must never block rendering — the server logs a warning to stderr and continues. No read/resume API in v1 of this feature (write-only). | v0.3 |
| F11 | **Snapshot list endpoint:** `GET /snapshots` — returns the list of snapshot files for the current workspace, sorted by timestamp descending. Response: `{ ok: true, snapshots: [{ filename, timestamp, type, title? }] }`. `title` is included only if `options.title` was present and non-empty in the snapshot file. Returns an empty array if no snapshots exist or the snapshot directory is absent. Snapshot directory root read from `WHITEBOARD_SNAPSHOTS_DIR` env var (or `~/.agent-whiteboard/` default). Current workspace is `lastWorkspace` — the workspace from the most recent successful `render()` call in the session (G2c). Unreadable or malformed snapshot files are skipped with a warning to stderr. | v0.4 |
| F12 | **Snapshot load endpoint:** `POST /snapshots/load` — body: `{ "filename": "…" }` (current workspace) or `{ "filename": "…", "workspace": "…" }` (explicit workspace). Filename safety check: must match `*_screen.json`, no `/` or `..`. Workspace safety check (when provided): must be a plain directory name — no path separators, no `..`, no null bytes; must resolve to a directory that exists under `WHITEBOARD_SNAPSHOTS_DIR`. If `workspace` is omitted, defaults to the current workspace. Server reads the snapshot file, validates its payload (same hard gate as `POST /render`), broadcasts to the browser via WebSocket, and updates in-memory canvas state. **Write-silent:** does NOT call `saveSnapshot()`. **v0.10:** on success, updates `lastWorkspace` to the workspace of the loaded snapshot (see H6). Returns `{ ok: true }` on success; `{ ok: false, error: "…" }` if the file is not found, either path-safety check fails, or payload validation fails. Cross-workspace load enabled (v0.5). | v0.4 / v0.5 / lastWorkspace update v0.10 |
| F13 | **All-workspaces snapshot list:** `GET /snapshots/all` — scans every subdirectory of `WHITEBOARD_SNAPSHOTS_DIR`, reads each workspace's snapshots, and returns them grouped. Response: `{ ok: true, workspaces: [{ name, isCurrent, snapshots: [{ filename, timestamp, type, title? }] }] }`. Each workspace's snapshot list is sorted newest-first. `isCurrent: true` for the workspace matching `lastWorkspace` — the in-memory variable updated on every successful `render()` call (G2c decision, v0.7). Workspaces with no readable snapshots are omitted. Returns `{ ok: true, workspaces: [] }` if root absent. | v0.5 |
| F14 | **Mandatory workspace in render():** (FR4, v0.7, breaking change from v0.6) `render()` MCP tool and `POST /render` REST endpoint require `options.workspace` string — the field is **not optional**. If absent, the server returns `{ ok: false, error: "workspace is required" }` and writes no snapshot. The three-level fallback chain (`options.workspace` → `WHITEBOARD_WORKSPACE` env var → `basename(process.cwd())`) is **removed**. Workspace name must pass the same safety check as F12 (alphanumeric, dashes, underscores, dots, spaces; no path separators or `..`). Snapshot is written to `~/.agent-whiteboard/<workspace>/<timestamp>_screen.json`. `WHITEBOARD_WORKSPACE` env var is deprecated and removed — the server no longer reads it. `WHITEBOARD_SNAPSHOTS_DIR` env var is retained. | v0.6 (optional) → v0.7 (required) |
| F15 | **Incremental step-frames creation:** three-tool protocol for building complex step-frames sequences one frame at a time instead of in a single large payload. See MCP Tool Surface table for `init_step_frames`, `append_frame`, `commit_step_frames`. REST fallback endpoints: `POST /step-frames/init`, `POST /step-frames/:id/frame`, `POST /step-frames/:id/commit`. Partial sequences expire after 30 minutes of inactivity (no `append_frame` or `commit_step_frames` call) and are silently deleted server-side. An expired ID returns `{ ok: false, error: "step-frames session not found or expired" }`. Multiple concurrent builds (each with a distinct ID) are supported. Frame payload validation at `append_frame()` time uses the same hard gate as `render()` — invalid frames are rejected and the agent must fix and retry that frame without restarting the sequence. `commit_step_frames()` with zero frames returns `{ ok: false, error: "cannot commit empty step-frames sequence" }`. `commit_step_frames()` cancels any running slideshow (same as `render()`). `clear()` does NOT cancel in-progress builder entries — the TTL handles cleanup; the agent may call `append_frame()` and `commit_step_frames()` after `clear()` and the committed diagram will replace the blank canvas. After commit, `export()` returns the assembled full step-frames JSON. **v0.9 change:** `append_frame()` now pushes the accumulated partial step-frames to the browser after each valid append (live preview, positioned at the latest frame); `commit_step_frames()` handles finalization only (snapshot write, in-memory state update, slideshow cancel, builder cleanup). The REST endpoint `POST /step-frames/:id/frame` mirrors this change (pushes to browser). | v0.8; live preview v0.9 |

| F16 | **Export by graph ID (FR7, v0.11 planned):** `render()` and `commit_step_frames()` return `{ ok: true, id: "<uuid>" }` — the UUID of the snapshot written for that call. The UUID is generated at snapshot write time and stored as an `id` field in the snapshot JSON. `export(id?)` MCP tool and `GET /export` REST endpoint accept an optional `id` parameter; when provided, the server scans snapshot files under `WHITEBOARD_SNAPSHOTS_DIR` for a file whose `id` field matches, and returns its `payload`. If not found: `{ ok: false, error: "graph not found" }`. Old snapshots without an `id` field are not addressable by this mechanism. When `id` is absent: existing behavior (returns current in-memory canvas state). | v0.11 planned |

### Rendering & Visualization

| ID | Requirement | Phase |
|----|-------------|-------|
| V1 | Render Mermaid diagrams with auto-refresh, zoom/pan | v0.1 |
| V1a | If the browser renderer fails (e.g. Mermaid.js throws), display the error message inline on the canvas in place of the diagram | v0.1 |
| V2 | Export: source text via `export()` — verbatim last `render()` payload, all content types | v0.1 |
| V2a | Title overlay: `options.title` in `render()` displays a label above the canvas for all renderer types; hidden when absent or after `clear()`; not included in `export()` output | v0.1 |
| V3 | Support SVG/HTML, Vega-Lite, KaTeX renderers | v0.1 |
| V3b | Support D2 renderer | planned (requires server-side render process) |
| V4 | Export: PNG/SVG/PDF download | planned |
| V5 | Step-through mode: agent sends ordered frame array; `step(direction)` advances/rewinds | v0.1 |
| V6 | Visual history: navigable snapshots (timeline or thumbnails) | planned |

### Interactivity & UX

| ID | Requirement | Phase |
|----|-------------|-------|
| U1 | Zero-config startup: one command launches server, opens browser, starts listening | v0.1 |
| U2 | CLI-friendly invocation: `curl -X POST …` or thin wrapper script | v0.1 |
| U2a | WebSocket disconnect: browser clears the canvas and displays "Server disconnected. Restart `npm run dev`." No auto-retry. Pending `wait_done()` and `wait_click()` operations are unaffected server-side — they continue waiting until their normal 10-minute timeout elapses, since the server cannot detect that the browser disconnected in time to signal them sooner. The agent can reconnect and re-arm as needed. | v0.1 |
| U3 | Terminal ASCII fallback if no browser available | planned |
| U4a | Done button: fires `POST /user-done`; shows "Sent ✓" for 2s after click. **v0.10:** button moved to right side panel (U7d); icon replaces text label. | v0.2 ✅; moved to panel v0.10 |
| U4b | Node/edge click detection: while `wait_click()` is armed, Mermaid diagram nodes and edges are click-interactive; clicked element is identified and reported back to agent via `wait_click()` return value. Primary support: `graph`/`flowchart` diagrams reliably extract source node IDs. Secondary support ("best-effort"): `sequenceDiagram` and `erDiagram` use auto-generated numeric IDs; click events return these opaque IDs, not human-readable source node names. Other diagram types may support clicks depending on their SVG structure; unsupported clicks are silently ignored. Only one `wait_click()` can be active at a time; a second `wait_click()` call cancels the previous one without error. | v0.2 |
| U4c | Popup action menu: when `wait_click()` is called with `node_actions`, nodes with registered actions show a popup menu on click; user selects an action; selection is included in the `wait_click()` response. Nodes without registered actions in the map accept a plain click (no popup). | v0.2 |
| U4d | Click state feedback: while `wait_click()` is armed, nodes and edges are visually indicated as clickable. Nodes show a blue outline (`#3498db`, 2px solid with 2px offset); cursor changes to `pointer` on all clickable elements. Highlighting is applied as a CSS class and inline cursor style; state is cleared after click resolves or on timeout. | v0.2 |
| U4e | Autonomous frame navigation (`node_to_frame`): when `render(type="step-frames", options.node_to_frame={...})` is called, browser attaches click listeners automatically; clicking a mapped node jumps directly to its frame via `POST /seek` without agent involvement. `wait_click()` disables `node_to_frame` for the duration of its call; after `wait_click()` resolves or times out, `node_to_frame` is **not** automatically restored — the agent must call `render()` again with the map to re-enable autonomous navigation. | v0.2 ✅ |
| U5 | Structured input widgets (quiz, sliders, drag-to-order); events returned to agent | planned |
| U6 | Theme control: agent sets theme via `options.theme` in `render()`; user can also toggle it in the browser UI | planned |
| U7 | History panel: hidden by default; toggled via a history icon button in the browser UI. When open: shows a scrollable list of past snapshots sorted newest-first (each row: human-friendly timestamp, type badge, title or "—" if absent). Clicking a row calls `POST /snapshots/load`, closes the panel, and renders the selected snapshot on the canvas. Panel must not obscure the canvas when closed. | v0.4 |
| U7a | History panel — workspace accordion: fetches `GET /snapshots/all` instead of `GET /snapshots`. Renders an accordion: one collapsible section per workspace. The current workspace section is auto-expanded when the panel opens; all others are collapsed. Each snapshot row within a section is identical to U7. Clicking a row from any workspace calls `POST /snapshots/load` with `{ workspace, filename }`. | v0.5 |
| U7b | History panel — lock/unlock toggle: a small toggle button in the panel header controls auto-close behavior. **Unlocked (default):** clicking a snapshot loads it and closes the panel (current behavior). **Locked:** clicking a snapshot loads it but the panel stays open, allowing the user to browse and load multiple entries without reopening. Lock state persists for the lifetime of the panel (cleared when panel is closed). | v0.10 |
| U7c | History panel — workspace set on load: after a successful `POST /snapshots/load`, the server updates `lastWorkspace` to the workspace of the loaded snapshot. The history panel's auto-expanded section reflects the new current workspace on the next open. | v0.10 |
| U7d | Right-side controls panel: a small fixed panel on the right edge of the viewport contains the history toggle button and the Done button. Replaces the footer-based placement from v0.2–v0.9. The panel is always visible and does not occlude the main canvas. Done button displays an icon (no text label); tooltip on hover shows "Done". History button retains its existing icon. | v0.10 |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NF1 | Single binary or minimal-dependency script (Node.js); no heavy install |
| NF2 | Communication localhost-only by default (port `3000`); binding address and port configurable via env vars; no telemetry; sandboxed rendering |
| NF3 | Cross-platform: macOS, Linux, Windows |
| NF4 | `<200ms` render for diagrams under 500 nodes; debounce on stream |
| NF5 | Plugin/extension system for new renderer types | planned |
| NF6 | Resource limits: no artificial hard limits in v1 (constrained only by Node.js memory and browser rendering capacity). Server validation rejects malformed payloads, but does not enforce maximum sizes. Future phases may add quotas. |
| NF7 | `node_actions` server validation: server validates `node_actions` is a `Record<string, string[]>` (map of node ID → string array); on failure, returns `{ ok: false, error: "..." }`. Does **not** validate that node IDs exist in the diagram (agent is responsible for correctness). |

---

## 5b. Tool Error Scenarios

**Agent error recovery:** The agent is responsible for deciding how to handle errors returned by the server. The server returns `{ ok: false, error: "<message>" }` for validation failures and certain invalid states; the agent can inspect the error and retry, recover, or fail gracefully.

| Tool | Success response | Error cases |
|------|------------------|------------|
| `render()` | `{ ok: true }` | Invalid payload (keyword, syntax, JSON, format) → `{ ok: false, error: "..." }` |
| `clear()` | `{ ok: true }` | Never fails (always succeeds) |
| `export()` | `{ ok: true, data: "<source>" }` | Never fails; returns empty string if canvas is blank |
| `step()` | `{ ok: true, current_frame: N, total_frames: M }` | No step-frames loaded → `{ ok: false, error: "..." }`. Direction invalid → `{ ok: false, error: "..." }` |
| `seek()` | `{ ok: true, current_frame: N, total_frames: M }` | No step-frames loaded → `{ ok: false, error: "..." }`. Frame out of range → `{ ok: false, error: "..." }` |
| `wait_done()` | `{ ok: true }` | Never fails; times out after 10 minutes (returns `{ ok: true }` regardless) |
| `wait_click()` | `{ ok: true, type, id, label, action }` (`action` always present: null when no popup shown, string when menu item selected) or `{ ok: true, type: "timeout" }` | Never fails; times out after 10 minutes; on timeout, returns `{ ok: true, type: "timeout" }` |
| `slideshow()` | `{ ok: true }` | Any slide fails validation → `{ ok: false, error: "..." }` (entire slideshow rejected, no timer started) |
| `slideshow_stop()` | `{ ok: true }` | Never fails; no-op if no slideshow running |
| `init_step_frames()` | `{ ok: true, id: "<uuid>" }` | Unsupported `frame_type` → `{ ok: false, error: "..." }`. Missing/invalid `workspace` → `{ ok: false, error: "..." }`. |
| `append_frame()` | `{ ok: true, frame_count: N }` | Unknown/expired ID → `{ ok: false, error: "step-frames session not found or expired" }`. Invalid payload → `{ ok: false, error: "..." }`. |
| `commit_step_frames()` | `{ ok: true }` | Unknown/expired ID → `{ ok: false, error: "step-frames session not found or expired" }`. Zero frames → `{ ok: false, error: "cannot commit empty step-frames sequence" }`. |

**Error recovery strategies:**
- Invalid render payload: agent can inspect the error and either fix the syntax or escalate to the user
- Step out of range: agent should clamp to `[0, totalFrames-1]` or inform the user
- No step-frames loaded: agent attempted to step/seek without first loading a step-frames sequence; check render history or render a sequence before step/seek
- Slideshow validation fails: check the error message for which slide failed; agent can fix that slide and retry the entire slideshow

---

## 6. Out of Scope for v1

- Multiple named panels/tabs: planned (one canvas at a time in v1)
- Terminal ASCII fallback: planned (browser always assumed available in v1)
- Node/edge click interactions (`wait_click()`): shipped in v0.2 (Sprints 12–14). Basic "user is done" signal (`wait_done()` + Done button) shipped in Sprint 10.
- Slider/quiz widgets → agent: planned (after node clicks).
- Cross-session persistence / history across restarts: write-only snapshot persistence shipped in v0.3 (F10); user-facing history browser (read/navigate) shipping in v0.4 (F11–F12, U7). Agent-facing history query (MCP tool to list or reload past sessions) remains planned.
- Binary export (PNG/SVG/PDF): planned
- D2 renderer: planned (requires server-side render process)
- Concurrent browser connections / multi-tab state sync: planned (second tab starts blank in v1)
- WebSocket reconnection state replay: planned — on disconnect the browser clears the canvas and displays "Server disconnected. Restart `npm run dev`." No auto-retry in v1.
- Free-form canvas / whiteboard drawing: deferred (nice-to-have)
- Agent error-recovery behavior: out of scope — the server returns `{ ok: false, error: "..." }` and the agent decides what to do with it
- Multi-user support: planned (deferred; requires auth, session isolation, and remote deployment groundwork)
- Remote/cloud deployment: planned (deferred; local-only through v0.3)
- Non-developer users: not in scope
- Non-Claude Code agent runtimes: planned
- Slideshow / auto-play (`slideshow()`, `slideshow_stop()`): shipped in v0.2
