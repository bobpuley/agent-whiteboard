# Requirements

> Built incrementally from `01_input-ideas.md` and confirmed decisions in `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. MCP Tool Surface

The MCP server exposes tools to the agent.

| Tool | Signature | Description | Phase |
|------|-----------|-------------|-------|
| `render` | `render(type, payload[, options])` | Push content to the canvas. `type` selects the renderer (e.g. `"mermaid"`). Always replaces the current canvas state in v1. `options.title` (optional string) displays a label above the canvas. `options.theme` and action-variant options deferred to Phase 2. `options.node_to_frame` (Phase 2, Sprint 13) — only for `step-frames`: declarative node ID → frame index map; browser navigates frames on click autonomously. | MVP |
| `clear` | `clear()` | Reset the current session canvas. | MVP |
| `export` | `export()` | Return the current canvas source spec. Response: `{ "ok": true, "data": "<source>" }` — `data` is the verbatim last payload passed to `render()`, for all content types. Empty string if canvas is empty or cleared. Binary export is Phase 2. | MVP |
| `step` | `step(direction)` | Advance (`"next"`) or rewind (`"prev"`) a step-through sequence. | MVP |
| `slideshow` | `slideshow(slides, delay_ms)` | Load a playlist of slides (`[{ type, payload, title? }]`) and auto-advance the canvas on a server-side timer at `delay_ms` intervals. A new call cancels any running slideshow. | Phase 2 |
| `slideshow_stop` | `slideshow_stop()` | Cancel the running slideshow timer; last rendered slide remains on screen. | Phase 2 |
| `wait_done` | `wait_done()` | Block until the user clicks the Done button in the browser. Returns `{ "ok": true }` when the user signals they are ready to continue. Times out after 10 minutes (returns `{ "ok": true }` regardless). Intended usage: `render(...)` → `wait_done()` → continue lesson. | Phase 2 (Sprint 10 ✅) |
| `seek` | `seek(frame)` | Jump the step-frame cursor to an arbitrary frame index without repeated `step()` calls. Returns `{ "ok": true, "current_frame": N, "total_frames": M }`. Error if no `step-frames` sequence is loaded or frame is out of range. | Phase 2 |
| `wait_click` | `wait_click([node_actions])` | Arm the browser for a single node or edge click on the current Mermaid diagram (plain or step-frames). Applies to `graph`/`flowchart` diagrams; other Mermaid types are best-effort. Optional `node_actions` (Sprint 14): map of node ID → string array; browser shows a popup menu for nodes with registered actions; user selects one. Returns `{ "ok": true, "type": "node"\|"edge", "id": "<id>", "label": "<label>", "action": "<chosen action>" }` (`action` present only when `node_actions` was provided and user selected one). On timeout after 10 minutes: `{ "ok": true, "type": "timeout" }`. Usage: `render(...)` → `wait_click(node_actions?)` → agent handles click result. | Phase 2 |

---

## 2. Rendering Capabilities

> Content types the renderer must support, in priority order.

| ID | Type | Format | Phase |
|----|------|--------|-------|
| V1 | Diagrams | Mermaid | MVP |
| V2 | Export — text | Returns verbatim last `render()` payload as text (all content types) | MVP |
| V3 | SVG / HTML; Data charts; Math | Inline SVG; HTML+CSS; Vega-Lite JSON; LaTeX / KaTeX | MVP |
| V3b | Diagrams | D2 | Post-Phase-2 (requires server-side render process) |
| V4 | Export — binary | PNG / SVG / PDF download | Phase 2 |
| V5 | Step-through frames | Ordered frame arrays; agent-driven transitions via `step()` | MVP |
| V6 | Visual history | Navigable snapshots (timeline or thumbnails) | Phase 2 |

---

## 3. Transport

| Layer | Mechanism | Role |
|-------|-----------|------|
| Agent → Server | MCP (primary) | Agent calls tools; server executes render commands |
| Server → Browser | WebSocket (`/stream`) | Incremental, real-time updates pushed to the SPA |
| Agent → Server (alt) | REST `POST /render`, `POST /clear`, `GET /export`, `POST /step`, `POST /seek`, `POST /slideshow`, `POST /slideshow/stop`, `POST /wait-done`, `POST /wait-click` | Low-level fallback; also usable via `curl` for debugging. `POST /slideshow` and `POST /slideshow/stop` added in Phase 2 alongside the slideshow MCP tools. `POST /wait-done` long-polls until the user clicks Done. `POST /seek` (Sprint 13): body `{ "frame": N }`; jumps step-frame cursor, returns same shape as `step()`. `POST /wait-click` (Sprint 12): long-polls until a node/edge click; note: must also broadcast `set_node_actions enabled:true` before suspending (bug fix pending — see `05`). |
| Browser → Server | `POST /user-done` | Browser Done button fires this; server calls `signalDone()` to wake any pending `wait_done()` calls, then optionally forwards to the channel relay. |
| Browser → Server | `POST /node-click` | Browser fires when user clicks a node or edge (while `wait_click()` is armed). Body: `{ type: "node"\|"edge", id, label, action? }`. Server calls `signalClick(event)` to resolve pending `wait_click()` calls. Returns `{ ok: true }`. |
| Server → Browser (WebSocket) | `{ action: "set_node_actions", node_actions, enabled }` | Sent when `wait_click()` is called. `node_actions`: map of node ID → string array (empty map = any click accepted, no popup). `enabled: true` arms the click listener; `enabled: false` disarms it (sent after click resolves or on timeout). |

File-system watch (`CLAUDE_SCREEN.md`) is **dropped** — superseded by MCP.

---

## 4. Session Model

- Sessions are **in-memory**, scoped to a single focused explanation.
- `clear()` resets the canvas; server restart clears everything.
- No cross-session persistence in v1 — deferred to Phase 2.
- The agent is stateless with respect to the whiteboard: it sends commands forward-only and keeps its own record in the terminal (Mermaid source, JSON spec printed alongside the render).

---

## 5. Functional Requirements

### Communication & Integration

| ID | Requirement | Phase |
|----|-------------|-------|
| F1 | Accept content via MCP tool calls (primary) and REST fallback endpoints (`POST /render`, `POST /clear`, `GET /export`, `POST /step`) | MVP |
| F2 | Support rendering types: Mermaid, SVG, HTML, KaTeX, Vega-Lite. D2 deferred (requires server-side render process). | MVP |
| F3 | Full-spec replace: agent always sends the complete updated spec; per-element mutation deferred to Phase 2 | MVP |
| F3a | Validation is a hard gate: invalid payloads are rejected and returned as `{ ok: false, error: "..." }` to the agent; nothing is pushed to the browser and canvas state is unchanged | MVP |
| F4 | REST endpoints (`POST /render`, `POST /clear`, `GET /export`, `POST /step`) are a fallback for agents that do not support MCP/WebSocket (e.g. `curl` testing). Primary path is MCP → WebSocket `/stream`. | MVP |
| F5 | Session management with cross-session persistence (`session_id`, history across restarts) | Phase 2 |
| F7 | Slideshow: `POST /slideshow` (and `slideshow()` MCP tool) accepts `{ slides: [{ type, payload, title? }], delay_ms }`, validates each slide (same rules as `POST /render`), starts a server-side timer that auto-advances the canvas. Each slide is broadcast to the browser using the **same WebSocket event format** that `POST /render` would produce for that slide's type. For `step-frames` slides, the server **expands each frame into a separate timer tick**: each frame is broadcast in sequence at `delay_ms` intervals (frame 0 immediately, frame 1 after one tick, frame 2 after two ticks, etc.) — the same format as `POST /render` produces for each frame (`{ type: frame_type, payload: frames[N].payload, stepFrames: true, currentFrame: N, totalFrames: M }`). Manual Prev/Next navigation remains functional during and after the slideshow. A new call cancels any running slideshow; `POST /render` and `POST /clear` also cancel it. At most one active slideshow at a time. | Phase 2 |
| F8 | Slideshow stop: `POST /slideshow/stop` (and `slideshow_stop()` MCP tool) cancels the running timer; last rendered slide remains on screen. No-op if no slideshow is running. | Phase 2 |
| F9 | Done signal: `POST /user-done` (browser button) wakes all pending `wait_done()` MCP tool calls via an in-process EventEmitter. `POST /wait-done` (REST) long-polls until the signal fires or the 10-minute timeout elapses. Multiple concurrent `wait_done()` calls are all resolved simultaneously by a single click. | Phase 2 (Sprint 10 ✅) |
| F6 | HTML/SVG payloads must be sanitized with DOMPurify in the browser before render; sanitization is silent (cleaned output rendered, no error state). No server-side hard gate for HTML/SVG — the `type` field is validated but the payload is passed through. | MVP |

### Rendering & Visualization

| ID | Requirement | Phase |
|----|-------------|-------|
| V1 | Render Mermaid diagrams with auto-refresh, zoom/pan | MVP |
| V1a | If the browser renderer fails (e.g. Mermaid.js throws), display the error message inline on the canvas in place of the diagram | MVP |
| V2 | Export: source text via `export()` — verbatim last `render()` payload, all content types | MVP |
| V2a | Title overlay: `options.title` in `render()` displays a label above the canvas for all renderer types; hidden when absent or after `clear()`; not included in `export()` output | MVP |
| V3 | Support SVG/HTML, Vega-Lite, KaTeX renderers | MVP |
| V3b | Support D2 renderer | Post-Phase-2 (requires server-side render process) |
| V4 | Export: PNG/SVG/PDF download | Phase 2 |
| V5 | Step-through mode: agent sends ordered frame array; `step(direction)` advances/rewinds | MVP |
| V6 | Visual history: navigable snapshots (timeline or thumbnails) | Phase 2 |

### Interactivity & UX

| ID | Requirement | Phase |
|----|-------------|-------|
| U1 | Zero-config startup: one command launches server, opens browser, starts listening | MVP |
| U2 | CLI-friendly invocation: `curl -X POST …` or thin wrapper script | MVP |
| U2a | WebSocket disconnect: browser clears the canvas and displays "Server disconnected. Restart `npm run dev`." No auto-retry. | MVP |
| U3 | Terminal ASCII fallback if no browser available | Phase 2 |
| U4a | Done button: always-visible button (bottom-right); fires `POST /user-done`; shows "Sent ✓" for 2s after click | Phase 2 (Sprint 10 ✅) |
| U4b | Node/edge click detection: while `wait_click()` is armed, Mermaid diagram nodes and edges are click-interactive; clicked element is identified and reported back to agent via `wait_click()` return value. Applies to `graph`/`flowchart` diagrams; other Mermaid types best-effort. | Phase 2 |
| U4c | Popup action menu: when `wait_click()` is called with `node_actions`, nodes with registered actions show a popup menu on click; user selects an action; selection is included in the `wait_click()` response. Nodes without registered actions in the map accept a plain click (no popup). | Phase 2 |
| U4d | Click state feedback: while `wait_click()` is armed, nodes/edges are visually highlighted (cursor, border, or opacity) to indicate they are clickable. State is cleared after click resolves or on timeout. | Phase 2 |
| U4e | Autonomous frame navigation (`node_to_frame`): when `render(type="step-frames", options.node_to_frame={...})` is called, browser attaches click listeners automatically; clicking a mapped node jumps directly to its frame via `POST /seek` without agent involvement. `wait_click()` overrides `node_to_frame` for the duration of its call. | Phase 2 (Sprint 13) |
| U5 | Structured input widgets (quiz, sliders, drag-to-order); events returned to agent | Phase 2 |
| U6 | Theme control: agent sets theme via `options.theme` in `render()`; user can also toggle it in the browser UI | Phase 2 |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NF1 | Single binary or minimal-dependency script (Node.js); no heavy install |
| NF2 | Communication localhost-only by default (port `3000`); binding address and port configurable via env vars; no telemetry; sandboxed rendering |
| NF3 | Cross-platform: macOS, Linux, Windows |
| NF4 | `<200ms` render for diagrams under 500 nodes; debounce on stream |
| NF5 | Plugin/extension system for new renderer types | Post-Phase-2 |

---

## 6. Out of Scope for v1

- Multiple named panels/tabs: Phase 2 (one canvas at a time in v1)
- Terminal ASCII fallback: Phase 2 (browser always assumed available in v1)
- Node/edge click interactions (`wait_click()`): Phase 2 — planned Sprints 12–13. Basic "user is done" signal (`wait_done()` + Done button) is shipped in Sprint 10.
- Slider/quiz widgets → agent: Phase 2 (later, after node clicks).
- Cross-session persistence / history across restarts: Phase 2
- Binary export (PNG/SVG/PDF): Phase 2
- D2 renderer: post-Phase-2 (requires server-side render process)
- Concurrent browser connections / multi-tab state sync: post-Phase-2 (second tab starts blank in v1)
- WebSocket reconnection state replay: Phase 2 — on disconnect the browser clears the canvas and displays "Server disconnected. Restart `npm run dev`." No auto-retry in v1.
- Free-form canvas / whiteboard drawing: deferred (nice-to-have)
- Agent error-recovery behavior: out of scope — the server returns `{ ok: false, error: "..." }` and the agent decides what to do with it
- Multi-user support: Phase 3 (deferred; requires auth, session isolation, and remote deployment groundwork)
- Remote/cloud deployment: Phase 3 (deferred; local-only through Phase 2)
- Non-developer users: not in scope
- Non-Claude Code agent runtimes: Phase 2
- Slideshow / auto-play (`slideshow()`, `slideshow_stop()`): Phase 2
