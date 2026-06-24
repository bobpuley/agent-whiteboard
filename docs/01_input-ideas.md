# Input Ideas — Synthesized from Raw Contributions

> Source files: contribution_01–04, 06 (contribution_05 absent).
> Only items grounded in a concrete decision, constraint, or real observation are retained.
> Speculation without grounding is excluded.

---

## 1. Problem Framing

- The core problem is not "how to draw diagrams" but how to create a **second, persistent, visual workspace** that the agent can use during teaching (c01).
- CLI agents are strong at: text generation, code, reasoning, file navigation — and weak at everything spatial, temporal, and interactive (c01).
- `CLAUDE_SCREEN.md` + Mermaid is already a working prototype of a "Visual Context Channel" for CLI agents, not a mere hack (c01, c02, c03, c06).
- The ultimate output model for a teaching agent is not plain text but a structured payload: `{speech, canvas_state, focus, next_actions}` (c01).
- The real question for architecture is: **how to give the agent a rich display + a return channel for user actions, with shared state** (c06).

---

## 2. Limitations of CLI-Only Teaching

| Gap | Description |
|-----|-------------|
| No spatial memory | Linear text is the wrong medium for architectures, graphs, workflows (c01, c03, c04, c06) |
| No progressive disclosure | Everything printed at once; concept cannot be built step by step on a persistent canvas (c01, c02, c03, c04) |
| No shared focus | Agent cannot say "look at this node", "now I highlight this" (c01) |
| No animation / temporality | TCP handshake, Raft, GC, event loop, gradient descent — all require state transitions, not static images (c01, c02, c03, c06) |
| No bidirectionality | Agent cannot see what user is looking at; user cannot interact and send events back (c01, c02, c03, c04, c06) |
| No persistent canvas | Terminal output scrolls away; no history, no navigation (c02, c03, c04, c06) |
| Multi-format gap | Math (LaTeX), charts, animated SVG all require separate tools today (c02, c03, c06) |
| Context-switching cost | Jumping between terminal and external viewer breaks cognitive flow (c03) |
| Constructivist learning blocked | Without structured input (click, drag, slider), all "learn by doing" pedagogy is unavailable (c06) |

---

## 3. Capability Levels

Grounded in c01 and c06; presented from simplest to most ambitious.

| Level | Name | Agent actions | Notes |
|-------|------|---------------|-------|
| 0 | Static diagrams + Markdown | `createDiagram`, `updateDiagram`, `highlightNode` | Already done with CLAUDE_SCREEN.md + Mermaid |
| 1 | Multi-format rendering | Add data charts (Plotly/Vega-Lite JSON spec), LaTeX, images | High value, low effort |
| 2 | Presentation / step-through | `nextStep()`, `focus(el)`, `hide(els)`, `show(els)` | Agent-driven PowerPoint equivalent |
| 3 | Animations / simulations | Timeline, frame sequences, state transitions | TCP handshake, Raft, sorting, GC, event loop |
| 4 | Interactive canvas | `createShape`, `moveShape`, `connectShapes` | Excalidraw / tldraw territory |
| 5 | Full bidirectionality | User event → agent receives → agent adapts explanation | The qualitative leap; enables constructivist learning |

---

## 4. Functional Requirements

### Communication & Integration

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Accept content via REST POST JSON and/or file-system watch of a markdown file — transparent to agent | MVP |
| F2 | Support: Mermaid, PlantUML, Graphviz, D2, LaTeX/KaTeX, SVG inline, HTML/CSS/JS, Chart.js/Vega-Lite JSON, extended Markdown | MVP (Mermaid min.) |
| F3 | Incremental composition: agent can add, modify, or remove individual elements without regenerating the whole screen | MVP |
| F4 | REST endpoint `/render` for static payloads; WebSocket or SSE `/stream` for incremental/animated updates | MVP |
| F5 | Session management (`session_id`, `clear`, `history`) | Phase 2 |

### Rendering & Visualization

| ID | Requirement | Priority |
|----|-------------|----------|
| V1 | Render Mermaid/D2/Graphviz with auto-refresh, zoom/pan | MVP |
| V2 | Support SVG/HTML for simple CSS/JS animations | MVP |
| V3 | Export PNG/SVG/PDF; dark/light mode; responsive layout | MVP |
| V4 | "Step-through" mode: agent sends ordered frame array, UI animates transitions | Phase 2 |
| V5 | Visual history: navigable snapshots (timeline or thumbnails) | Phase 2 |

### Interactivity & UX

