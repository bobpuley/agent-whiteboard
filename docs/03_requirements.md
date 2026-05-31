# Requirements

> Built incrementally from `01_input-ideas.md` and confirmed decisions in `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. MCP Tool Surface

The MCP server exposes four tools to the agent.

| Tool | Signature | Description |
|------|-----------|-------------|
| `render` | `render(type, payload, options?)` | Push content to the canvas. Replaces or appends depending on `options.action`. |
| `clear` | `clear()` | Reset the current session canvas. |
| `step` | `step(direction)` | Advance (`"next"`) or rewind (`"prev"`) a step-through sequence previously loaded via `render`. |
| `export` | `export(format?)` | Return a text representation of the current canvas state (source spec: Mermaid source, JSON, etc.). No format argument needed for v1. Binary export (PNG/SVG/PDF) is Phase 2. |

**Phase:** `render`, `clear`, `export` — **MVP**. `step` — **MVP** (needed for step-through animations, a primary use case).

---

## 2. Rendering Capabilities

> Content types the renderer must support, in priority order.

| ID | Type | Format | Phase |
|----|------|--------|-------|
| V1 | Diagrams | Mermaid (minimum), D2, Graphviz | MVP |
| V2 | SVG / HTML | Inline SVG; HTML+CSS for simple animations | MVP |
| V3 | Data charts | Vega-Lite JSON | MVP |
| V4 | Math | LaTeX / KaTeX | MVP |
| V5 | Step-through frames | Ordered frame arrays; agent-driven transitions via `step()` | MVP |
| V6 | Export — text | Returns source spec (Mermaid source, JSON spec) | MVP |
| V7 | Export — binary | PNG / SVG / PDF download | Phase 2 |
| V8 | Visual history | Navigable snapshots (timeline or thumbnails) | Phase 2 |

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
| F2 | Support rendering types: Mermaid, D2, Graphviz, Vega-Lite, LaTeX/KaTeX, SVG inline, HTML/CSS | MVP |
| F3 | Incremental composition: agent can add, modify, or remove individual elements without regenerating the whole canvas | MVP |
| F4 | REST `/render` for static payloads; WebSocket `/stream` for incremental/animated updates | MVP |
| F5 | Session management with cross-session persistence (`session_id`, history across restarts) | Phase 2 |

### Rendering & Visualization

| ID | Requirement | Phase |
|----|-------------|-------|
| V1 | Render Mermaid/D2/Graphviz with auto-refresh, zoom/pan | MVP |
| V2 | Support SVG/HTML for simple CSS/JS animations | MVP |
| V3 | Export: text source only (Mermaid src, JSON spec) via `export()` | MVP |
| V3b | Export: PNG/SVG/PDF download | Phase 2 |
| V4 | Step-through mode: agent sends ordered frame array; `step(direction)` advances/rewinds; UI animates transitions | MVP |
| V5 | Visual history: navigable snapshots (timeline or thumbnails) | Phase 2 |

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
| NF5 | Plugin/extension system for new renderer types |

---

## 6. Out of Scope for v1

- Multiple named panels/tabs: Phase 2 (one canvas at a time in v1)
- Terminal ASCII fallback: Phase 2 (browser always assumed available in v1)
- Bidirectionality (user events → agent): Phase 2
- Cross-session persistence / history across restarts: Phase 2
- Binary export (PNG/SVG/PDF): Phase 2
- Free-form canvas / whiteboard drawing: deferred (nice-to-have)
- Multi-user support: not planned
- Remote/cloud deployment: not planned (local-only)
- Non-developer users: not in scope
- Non-Claude Code agent runtimes: Phase 2
