# Requirements

> Built incrementally from `01_input-ideas.md` and confirmed decisions in `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. MCP Tool Surface

The MCP server exposes tools to the agent.

| Tool | Signature | Description | Phase |
|------|-----------|-------------|-------|
| `render` | `render(type, payload)` | Push content to the canvas. `type` selects the renderer (e.g. `"mermaid"`). Always replaces the current canvas state in v1. `options` parameter deferred to Phase 2 (theme, action variants). | MVP |
| `clear` | `clear()` | Reset the current session canvas. | MVP |
| `export` | `export()` | Return the current canvas source spec as text (Mermaid source). Returns empty string if canvas is empty or cleared. Binary export is Phase 2. | MVP |
| `step` | `step(direction)` | Advance (`"next"`) or rewind (`"prev"`) a step-through sequence. | Phase 2 |

---

## 2. Rendering Capabilities

> Content types the renderer must support, in priority order.

| ID | Type | Format | Phase |
|----|------|--------|-------|
| V1 | Diagrams | Mermaid | MVP |
| V2 | Export — text | Returns Mermaid source spec | MVP |
| V3 | Diagrams | D2 | Phase 2 |
| V4 | SVG / HTML | Inline SVG; HTML+CSS for simple animations | Phase 2 |
| V5 | Data charts | Vega-Lite JSON | Phase 2 |
| V6 | Math | LaTeX / KaTeX | Phase 2 |
| V7 | Step-through frames | Ordered frame arrays; agent-driven transitions via `step()` | Phase 2 |
| V8 | Export — binary | PNG / SVG / PDF download | Phase 2 |
| V9 | Visual history | Navigable snapshots (timeline or thumbnails) | Phase 2 |

---

## 3. Transport

| Layer | Mechanism | Role |
|-------|-----------|------|
| Agent → Server | MCP (primary) | Agent calls tools; server executes render commands |
| Server → Browser | WebSocket (`/stream`) | Incremental, real-time updates pushed to the SPA |
| Agent → Server (alt) | REST `POST /render`, `POST /clear`, `GET /export` | Low-level fallback; also usable via `curl` for debugging |
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
| F1 | Accept content via MCP tool calls (primary) and REST fallback endpoints (`POST /render`, `POST /clear`, `GET /export`) | MVP |
| F2 | Support rendering type: Mermaid only. D2, Vega-Lite, KaTeX, SVG, HTML deferred to Phase 2. | MVP |
| F3 | Full-spec replace: agent always sends the complete updated spec; per-element mutation deferred to Phase 2 | MVP |
| F3a | Validation is a hard gate: invalid payloads are rejected and returned as `{ ok: false, error: "..." }` to the agent; nothing is pushed to the browser and canvas state is unchanged | MVP |
| F4 | REST endpoints (`POST /render`, `POST /clear`, `GET /export`) are a fallback for agents that do not support MCP/WebSocket (e.g. `curl` testing). Primary path is MCP → WebSocket `/stream`. | MVP |
| F5 | Session management with cross-session persistence (`session_id`, history across restarts) | Phase 2 |

### Rendering & Visualization

| ID | Requirement | Phase |
|----|-------------|-------|
| V1 | Render Mermaid diagrams with auto-refresh, zoom/pan | MVP |
| V1a | If the browser renderer fails (e.g. Mermaid.js throws), display the error message inline on the canvas in place of the diagram | MVP |
| V2 | Export: Mermaid source text via `export()` | MVP |
| V3 | Support D2, SVG/HTML, Vega-Lite, KaTeX renderers | Phase 2 |
| V4 | Export: PNG/SVG/PDF download | Phase 2 |
| V5 | Step-through mode: agent sends ordered frame array; `step(direction)` advances/rewinds | Phase 2 |
| V6 | Visual history: navigable snapshots (timeline or thumbnails) | Phase 2 |

### Interactivity & UX

| ID | Requirement | Phase |
|----|-------------|-------|
| U1 | Zero-config startup: one command launches server, opens browser, starts listening | MVP |
| U2 | CLI-friendly invocation: `curl -X POST …` or thin wrapper script | MVP |
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
| NF5 | Plugin/extension system for new renderer types | Phase 2 |

---

## 6. Out of Scope for v1

- Multiple named panels/tabs: Phase 2 (one canvas at a time in v1)
- Terminal ASCII fallback: Phase 2 (browser always assumed available in v1)
- Bidirectionality (user events → agent): Phase 2
- Cross-session persistence / history across restarts: Phase 2
- Binary export (PNG/SVG/PDF): Phase 2
- Step-through frames / `step()` tool: Phase 2
- D2, Vega-Lite, KaTeX, SVG/HTML renderers: Phase 2
- Concurrent browser connections / multi-tab state sync: Phase 2 (second tab starts blank in v1)
- WebSocket reconnection state replay: Phase 2 — on disconnect the browser clears the canvas and displays "Server disconnected. Restart `npm run dev`." No auto-retry in v1.
- Free-form canvas / whiteboard drawing: deferred (nice-to-have)
- Agent error-recovery behavior: out of scope — the server returns `{ ok: false, error: "..." }` and the agent decides what to do with it
- Multi-user support: not planned
- Remote/cloud deployment: not planned (local-only)
- Non-developer users: not in scope
- Non-Claude Code agent runtimes: Phase 2