| ID | Requirement | Priority |
|----|-------------|----------|
| U1 | Zero-config startup: one command launches server, opens browser, starts listening | MVP |
| U2 | CLI-friendly invocation: `curl -X POST …` or a thin wrapper script | MVP |
| U3 | Terminal fallback (ASCII/unicode rendering) if no browser available | MVP |
| U4 | Click-to-expand, tooltip, highlight nodes/edges; events sent back to agent | Phase 2 |
| U5 | Basic structured input widgets (quiz answers, sliders, drag-to-order) — events returned to agent | Phase 2 |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NF1 | Single binary or minimal-dependency script (Python or Node); no heavy install |
| NF2 | Communication localhost-only; no telemetry; sandboxed rendering |
| NF3 | Cross-platform: macOS, Linux, Windows |
| NF4 | `<200ms` render for diagrams under 500 nodes; debounce on stream |
| NF5 | Plugin/extension system for new renderer types |

---

## 5. Transport Mechanisms (Options)

| Mechanism | Characteristics | Verdict across contributions |
|-----------|----------------|-------------------------------|
| File watch on `CLAUDE_SCREEN.md` | Zero infra, already working, unidirectional, fragile | Good for backward compatibility / fallback; not sufficient alone |
| Local server + REST + WebSocket | Bidirectional, shared state, agent POSTs to render, receives user events | Consensus "sweet spot" (c02, c03, c04, c06) |
| MCP server | Cleanest integration for Claude Code — agent sees display as a native tool | Mentioned as ideal direction for Claude Code specifically (c01, c06); not detailed |
| SSE (Server-Sent Events) | Simpler than WebSocket, unidirectional server→client | Mentioned as WebSocket alternative for streaming (c03) |

---

## 6. Architecture Patterns

### Three-Component Model (c04, confirmed by c02/c03)

```
[CLI Agent]
    │
    ├── REST /render (static, one-shot)
    ├── WS /stream   (incremental, animated)
    └── File watch   (fallback)
    │
    ▼
[Local Relay Server]   ← acts as event broker
    │  • session management
    │  • debounce, validation
    │  • serves SPA
    ▼
[Browser SPA]
    │  • rendering engine (Mermaid, D3, SVG, Chart.js …)
    │  • zoom/pan, history, export
    └── WS back-channel  ← sends user events to server/agent
```

### Message Model

**Agent → UI (Commands):**
- `RenderMermaidCommand` — diagram source payload
- `InitCanvasSimulationCommand` — initial scene + physics rules
- `UpdateStateCommand` — partial update of named visual elements

**UI → Agent (Domain Events):**
- `NodeSelectedEvent(nodeId, context)`
- `CanvasInteractedEvent(actionType, x, y, entityId)`
- `ExecutionSteppedEvent(direction)`

### API Payload Shape (converged across c02, c03)

```json
{
  "session_id": "...",
  "action": "replace | append | clear | step",
  "type": "mermaid | d2 | graphviz | svg | html | chart | step",
  "payload": "...",
  "options": {
    "theme": "dark",
    "animate": true,
    "step_delay_ms": 800,
    "highlight": ["nodeId"]
  }
}
```

### Declarative Rendering Principle (c01 V3, c06)

Agent does not micromanage drawing. Agent produces a **scene/lesson description**; the renderer decides how to visualize it. Adopt existing declarative formats (Vega-Lite for data, Mermaid for diagrams, custom JSON schema for step-frames and widgets) and build only the thin transport layer on top.

---

## 7. Existing Tools Assessment

| Tool | Key finding | Fit |
|------|-------------|-----|
| Obsidian + Markdown (current) | Works, zero dev, but static, no incremental update, Obsidian dependency | Good MVP baseline, does not scale |
| Mermaid Live Editor | No external API for programmatic control | Not suitable |
| Kroki (self-hosted) | Unified API for 20+ diagram formats → SVG/PNG | Useful as static renderer fallback; not live |
| tldraw SDK | Excellent SDK, collaborative canvas, Mermaid import, MCP App exists | Good for Phase 2 / product build (c01); 3/5 for MVP (c03) |
| Excalidraw + MCP | MCP server exists; Mermaid → Excalidraw conversion available; real-time sync | Most promising for freehand/diagram canvas today (c01); poor for data-driven / animations (c04) |
| Jupyter / IPython | Rich rendering, ipywidgets; bidirectional feedback toward agent is cumbersome | Not well suited as live CLI second window |
| Marimo | Reactive Python notebook, better state model than Jupyter, good for interactive widgets | Possibly best notebook option for interactive coaching (c06); not mentioned elsewhere |
| Streamlit / Gradio | Good for dashboards; rigid layout; not designed for live LLM stream push | Not suitable |
| VS Code extension / webview | Possible but tied to the editor | Not CLI-generic |
| TUI (Rich, Textual, Bubbletea) | Zero context-switch, fast; limited to ASCII — no complex diagrams | Insufficient for Level 1+ |
| Custom lightweight web app | Full control, thin layer, tailored API, offline, extensible | Consensus recommendation (all files) |

