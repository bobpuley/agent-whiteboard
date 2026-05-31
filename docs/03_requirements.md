# Requirements

> Built incrementally from `01_input-ideas.md` and confirmed decisions in `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. MCP Tool Surface

The MCP server exposes tools to the agent.

| Tool | Signature | Description | Phase |
|------|-----------|-------------|-------|
| `render` | `render(type, payload, options?)` | Push a Mermaid diagram to the canvas. Replaces the current canvas state. | MVP |
| `clear` | `clear()` | Reset the current session canvas. | MVP |
| `export` | `export()` | Return the current canvas source spec as text (Mermaid source). Binary export is Phase 2. | MVP |
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
| Agent → Server (alt) | REST POST `/render` | Low-level fallback; also usable via `curl` for debugging |
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
| F1 | Accept content via MCP tool calls (primary) and REST POST `/render` (fallback) | MVP |
| F2 | Support rendering type: Mermaid only. D2, Vega-Lite, KaTeX, SVG, HTML deferred to Phase 2. | MVP |
| F3 | Full-spec replace: agent always sends the complete updated spec; per-element mutation deferred to Phase 2 | MVP |
| F4 | REST `/render` for static payloads; WebSocket `/stream` for incremental/animated updates | MVP |
| F5 | Session management with cross-session persistence (`session_id`, history across restarts) | Phase 2 |

### Rendering & Visualization

| ID | Requirement | Phase |
|----|-------------|-------|
| V1 | Render Mermaid diagrams with auto-refresh, zoom/pan | MVP |
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

### Non-Functional

| ID | Requirement |
|----|-------------|
| NF1 | Single binary or minimal-dependency script (Python or Node); no heavy install |
| NF2 | Communication localhost-only by default; binding address configurable; no telemetry; sandboxed rendering |
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
- Free-form canvas / whiteboard drawing: deferred (nice-to-have)
- Multi-user support: not planned
- Remote/cloud deployment: not planned (local-only)
- Non-developer users: not in scope
- Non-Claude Code agent runtimes: Phase 2
