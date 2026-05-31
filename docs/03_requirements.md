# Requirements

> Built incrementally from `01_input-ideas.md` and confirmed decisions in `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. MCP Tool Surface

The MCP server exposes tools to the agent.

| Tool | Signature | Description | Phase |
|------|-----------|-------------|-------|
| `render` | `render(type, payload[, options])` | Push content to the canvas. `type` selects the renderer (e.g. `"mermaid"`). Always replaces the current canvas state in v1. `options.title` (optional string) displays a label above the canvas. `options.theme` and action-variant options deferred to Phase 2. | MVP |
| `clear` | `clear()` | Reset the current session canvas. | MVP |
| `export` | `export()` | Return the current canvas source spec. Response: `{ "ok": true, "data": "<source>" }` — `data` is the verbatim last payload passed to `render()`, for all content types. Empty string if canvas is empty or cleared. Binary export is Phase 2. | MVP |
| `step` | `step(direction)` | Advance (`"next"`) or rewind (`"prev"`) a step-through sequence. | MVP |
| `slideshow` | `slideshow(slides, delay_ms)` | Load a playlist of slides (`[{ type, payload, title? }]`) and auto-advance the canvas on a server-side timer at `delay_ms` intervals. A new call cancels any running slideshow. | Phase 2 |
| `slideshow_stop` | `slideshow_stop()` | Cancel the running slideshow timer; last rendered slide remains on screen. | Phase 2 |

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
| Agent → Server (alt) | REST `POST /render`, `POST /clear`, `GET /export`, `POST /step`, `POST /slideshow`, `POST /slideshow/stop` | Low-level fallback; also usable via `curl` for debugging. `POST /slideshow` and `POST /slideshow/stop` added in Phase 2 alongside the slideshow MCP tools. |
| Browser → Server | WebSocket back-channel | Reserved for Phase 2 bidirectionality (user events) |

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
| F4 | REST endpoints (`POST /render`, `POST /clear`, `GET /export`) are a fallback for agents that do not support MCP/WebSocket (e.g. `curl` testing). Primary path is MCP → WebSocket `/stream`. | MVP |
| F5 | Session management with cross-session persistence (`session_id`, history across restarts) | Phase 2 |
| F7 | Slideshow: `POST /slideshow` (and `slideshow()` MCP tool) accepts `{ slides: [{ type, payload, title? }], delay_ms }`, validates each slide, starts a server-side timer that auto-advances the canvas. A new call cancels any running slideshow; `POST /render` and `POST /clear` also cancel it. At most one active slideshow at a time. | Phase 2 |
| F8 | Slideshow stop: `POST /slideshow/stop` (and `slideshow_stop()` MCP tool) cancels the running timer; last rendered slide remains on screen. No-op if no slideshow is running. | Phase 2 |
| F6 | HTML/SVG payloads must be sanitized with DOMPurify in the browser before render; sanitization is silent (cleaned output rendered, no error state). No server-side hard gate for HTML/SVG — the `type` field is validated but the payload is passed through. | MVP |

### Rendering & Visualization

| ID | Requirement | Phase |
|----|-------------|-------|
| V1 | Render Mermaid diagrams with auto-refresh, zoom/pan | MVP |
| V1a | If the browser renderer fails (e.g. Mermaid.js throws), display the error message inline on the canvas in place of the diagram | MVP |
| V2 | Export: Mermaid source text via `export()` | MVP |
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
| U4 | Click-to-expand, tooltip, highlight nodes/edges; events sent back to agent | Phase 2 |
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
- Bidirectionality (user events → agent): Phase 2
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