**Consensus verdict:** No existing tool covers the full triangle of (CLI-agent friendly) + (code-driven diagrams) + (light interactivity / animation). A **custom lightweight web app** using mature rendering libraries is the recommended path.

---

## 8. Concrete Teaching Use Cases (grounding for requirements)

Animations / step-through needed for:
- TCP handshake, Raft consensus, leader election (c01)
- Garbage collection, event loop, gradient descent (c01)
- Sorting algorithms, graph traversal, network propagation (c06)
- Outbox Pattern, Kafka message flow (c04, c06)
- Concurrent process scheduling, cache behavior, network packets (c01)
- Physics / gravity simulation (c04)

Spatial diagrams needed for:
- Microservices architecture, neural network structure, dependency graphs, workflows (c01)
- Bounded Context graph for DDD exploration (c04)

Interactive / bidirectional use cases:
- User clicks a Bounded Context node → agent explains only that node (c04)
- User clicks "Step Forward" → agent advances one logical step, UI updates, CLI narrates (c04, c06)
- User drags a node / object in simulation → agent recalculates and explains the change (c04)
- Quiz: user clicks the wrong node in a diagram → agent reacts (c06)

**Node/edge click interactions (Phase 2 — post Sprint 11, 2026-06-07):**
Following the successful `wait_done()` prototype, the next bidirectionality milestone is node and edge click events. Concrete use cases:
1. Click a node → agent generates a drill-down diagram expanding the collapsed steps in that box
2. Click a node → agent (or server) navigates to the step in the sequence where that node first appears
3. Click a node → agent explains it in the CLI
4. Click a node → browser shows a popup menu of agent-pre-defined actions; user picks one; agent handles the chosen action
5. Same interactions for edge clicks

Agent API: `wait_click()` blocking tool (same pattern as `wait_done()`) — agent arms the listener, browser highlights clickable elements, one click resolves the tool call. For popup menus, the agent passes `node_actions` (a map of node ID → string array) as an argument; the browser shows the popup on click and returns the chosen action alongside the node ID. `wait_click()` applies to any currently rendered Mermaid diagram (both plain and step-frames).

---

## Open Conflicts

The following contradictions require an explicit decision before proceeding to architecture.

**C1 — Backend language** ✅ RESOLVED
Decision: deferred to architecture phase. Chosen by fit: best library support for the required rendering pipeline, easiest setup, most portable packaging. Candidates: Python (FastAPI) and Node.js (Hono/Express).

**C2 — Frontend framework** ✅ RESOLVED
Decision: deferred to architecture phase. Same criteria as C1 — chosen by fit for the job, not preference. Candidates: Vanilla JS, Svelte, React.

**C3 — Bidirectionality: MVP or Phase 2?** ✅ RESOLVED
Decision: required, but Phase 2. MVP focuses on agent→display (render, step-through, animate). Bidirectionality (user events back to agent) is a planned phase, not optional.

**C4 — MCP vs REST+WebSocket as primary integration** ✅ RESOLVED
Decision: MCP-first. MCP is a cross-runtime standard (usable by CLI harnesses via skills, web chatbots, Cursor, custom agents) — not Claude Code-specific. REST+WebSocket may remain as an internal transport or low-level fallback, but the primary agent-facing interface is MCP.

**C5 — File-watching fallback: keep or drop?** ✅ RESOLVED
Decision: drop. `CLAUDE_SCREEN.md` was a pragmatic interim solution. This project supersedes it with a structured MCP tool. No backward compatibility needed.

**C6 — tldraw vs Excalidraw vs custom renderer** ✅ RESOLVED
Decision: custom renderer. Mermaid, step-through animations, and data charts (Vega-Lite/Chart.js) are first-class needs — none handled natively by tldraw/Excalidraw. Free-form canvas is a nice-to-have for late-stage custom rendering, deferred.

**C7 — Marimo as notebook alternative** ✅ RESOLVED
Decision: not applicable. Marimo is a Python notebook runtime — incompatible with the custom renderer + MCP server architecture. Closed.

---

## 9. Test Folder Restructure Proposal

Current layout is fragmented:
- `e2e/` — Playwright browser tests (`canvas.spec.ts`, 16 tests)
- `manualtests/` — human-driven scripts (`showcase.js`, `click-demo.js`)
- `server/app.test.ts` — Vitest unit/integration tests (64 tests)
- `test-results/` — Playwright output artifact (generated, not source)

