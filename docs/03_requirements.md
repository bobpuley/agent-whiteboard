# Requirements

> Built incrementally from `01_input-ideas.md` and confirmed decisions in `02_assumptions-and-risks.md`.
> Milestone tags: **v0.1** = Core Whiteboard (Sprints 0–8), **v0.2** = Bidirectionality (Sprints 9–14), **v0.3** = Observability & Infrastructure (Sprints 15–16), **planned** = future scope not yet assigned to a milestone.

---

## 1. MCP Tool Surface

The MCP server exposes tools to the agent.

| Tool | Signature | Description | Phase |
|------|-----------|-------------|-------|
| `render` | `render(type, payload[, options])` | Push content to the canvas. `type` selects the renderer (e.g. `"mermaid"`). Always replaces the current canvas state in v1. `options.title` (optional string) displays a label above the canvas. `options.theme` and action-variant options deferred to planned. `options.node_to_frame` (v0.2, Sprint 13) — only for `step-frames`: declarative node ID → frame index map; browser navigates frames on click autonomously. | v0.1 |
| `clear` | `clear()` | Reset the current session canvas. | v0.1 |
| `export` | `export()` | Return the current canvas source spec. Response: `{ "ok": true, "data": "<source>" }` — `data` is the verbatim last payload passed to `render()`, for all content types. Empty string if canvas is empty or cleared. Binary export is planned. | v0.1 |
| `step` | `step(direction)` | Advance (`"next"`) or rewind (`"prev"`) a step-through sequence. | v0.1 |
| `slideshow` | `slideshow(slides, delay_ms)` | Load a playlist of slides (`[{ type, payload, title? }]`) and auto-advance the canvas on a server-side timer at `delay_ms` intervals. A new call cancels any running slideshow. | v0.2 |
| `slideshow_stop` | `slideshow_stop()` | Cancel the running slideshow timer; last rendered slide remains on screen. | v0.2 |
| `wait_done` | `wait_done()` | Block until the user clicks the Done button in the browser. Returns `{ "ok": true }` when the user signals they are ready to continue. Times out after 10 minutes (returns `{ "ok": true }` regardless). Intended usage: `render(...)` → `wait_done()` → continue lesson. | v0.2 ✅ |
| `seek` | `seek(frame)` | Jump the step-frame cursor to an arbitrary frame index without repeated `step()` calls. Returns `{ "ok": true, "current_frame": N, "total_frames": M }`. Error if no `step-frames` sequence is loaded or frame is out of range. | v0.2 |
| `wait_click` | `wait_click([node_actions])` | Arm the browser for a single node or edge click on the current Mermaid diagram (plain or step-frames). Applies to `graph`/`flowchart` diagrams; other Mermaid types are best-effort. Optional `node_actions` (Sprint 14): map of node ID → string array; browser shows a popup menu for nodes with registered actions; user selects one. Returns `{ "ok": true, "type": "node"\|"edge", "id": "<id>", "label": "<label>", "action": "<chosen action or null>" }` (action field always present; null when no menu was shown or user clicked without selecting; string value when `node_actions` was provided and user selected an item). On timeout after 10 minutes: `{ "ok": true, "type": "timeout" }`. Usage: `render(...)` → `wait_click(node_actions?)` → agent handles click result. | v0.2 |

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
| V6 | Visual history | Navigable snapshots (timeline or thumbnails) | planned |

---

## 3. Transport

| Layer | Mechanism | Role |
|-------|-----------|------|
| Agent → Server | MCP (primary) | Agent calls tools; server executes render commands |
| Server → Browser | WebSocket (`/stream`) | Incremental, real-time updates pushed to the SPA |
| Agent → Server (alt) | REST `POST /render`, `POST /clear`, `GET /export`, `POST /step`, `POST /seek`, `POST /slideshow`, `POST /slideshow/stop`, `POST /wait-done`, `POST /wait-click` | Low-level fallback; also usable via `curl` for debugging. `POST /slideshow` and `POST /slideshow/stop` added in v0.2 alongside the slideshow MCP tools. `POST /step` body: `{ "direction": "next" \| "prev" }`. `POST /seek` body: `{ "frame": N }`; jumps step-frame cursor, returns `{ ok: true, current_frame: N, total_frames: M }` or error. `POST /wait-done` long-polls until the user clicks Done. `POST /wait-click` long-polls until a node/edge click; broadcasts `set_node_actions enabled:true` before suspending and `enabled:false` after resolution. |
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
| F10 | **Render snapshot persistence:** after every successful `render()` call (i.e. payload passes validation), the server writes a JSON snapshot file to `<snapshots_dir>/<workspace>/<timestamp>_screen.json`. Snapshot schema: `{ "timestamp": "<ISO 8601>", "workspace": "<name>", "type": "<renderer type>", "payload": "<verbatim payload>", "options": { … } }`. `options` is the options object passed to `render()`; omitted if absent. `step()`, `seek()`, `clear()`, and failed `render()` calls do not produce snapshot files. Snapshot directory root defaults to `~/.agent-whiteboard/`; overridable via `WHITEBOARD_SNAPSHOTS_DIR` env var (for testing and custom setups). Workspace name defaults to `basename(process.cwd())`; overridable via `WHITEBOARD_WORKSPACE` env var. Directory is created if it does not exist (`mkdir -p` semantics). A write failure must never block rendering — the server logs a warning to stderr and continues. No read/resume API in v1 of this feature (write-only). | v0.3 |

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
| U4a | Done button: always-visible button (bottom-right); fires `POST /user-done`; shows "Sent ✓" for 2s after click | v0.2 ✅ |
| U4b | Node/edge click detection: while `wait_click()` is armed, Mermaid diagram nodes and edges are click-interactive; clicked element is identified and reported back to agent via `wait_click()` return value. Primary support: `graph`/`flowchart` diagrams reliably extract source node IDs. Secondary support ("best-effort"): `sequenceDiagram` and `erDiagram` use auto-generated numeric IDs; click events return these opaque IDs, not human-readable source node names. Other diagram types may support clicks depending on their SVG structure; unsupported clicks are silently ignored. Only one `wait_click()` can be active at a time; a second `wait_click()` call cancels the previous one without error. | v0.2 |
| U4c | Popup action menu: when `wait_click()` is called with `node_actions`, nodes with registered actions show a popup menu on click; user selects an action; selection is included in the `wait_click()` response. Nodes without registered actions in the map accept a plain click (no popup). | v0.2 |
| U4d | Click state feedback: while `wait_click()` is armed, nodes and edges are visually indicated as clickable. Nodes show a blue outline (`#3498db`, 2px solid with 2px offset); cursor changes to `pointer` on all clickable elements. Highlighting is applied as a CSS class and inline cursor style; state is cleared after click resolves or on timeout. | v0.2 |
| U4e | Autonomous frame navigation (`node_to_frame`): when `render(type="step-frames", options.node_to_frame={...})` is called, browser attaches click listeners automatically; clicking a mapped node jumps directly to its frame via `POST /seek` without agent involvement. `wait_click()` disables `node_to_frame` for the duration of its call; after `wait_click()` resolves or times out, `node_to_frame` is **not** automatically restored — the agent must call `render()` again with the map to re-enable autonomous navigation. | v0.2 ✅ |
| U5 | Structured input widgets (quiz, sliders, drag-to-order); events returned to agent | planned |
| U6 | Theme control: agent sets theme via `options.theme` in `render()`; user can also toggle it in the browser UI | planned |

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
- Cross-session persistence / history across restarts: planned
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