Proposed unified layout:
```
./tests
├── e2e/
├── human_driven/
└── unit/
    ├── server/
    └── client/
```

Motivation: all test-related code lives in one top-level `tests/` directory; clear separation by test kind; `client/` is a placeholder for future Svelte component unit tests.

---

## Feature Requests

**FR0 — Dynamic workspace parameter in render tool**
Allow the agent to pass the `workspace` name directly in the `render()` tool call, instead of relying solely on the `WHITEBOARD_WORKSPACE` env var. This enables each Claude session to send snapshots to a workspace-specific folder without server restart or environment setup.
- Proposed: add optional `options.workspace` parameter to `render()` (and `slideshow()` for consistency)
- Overrides `WHITEBOARD_WORKSPACE` env var when provided; env var is used as default
- Enables per-session workspace routing for teaching scenarios where one dev machine runs multiple courses/projects

**FR1 — Render snapshot persistence ("memory")**
When `render()` is called (a visual is received), the server stores a snapshot of the rendered content to disk at `~/.agent-whiteboard/<workspace-name>/<timestamp>_screen.<ext>`.
- Workspace name defaults to the Claude project folder name (basename of the server's working directory at startup). Overridable via env var.
- File schema and format: TBD — brainstorm required (see open question in `03`).
- Trigger scope: at minimum on every `render()` call; unclear whether `step()`/`seek()` (frame navigation) should also trigger saves.
- No read/resume in v1 of this feature — write-only. The value is auditability and replay.

**FR2 — user/memory interaction**
Now we have memory, I'd like to make the user able to see and navigate it. The functionality must not pollute the view, the focus is the whiteboard. In order to make the navigation  
UI meaningful it can be relevant to provide a very concise description of the graph, probably as part of the contract with the agent and then with the storage schema

**FR3 — History panel: workspace-grouped accordion**
The history panel (FR2) should group snapshots by workspace using an accordion UI. When the panel opens, the section for the current workspace is automatically expanded; all other workspaces are shown collapsed. Clicking any snapshot — regardless of which workspace it belongs to — loads it onto the canvas.

**FR4 — Mandatory workspace parameter in render()**
The `options.workspace` parameter in `render()` (currently optional, FR0/v0.6) is promoted to mandatory. The agent must always provide an explicit workspace name in every `render()` call. The implicit fallback chain (`options.workspace` → `WHITEBOARD_WORKSPACE` env var → `basename(process.cwd())`) is removed — no implicit workspace derivation at render time. Motivation: forces explicit session context at the call site, preventing accidental cross-workspace snapshot pollution and making workspace routing unambiguous.

**FR5 — Incremental step-frames creation (chunked upload)**
Problem: generating a complex step-frames graph in a single `render()` call is error-prone and slow. The full JSON payload is large, deeply nested, and contains many character escape sequences — LLMs frequently produce syntax errors and require multiple retries.
Proposed three-phase protocol:
1. Agent calls an initialisation tool/endpoint with high-level metadata (frame type, title, workspace, etc.) → server creates an empty step-frames skeleton in memory and returns a unique ID.
2. Agent sends one frame at a time (payload + ID) → server validates and appends the frame to the skeleton. Frames are added sequentially.
3. Agent repeats step 2 for every frame. When all frames have been sent, the agent triggers finalisation → server assembles the complete step-frames sequence and renders it (equivalent to calling `render(type="step-frames", ...)` with the full payload).
Motivation: each individual frame payload is small and straightforward; splitting creation avoids the compound complexity that causes one-shot failures.

---

## Bug Reports

**B1 — Slideshow step-frames slide renders nothing (Sprint 9)**
- Observed: running the showcase with `--type step-frames` (or any slideshow containing a `step-frames` slide) shows nothing in the browser — no diagram, no error.
- Expected: frame 0 of the step-frames sequence should appear, identical to calling `render(type="step-frames", …)` directly.

**B2 — Slideshow step-frames does not auto-advance through frames**
- Observed: running `node manualtests/showcase.js --type step-frames` shows frame 0 of the step-frames sequence and allows manual Prev/Next navigation, but does not automatically advance through the frames.
- Expected: the slideshow timer should advance through each frame of the step-frames sequence at `delay_ms` intervals — treating each frame as a separate animation step, not requiring manual navigation.

**B3 — Slideshow stops after slide 1 → slide 2**
- Observed: running the slideshow causes the canvas to advance from slide 1 to slide 2, then the server-side timer stops — remaining slides are never displayed.
- Expected: the timer should advance through all slides in the playlist at `delay_ms` intervals, stopping only after the last slide.
