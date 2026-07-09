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

**FR6 — Live browser preview on each `append_frame`**
The `init_step_frames` flow should render a slide in the browser on every `append_frame` call. The final `commit_step_frames` is only for triggering finalization steps (snapshot write, slideshow cancellation, builder-entry cleanup) — the visual must already be shown by the time commit is called. Current behavior: browser is only updated at `commit_step_frames` time.

**FR7 — `export()` with optional graph ID parameter**
Make the `export()` MCP tool accept an optional parameter to target a specific in-progress graph (e.g. a step-frames builder ID) instead of only the committed canvas state. When no parameter is passed, behavior is unchanged (returns last committed `render()` payload). This allows the agent to retrieve the assembled payload for a build in progress without waiting for `commit_step_frames()`.

**FR8 — History load sets current workspace**
When the user opens a file from a workspace in the history panel, that workspace should become the new current workspace (`lastWorkspace`). Currently `POST /snapshots/load` is write-silent and does not update `lastWorkspace`, so subsequent agent renders still route to the previous workspace.

**FR9 — History and Done controls moved to a right side panel**
Move the History toggle button and the Done button out of the footer and into a small always-visible right side panel. Replace the "Done" text label with an icon (no text). The panel should be unobtrusive and not occlude the main canvas.

**FR10 — Lock/unlock toggle on history panel header**
Add a small toggle button to the history panel's header that locks or unlocks the panel. When unlocked (default): clicking a snapshot loads it and closes the panel automatically (current behavior). When locked: clicking a snapshot loads it but the panel stays open, allowing the user to browse and load multiple snapshots without reopening the panel each time.

**FR11 — "Done" button conditional visibility**
The Done button in the right-side controls panel should only be visible when the agent has called `wait_done()` (i.e. the server is armed and waiting for the signal). When `wait_done()` is not active, the Done button is hidden. When `wait_done()` resolves or times out, the button is hidden again. Rationale: showing the Done button at all times is confusing — clicking it has no effect unless the agent armed it.

**FR12 — History panel delete functionality**
The history panel supports three delete operations:
1. **Single delete** — delete an individual snapshot item.
2. **Select items + delete** — select multiple items (across one or more workspaces) and delete them in one action.
3. **"Workspace delete"** — delete the workspace folder and all its snapshot files. The accordion row disappears from the panel entirely.
Decision (2026-06-30): "Clear workspace" (delete files, keep directory, leave empty accordion row) is removed — it has the same high-level effect as "Workspace delete" and adds complexity without user value. `POST /snapshots/clear-workspace` is removed in v0.13.

**FR13 — Recycle bin icon + history panel header layout**
Add a recycle bin (trash) icon button to the history panel's header. This button controls the delete action (e.g. enters delete/selection mode). All action buttons in the header (recycle bin, lock/unlock, and any future controls) should be aligned to the right, with a vertical separator between the action button group and the close button.

**FR15 — Agent-facing HTML export**
The self-contained HTML export (FR14, v0.13) should also be callable by the agent, not only from the browser's HistoryPanel. The agent needs a way to list a workspace's snapshots in order to build the export request, and a way to specify which snapshots to export (minimum 1, maximum all of the workspace's snapshots). Workspace is mandatory for every request, as usual. Open question: should the export request identify snapshots by filename or by `id`, and what should the snapshot-list return data look like?

**FR14 — Export selected snapshots to self-contained HTML**
From the HistoryPanel in selection mode, an "Export selected" button appears in the select-bar alongside "Delete selected", visible only when at least one item is checked. Clicking it POSTs the selected `{ workspace, filename }` pairs to `POST /export-html`, receives a self-contained HTML file, and triggers a browser download. The HTML file contains all selected snapshots rendered as static content — Mermaid as inline SVG, KaTeX as HTML string, Vega-Lite as inline SVG, SVG/HTML as sanitized markup. Step-frames sequences are expanded into frame sub-sections. The file requires no external network requests (all CSS inline; KaTeX CSS only when ≥1 KaTeX items are present). New server-side dependency: `happy-dom` for Mermaid rendering and DOMPurify. Per-item render failure shows an inline error message — the overall export continues.

**FR17 — Distribute via `npx agent-whiteboard`**
Raw idea, captured during a README/release-readiness review (2026-07-03, outside the normal doc flow — repo now has a GitHub remote for the first time). Package the tool so a user can run `npx agent-whiteboard` instead of cloning the repo and running `npm run dev`. Package name `agent-whiteboard` confirmed available on the npm registry (checked 2026-07-03; `@bobpuley/agent-whiteboard` and `agent-whiteboard-mcp` also free as fallbacks). Evaluated against global npm install, a standalone compiled binary, Electron, a Chrome extension, and Docker — npx was preferred as the v1 target because it requires no architecture change, just packaging/release hygiene, and it fits the project's local-first Node/MCP/browser model and "zero-config, existing toolchain" north star (see `00_north-star.md`). Explicitly deferred — not scheduled to a milestone yet (backlog only, per intake decision 2026-07-03).

**FR16 — Move delete/export controls to the right-side panel; replace inline selection UI with a 2-step modal**
Raw request: "upgrade the view to whiteboard-view-v2.html style." Move the delete and export icon buttons out of the history panel header (U7f/U7g) and into the right-side controls panel, alongside the existing history-toggle and Done buttons (U7d). Clicking either icon opens a modal instead of toggling inline selection mode: **step 1** — the user picks a workspace from a list; **step 2** — the view zooms into that workspace, where the user either deletes/exports the entire workspace in one action, or checks a subset of its snapshots and deletes/exports just those. Goal (user's words): "the history panel is cleaner and the UI for delete and export will be clearer and easier to use." Prototyped as a working static mockup: `mockup/whiteboard-view-v2.html` (and `mockup/whiteboard-view.html` for the prior/baseline UI).

**FR18 — Mermaid diagram zoom/pan: fit-to-view on first open, persist during session, evaluate snapshot storage**
Raw request (2026-07-04), three parts:
1. When a Mermaid diagram is opened for the first time in a session, the graph should be centered and should fit the page/viewport size.
2. During a session, if the user changes zoom level or pan position, that state should be remembered until the session ends.
3. Evaluate whether it is possible, and whether it makes sense, to also persist zoom level and pan position in the snapshot.

**FR19 — Showcase feature-coverage audit (2026-07-06)**
Raw request: check that `tests/human_driven/showcase.js` demonstrates every shipped feature, excluding delete and export (browser-only UI with no meaningful script-drivable surface beyond what Section 12's export-by-id already covers). Audit found two shipped MCP features with no showcase section: the incremental step-frames protocol (`init_step_frames`/`append_frame`/`commit_step_frames`, F15/v0.8-v0.9) and `node_to_frame` autonomous navigation (U4e/v0.2). User confirmed adding both. Added as Sections 13 and 14 — see `04` Layer 3 (Testing Strategy).

**FR20 — Slideshow content never appears in History (2026-07-06)**
Raw observation: after running `showcase -s` (8 ticks across Sections 1–8), the History panel only contained entries for 7a, 7b, 7c, and 8 — sections 1–6 were missing entirely. Root cause explained: `saveSnapshot()` is only ever called from `commitRenderResult()` (backing `render()`/`commit_step_frames()`); `server/slideshow.ts`'s `broadcastSlide()`/`broadcastTick()` (backing `POST /slideshow`) never called it, going all the way back to when slideshow shipped in Sprint 9 — an omission, not a documented decision. User reasoned the original silence was probably fine for a "transient, brainstorm-iteration" use case (only the final state matters) and proposed persisting via an "override, logically an update" rather than one entry per slide — which mirrors the existing `init_step_frames`/`append_frame`/`commit_step_frames` precedent (F15): intermediate steps stay transient, only a deliberate finalize moment touches disk. Confirmed design: slideshow persists **exactly one** snapshot, written when the session ends (completes naturally, is stopped, or is superseded by a new `render()`/`slideshow()` call) — capturing whatever was last on screen; `clear()` still never persists (F10). This requires `slideshow()`/`POST /slideshow` to gain a **required** `workspace` parameter (previously had none at all, unlike `render()`'s F14 mandatory-workspace pattern) — user chose to add it explicitly rather than fall back to `lastWorkspace`, consistent with F14's "no implicit derivation" philosophy. Implemented in v0.22: `server/slideshow.ts` tracks the session's workspace and calls `saveSnapshot()` once via a new `finalizeSlideshow()` helper, reusing the same `id` already broadcast live; `cancelSlideshow({ persist: false })` is the one exception, used only by `clear()`. `tests/human_driven/showcase.js` updated to pass `workspace`. New tests added to `tests/unit/server/slideshow.test.ts` covering natural completion, explicit stop, supersession, single-tick sessions, and the `clear()` no-persist case.

**FR22 — Architecture consolidation redesign (2026-07-07)**
Raw request: the `desing-analysis/` folder (a fresh-eyes structural redesign, written before reading the code) proposes a unified `Presentation`/`Frame` content model, one shared command pipeline (`Source → Validate → Reduce → Persist → Project → Render`), a client renderer registry, and a generalized return-channel primitive — driven by the observation that adding slideshow support was hard because equivalent operations (`render`/step-frames/slideshow/history-load) were built as parallel pipelines that drift (see B5/B6/B15, C2b/C2d above). User confirmed this is the next priority, "in order to consolidate the application." Full analysis (`design-proposal.md`, `consolidation.md`, `baseline-comparison.md`, 9 unit deep-dives) reviewed and stress-tested via `/grill-me`; propagated into `02` (new section N), `03` (new section 7), `04` (new Target Architecture section 9), and `Milestone_v0.23.md`–`Milestone_v0.26.md`. The `desing-analysis/` folder itself is deleted after propagation (see N1 in `02`) — its reasoning now lives entirely in the canonical docs.

**FR21 — Re-fit a step-frames diagram on every frame change, not once per sequence (2026-07-06) — intake only, not implemented**
Raw request, surfaced while confirming the B17 fix: once diagrams actually fit correctly, a step-frames sequence whose frames vary a lot in size (e.g. Section 6's sequence diagram growing taller each step; Section 7c/8's flowcharts growing wider) now visibly overflows or under-fills on later frames, because the fit is computed once at frame 0 and deliberately not recomputed per frame (C3 in `02`, F19 in `03`). Presented three options: (a) fit to the union/max bounding box across all frames upfront, (b) re-fit on every frame change, (c) leave as the already-documented trade-off. User chose **(b) re-fit on every frame** as the intended direction, but explicitly asked to intake the decision only — no implementation this session. This reverses part of C3's original v0.19 decision ("`step()`/`seek()` within the same step-frames sequence does not re-trigger auto-fit") — implementing it later means changing `Mermaid.svelte`'s `isNewSnapshot()`/`fitOrRestore` logic so a frame-index change within an unchanged snapshot `id` also triggers `fitToView()`, not just a new `id`. Unscheduled — no milestone assigned yet.

**FR23 — `app.ts` god-class cleanup: extract non-routing responsibilities (2026-07-10)**
Raw idea, surfaced during a manual "what's in `app.ts` that isn't routing?" review (post-v0.27, prompted by the F1–F7 audit having been REST/MCP-scoped and therefore blind to REST-only bloat). Five things identified as not belonging directly in the Hono route-handler file:
1. `POST /snapshots/load`'s inline "commit" logic (validate every frame → decide single-frame vs. step-frames representation → `setCanvas`/`setStepFrames` → `broadcastReplace` → `setLastWorkspace`) is the same shape as `render-core.ts`'s `commitRenderResult`/`commitStepFramesResult`, just never migrated there — it has no MCP equivalent (no `load_snapshot` tool exists), so it was invisible to the F1–F7 REST/MCP duplication audit despite being the same class of problem one file down.
2. Snapshot file deletion (`/snapshots/delete-files`, `/snapshots/delete-workspace`) plus the workspace-path containment/existence check (`validateWorkspaceForDelete`) plus `readSnapshotIdSafe` have no owning module — `snapshot-reader.ts` owns reads, `snapshot.ts` owns writes, nothing owns deletes.
3. Four independently-implemented "is this workspace acceptable" validation paths coexist within `app.ts` itself: `validateWorkspaceInput` (render-core.ts, reused correctly in 4 places), `/snapshots/load`'s inline optional-workspace check, `validateWorkspaceForDelete`, and `/export-html`'s silent-skip check — each with different rules and error text for conceptually the same question.
4. The snapshot-filename safety regex `/^[^/]+_screen\.json$/` is copy-pasted verbatim in two handlers (`/snapshots/load`, `/snapshots/delete-files`).
5. HTTP status codes are derived by substring-matching a human-readable error message (`result.error.includes("not found or expired") ? 404 : 400`, ×2) instead of the neutral `{ok, error, category?}` error shape `04_architecture.md` §9's "Contract changes this implies" already documents as part of the v0.23–v0.26 target design — checked, `category` doesn't exist anywhere in the actual code, only in that one doc paragraph. This is a previously-documented target that was never implemented, not a new design.

Discussed target shapes and confirmed via conversation (not `/grill-me` — see propagation below for the formal risk/requirement writeup):
- **Item 1** becomes a 4th function in `render-core.ts` (alongside `commitRenderResult`/`commitStepFramesResult`/etc.), using the existing persist-trigger vocabulary (`persist.ts`, NF16) with trigger `never` — `render-core.ts` stays the one layer composing *canvas*-affecting commands (state + broadcast + persist policy), regardless of whether a command has an MCP caller today.
- **Item 2** — `server/snapshot.ts` is renamed to `server/snapshot-writer.ts` and gains `deleteSnapshotFiles()`/`deleteWorkspace()`, each composing file deletion with `viewport-cache.ts`'s `deleteViewports()` cleanup internally (same pattern as `render-core.ts` composing `persistContent()` internally) — `snapshot-writer.ts` becomes the one layer composing *storage-tier* mutations. `readSnapshotIdSafe` moves to `snapshot-reader.ts` (it's a read, not a delete). Explicitly decided: **no third "snapshot-operations" wrapper module** — the full snapshot-operation surface was enumerated (16 operations across reads/writes/validation/canvas-commands) and confirmed to fit cleanly into the existing two-tier split (storage tier: reader/writer; canvas tier: `render-core.ts`), nothing left over needing a third home.
- Items 3–5 not yet discussed for target shape — flagged as open scope questions for propagation.

---

## Design Debt Log

> Non-behavioral findings from a Node.js/TS + Svelte/TS frontend code review pass (2026-07-04). These don't violate any requirement or produce observed-wrong behavior today, so they don't go through the bug-report protocol — logged here only as candidates to revisit when scoping a future milestone (see pointer in `05_dev-plan.md`). No propagation to `02`–`05` is forced by this log; promote an item explicitly if/when it's scheduled.

- **Business logic duplicated between `server/app.ts` and `server/mcp.ts`** — `render`, step-frames create/append/commit, and workspace-validation flows are implemented twice (HTTP + MCP). Root cause of the workspace-validation drift that produced the `workspace: "."` bug (see Bug Reports below) — worth a shared "core" module extraction.
- **Sparse/zero unit test coverage** — client has zero unit tests (only e2e); server modules `export-html.ts`, `slideshow.ts`, `events.ts`, `ws.ts`, `channel.ts`, `session.ts` have none; `mcp.ts` is thin (15 cases) relative to `app.ts` (181 cases).
- **No linter configured** — neither client nor server has ESLint; several review findings (a11y issues, unsafe casts) are exactly the class of thing `eslint-plugin-svelte` + `@typescript-eslint` catch automatically.

**REST/MCP duplication re-audit (2026-07-09)** — follow-up pass confirming the "Business logic duplicated" item above was not fully closed by the v0.21–v0.26 architecture consolidation. Full report with file:line references: `docs/raw/design-problems.md`. **Promoted to `Milestone_v0.27.md` (2026-07-09)** — see `02` §N6, `03` §8, `04` §9.6. 21 REST endpoints vs 14 MCP tools, 14 conceptual pairs; 5 pairs fully share logic already. Findings:

- **F1 (🔴 behavioral divergence)** — MCP's `slideshow` tool (`mcp.ts:256-299`) bypasses `validateFrame()` entirely, hand-rolling its own subset of checks; REST's `/slideshow` (`app.ts:219`) correctly calls it. `validate.ts:78-82` documents `validateFrame()` as having "no second implementation" — this is one. Currently low observable impact (validation is a no-op for svg/html/katex today) but any future tightening of `validateFrame()` silently won't apply to MCP.
- **F2 (🔴 verbatim duplication, highest-risk of its group)** — `step`/`seek` business logic is copied character-for-character between `app.ts:114-175` and `mcp.ts:95-194` instead of living in `render-core.ts`, unlike every other stateful command (`render`, `init/append/commit_step_frames`) which already routes through it.
- **F3 (🟡 behavioral divergence)** — MCP's `list_snapshots` (`mcp.ts:557`) requires `workspace` with no fallback; REST's `GET /snapshots` (`app.ts:370-383`) makes it optional and falls back to `getLastWorkspace()`. Same conceptual operation, different observable behavior.
- **F4 (🟡 undocumented asymmetry)** — REST's `export-html` accepts items by `{workspace, filename}` or `{workspace, id}`; MCP's `export_html` only accepts `{workspace, ids}`. Plausibly intentional (filename is browser-only) but never documented as a deliberate decision.
- **F5 (🟡 reimplemented 9x)** — the snapshots-root expression (`WHITEBOARD_SNAPSHOTS_DIR` ?? `~/.agent-whiteboard`) has 9 independent definitions across `app.ts` (4 inline + 1 closure-local `resolveSnapshotRoot()`), `mcp.ts` (3 inline), `viewport-cache.ts`, and `snapshot.ts` — no module exports a single canonical function.
- **F6 (🟢 reimplemented 3x, twice in one file)** — the "is this a valid Frame" predicate is written independently in `snapshot-reader.ts:33-39` (`isFrameArray()`) and twice more inline in `app.ts` (`450-451` and `666-667`, same file, same predicate).
- **F7 (🟢 systemic, low risk)** — `node_actions`/`node_to_frame` input shapes are validated via hand-written type guards in `app.ts:39-49` on the REST side vs. zod schemas in `mcp.ts` on the MCP side — same root cause as F1/F3 (Hono has no schema library wired to REST bodies the way MCP tools require zod), just lower-risk shapes.
- **Heavy visualization libraries eagerly bundled** — Mermaid + KaTeX + Vega-Embed all load on first paint regardless of which canvas type is active; candidate for dynamic imports.
- **`App.svelte` is a god component** — WebSocket routing, canvas state, step-frame nav, modal orchestration, and Done-button lifecycle all live in one 420-line file with no store/reducer extraction.
- **No CSP, no explicit Mermaid `securityLevel`** — defense-in-depth hardening, not a live gap given the client-side DOMPurify layer (see `02` C1 clarification).
- **Version drift** — Vite pinned to `^4.5.10` (several majors behind), `tsx` pinned to `^3.14.0`, `@types/katex` a minor behind installed `katex`.
- **Minor a11y/style polish** — placeholder/zoom-hint text contrast below WCAG AA, no `aria-live` on the disconnect banner / Done button, one non-keyed `each` block in the Mermaid popup menu.
- **Backend hygiene** — redundant `try/catch` around `saveSnapshot()` (which already handles its own errors), a couple of silent `catch {}` blocks with no logging, `getMermaidBundle()`/`getKatexCss()` re-read from disk on every export instead of being memoized, client and server dependencies share one `package.json`.

**2026-07-05 — promoted (via `/grill-me` scoping interview during intake):** all 8 items scheduled across two milestones, split by regression risk rather than shipped as one batch — see `02` §M, `03` NF9–NF13, `05` Milestone_v0.20.md / Milestone_v0.21.md.
- **v0.20 "Safety Net" (Sprint 33):** linter setup → hygiene/a11y fixes (linter-assisted) → blanket unit test coverage (client + all untested server modules) → CSP + Mermaid `securityLevel` → `@types/katex` bump. These are additive/no-behavior-change and exist partly to safety-net the v0.21 refactors.
- **v0.21 "Core Consolidation" (Sprint 34):** App.svelte decomposition into stores/reducers, then dynamic imports placed at the new component boundaries, plus the `server/app.ts`/`server/mcp.ts` shared-core extraction (independent backend track). These are the behavior-risk items, deliberately sequenced after the safety net.
- **Deferred, still unscheduled:** the Vite/tsx/vitest major-version migration (Vite is 4 majors behind — `4.5.10` → `8.1.3` — and `vitest`/`@sveltejs/vite-plugin-svelte` are version-locked to it; this needs its own risk assessment, not a "hygiene" bump) and the client/server `package.json` → npm-workspaces split (a build-tooling restructuring, not a code-level fix). Both remain logged here as candidates for a future intake pass.

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

**B4 — Mermaid HTML export produces invisible labels, wrong zoom, or throws (v0.13 export-html)**
- Observed: exporting `7c-step-frames` and `8-seek` (step-frames sequences with mermaid frames) to HTML produces diagrams with no visible labels and an incorrect, too-tight viewBox ("too zoomed in"). Exporting `click` (a plain mermaid diagram with edge labels and a cylinder-shaped node) throws an inline render error instead: "Could not find a suitable point for the given distance." The same payloads render correctly in the live whiteboard (real browser).
- Expected: exported HTML should render Mermaid diagrams with visible labels and a correct viewBox, matching what the live whiteboard shows, for both plain and step-frames diagrams regardless of node/edge-label complexity.

**B5 — One-shot `step-frames` payload skips per-frame content validation; related gap: no per-frame type (found 2026-07-03, during README/release-readiness review)**
- Observed: `render(type="step-frames", ...)` (both the MCP tool and `POST /render`) only checks that `frame_type` is a string, `frames` is a non-empty array, and each `frame.payload` is a string. It never calls `validatePayload(frame_type, frame.payload)` per frame — so a mermaid frame with invalid syntax (or a malformed vega-lite JSON frame) is silently accepted and only fails, or silently mis-renders, when the user steps or seeks to it. By contrast, `append_frame()` (the incremental builder, `step-frames-builder.ts`) already calls `validatePayload(entry.frame_type, payload)` on every frame at append time — the two creation paths for the same payload shape have different validation guarantees today, which was never a deliberate decision (see F3a, F15 in `03`).
- Expected: every frame in a `step-frames` sequence — built one-shot via `render()` or incrementally via `append_frame()` — should be validated against its effective type before being accepted, consistent with F3a's hard-gate rule for all payloads.
- Related idea (logged together because a proper fix touches the same code path): `frame_type` is currently one string for the *entire* sequence (`StepFrame` has no `type` field; `session.ts`, `step-frames-builder.ts`, `validate.ts`, `ws.ts` all thread a single shared type through). This was never a deliberate constraint — it's an artifact of the original v0.1 payload shape, unexamined when the incremental builder was added in v0.8. Making the incremental builder validate (and broadcast) **per-frame type** instead of one shared `frame_type` would fix B5 and let a single step-frames sequence mix content types (e.g. a mermaid frame followed by a katex frame). Analysis (2026-07-03): the incremental builder, once per-frame-typed, becomes a strict superset of the one-shot path — same rendering, same live preview, stronger validation, plus mixed types — the only thing the one-shot path keeps is fewer tool calls for small, fully-known-upfront sequences (not a functional capability, an ergonomics tradeoff). `slideshow()` already supports fully independent per-slide types and is unaffected by any of this. Scheduled: v0.17 (see `05`).

**B6 — `workspace: "."` bypasses the delete-path guard and can wipe the entire snapshot store (found 2026-07-04, Node.js/TS code review) — Resolved v0.18 (T1)**
- Observed: `validateWorkspaceForDelete()` (`server/app.ts:488-500`) blocks `/`, `\`, null bytes, and the literal `".."`, but not a bare `"."`. `path.join(root, ".")` normalizes to `root` itself, so `POST /snapshots/delete-workspace` with `{"workspace": "."}` passes validation and `rmSync` recursively deletes the entire snapshots root — every workspace, every history entry — in one call, no confirmation, no undo.
- Expected: the same workspace-name safety check used elsewhere (`isValidWorkspaceName()` in `validate.ts`, which already rejects this class of input) should gate this endpoint too, and the resolved path should be asserted to stay strictly inside the snapshots root before any delete.
- Resolved: `validateWorkspaceForDelete()`, `GET /snapshots`, `POST /snapshots/load`, and `POST /export-html` all now route through `isValidWorkspaceName()`; `POST /snapshots/delete-workspace` additionally asserts `resolve(join(root, workspace))` stays strictly inside `resolve(root)` before `rmSync`. Regression test confirms `{"workspace": "."}` is rejected and deletes nothing.

**B7 — Snapshot filenames collide within the same second, silently overwriting prior history (found 2026-07-04, Node.js/TS code review) — Resolved v0.18 (T2)**
- Observed: `saveSnapshot()` (`server/snapshot.ts:18-19,36`) derives the on-disk filename from a second-precision timestamp only, with no counter, random suffix, or millisecond precision. Two snapshot writes landing in the same wall-clock second (e.g. a `render()` immediately followed by `commit_step_frames()`) silently overwrite the same file — no error, no warning, nothing in logs.
- Expected: two snapshot writes must never collide under normal fast-paced agent usage; the filename should include a disambiguating component (the snapshot's own `id` UUID, a counter, or millisecond precision).
- Resolved: filename now includes the snapshot's own `id` UUID alongside the timestamp. New `tests/unit/server/snapshot.test.ts` confirms two same-second writes produce two distinct files.

**B8 — Async rendering race condition can display a stale diagram/formula/chart (found 2026-07-04, frontend code review) — Resolved v0.18 (T3)**
- Observed: all four renderer components (`Mermaid.svelte`, `Katex.svelte`, `VegaLite.svelte`, `Html.svelte`) set `lastRendered = source` synchronously but kick off an async render with no ordering guard. If `source` changes twice in quick succession (e.g. rapid step-frames navigation), an earlier render's promise can resolve after a later one, overwriting current content with stale content — silently, with no error or loading state.
- Expected: a render that starts before a more recent one must never overwrite the DOM after the more recent one has resolved; stale results should be discarded.
- Resolved: `Mermaid.svelte` and `VegaLite.svelte` — the two renderers with a genuine `await` between starting a render and touching the DOM/view — now capture a generation token per render and discard a superseded result. `Katex.svelte`/`Html.svelte` render fully synchronously and were left unchanged (no window for a race to occur). No automated regression test — see `Milestone_v0.18.md` T3 for why forcing the race proved impractical in a black-box e2e test; fix verified by code inspection and full suite runs.

**B9 — `handleDone()` has no error handling; a failed request silently breaks the Done button's state machine (found 2026-07-04, frontend code review) — Resolved v0.18 (T4)**
- Observed: `App.svelte`'s `handleDone()` (`client/src/App.svelte:128-134`) calls `fetch("/user-done", { method: "POST" })` with no `try`/`catch`. If the fetch rejects (plausible exactly when the "Server disconnected" banner is already showing), it becomes an unhandled promise rejection and `doneSent` never flips — the button's own state never recovers.
- Expected: `handleDone()` should catch a failed request and either retry, surface an error, or otherwise leave the button in a recoverable state instead of silently stalling.
- Resolved: `handleDone()` now wraps the fetch in `try`/`catch`; on failure shows a "Failed ✗" state for 2s and leaves `doneSent` false so the button stays clickable for retry. New Playwright e2e test simulates an aborted request and confirms the error state, retry-ability, and no unhandled rejection.

**B10 — Client TypeScript is excluded from the build's type-check gate; a real type error already shipped as a result (found 2026-07-04, frontend code review) — Resolved v0.18 (T5)**
- Observed: root `tsconfig.json` excludes `client`, and `npm run build` only runs `tsc` against `server/`; there is no `svelte-check` step. As a concrete consequence, `HistoryPanel.svelte:24` calls `res.json<{...}>()` — `Response.json()` takes zero type parameters, a compile error under real type-checking — and has shipped undetected.
- Expected: type errors anywhere under `client/` should fail the build, the same guarantee the server already has; `HistoryPanel.svelte:24`'s invalid generic call should be fixed as part of closing the gap.
- Resolved: `svelte-check` added as a dev dependency; `npm run typecheck` runs it against `client/tsconfig.json` and is chained into `npm run build`. Fixed the `res.json<T>()` call plus two more genuine (previously invisible) type gaps it surfaced — see `04` for detail. Verified `npm run build` now fails on a deliberately introduced client type error.

**B11 — WebSocket render commands are cast with no runtime validation; unknown/malformed messages fail silently (found 2026-07-04, frontend code review; reframed from the reviewer's security framing to a robustness/DX issue — see `02` C1 clarification for why) — Resolved v0.18 (T6)**
- Observed: `ws.ts` parses incoming messages with `JSON.parse` + a blind type assertion; `App.svelte` further casts `cmd.type as CanvasType` with no check against the known set of renderer types. If `cmd.type` doesn't match any `{#if}` branch (a future server/client version skew, or a bug elsewhere), the canvas silently renders nothing — no error, no log.
- Expected: an unrecognized message type should be logged/surfaced explicitly instead of failing the `{#if}` chain silently, so a mismatch is diagnosable without opening devtools and inspecting raw WS traffic.
- Resolved: `ws.ts` now validates the message shape (known action, and for "replace" a known renderer type or the step-frames-placeholder variant) before dispatching; an unrecognized message logs `console.error` and is dropped. New `tests/unit/client/ws.test.ts` (first client-side unit test in the project, vitest + happy-dom) covers known/unknown action and type cases.

**B12 — Delete/Export and History dialogs are not keyboard-trappable and have no Escape handling (found 2026-07-04, frontend code review) — Resolved v0.18 (T7)**
- Observed: `DeleteExportModal.svelte` and `HistoryPanel.svelte` are marked `role="dialog"` but neither sets `aria-modal`, traps focus, moves initial focus on open, restores focus on close, or handles `Escape`. `DeleteExportModal` gates a destructive delete action.
- Expected: both dialogs should be closable via `Escape`, trap `Tab`/`Shift+Tab` within their focusable elements, and manage focus on open/close — standard modal-dialog behavior, most valuable on the destructive delete flow.
- Resolved: both dialogs use a new shared `client/src/lib/trapFocus.ts` Svelte action (`use:trapFocus={{ onEscape: close }}`) plus `aria-modal="true"`. New Playwright e2e tests confirm both dialogs close on Escape and that Tab wraps within the dialog.

**B13 — Duplicated snapshot-fetch logic between `App.svelte` and `HistoryPanel.svelte`; one path silently swallows failures (found 2026-07-04, frontend code review) — Resolved v0.18 (T8)**
- Observed: both components independently call `GET /snapshots/all` and independently handle failure — `HistoryPanel.svelte` shows an inline error, but `App.svelte`'s `openModal()` silently falls back to an empty workspace list with no indication anything went wrong.
- Expected: a failed fetch should be visibly surfaced to the user in both call sites, ideally via one shared fetch helper instead of two independently-maintained copies.
- Resolved: extracted shared `client/src/lib/fetchAllSnapshots()`, used by both call sites. `DeleteExportModal.svelte` gained a `loadError` prop, shown in place of the normal step content. Two new Playwright e2e tests (one per call site) simulate a failed fetch and assert the error is visible.

**B14 — Concurrent `export-html` calls race on a globally-mutated DOM object (found 2026-07-04, Node.js/TS code review) — Resolved v0.18 (T9)**
- Observed: `generateExportHtml()` (`server/export-html.ts:379-400`) saves and overwrites `global.document`/`global.window`/etc. with a fresh `happy-dom` `Window`, does `await`-ing render work, and restores the original globals in a `finally` block at the end — with no lock/queue. It's reachable concurrently from two independent entry points (`POST /export-html` and the `export_html` MCP tool), which a single agent session could plausibly trigger close together (e.g. a browser-initiated export overlapping an agent-initiated one).
- Expected: two overlapping `generateExportHtml()` calls must not corrupt each other's output; calls should be serialized (e.g. a simple async queue) since global monkey-patching is inherently non-reentrant.
- Resolved: implementation renamed to `generateExportHtmlInner()`; a new `generateExportHtml()` wrapper serializes calls via a simple promise queue. Confirmed via a debug trace that overlapping calls previously left `global.document` dangling on a closed Window after both settled; new `tests/unit/server/export-html.test.ts` asserts this no longer happens and that overlapping calls each produce correct, uncorrupted output.

**B15 — Slideshow-driven Mermaid content never auto-fits (`/slideshow` broadcasts carry no `id`) (found 2026-07-06, user report during showcase) — Resolved v0.22**
- Observed: user reported the step-frames diagram in the showcase script "rendered not fitting the page the first time," small and top-left instead of scaled/centered — but loading the same content from the History panel fit correctly. Reproduced with Playwright against the live dev server: `POST /render` (used by `render()`/`commit_step_frames()`/history reload) always includes a fresh `id` in its WebSocket broadcast, but `server/slideshow.ts`'s `broadcastSlide()` and `broadcastTick()` (used by `POST /slideshow`, e.g. Section 6 of `tests/human_driven/showcase.js`) never did — for *any* slide type, not just step-frames. The browser's `Mermaid.svelte` only auto-fits when it sees a snapshot `id` it hasn't seen before (`isNewSnapshot()`, added in v0.19/F19); a permanently-absent `id` means that check is always false, so the diagram is left at its untouched default transform (scale 1, no offset).
- Expected: every slide broadcast during a slideshow — plain or step-frames — must carry an `id` exactly as `POST /render` does, per F7's "same WebSocket event format" contract, so F19's auto-fit/restore behavior applies uniformly regardless of which code path produced the render.
- Resolved: `slideshow.ts` now generates a fresh id (`generateSnapshotId()`) per plain slide and once per step-frames sequence (reused across that sequence's frame ticks, mirroring `/step`'s "echo the same id" continuation rule), and includes it in every broadcast. `tests/unit/server/slideshow.test.ts` and `tests/unit/server/mcp.test.ts` updated to assert the id is present and stable across frames of one sequence. This is the same class of gap as C2b (broadcast-format drift between `/render` and `/slideshow`) recurring for a later-added contract (`id`/F19) that `slideshow.ts` wasn't updated for when it shipped — see `02` C2d.

**B16 — `node_to_frame` clicks 404 in dev mode: `/seek` missing from Vite's dev proxy (found 2026-07-06, while verifying the new showcase Section 14 for FR19) — Resolved v0.22**
- Observed: while building and verifying the new `node_to_frame` showcase section, clicking a mapped node in the browser (`npm run dev`, Vite on :5173 + Node on :3000) fired the expected `POST /seek` request but received a 404 — the click never advanced the frame. Root cause: `client/vite.config.ts`'s dev proxy list (`/render`, `/clear`, `/export`, `/step`, `/node-click`, `/wait-click`, `/snapshots`, `/viewport`, `/user-done`, `/mcp`, `/stream`) never included `/seek`, the one endpoint the browser calls directly (not through the agent) for `node_to_frame` (U4e). Checked for a similar gap on `/export-html` (also browser-called, from `DeleteExportModal.svelte`) — that one is fine, since Vite matches proxy keys by string-prefix and `/export-html` already starts with the existing `/export` entry.
- Expected: every endpoint the browser calls directly (not the agent, not the showcase script) must be reachable through the dev proxy; `node_to_frame` clicks should work identically in `npm run dev` and in a production single-origin build.
- Resolved: added `"/seek": "http://localhost:3000"` to `client/vite.config.ts`'s proxy map. Verified with Playwright: clicking a mapped node now correctly advances to its target frame. Production (single-origin) builds were never affected — this was dev-proxy-only.

**B17 — Mermaid diagrams still render tiny/uncentered after the B15 fix — real root cause: SVG has no explicit pixel size, so some browsers fall back to the CSS default replaced-element size (found 2026-07-06, user report after re-testing the B15 fix live) — Resolved v0.22**
- Observed: after B15 shipped (slideshow broadcasts now carry `id`), the user still saw diagrams rendering small and top-left **live**, while the exact same content reopened from History fit correctly. Console inspection (`getComputedStyle(...).transform`, `getBoundingClientRect()`, `viewBox`) on the live case showed the CSS `transform` was being computed *correctly* (`scale(1.539...)`, matching `fitToView()`'s formula exactly against the diagram's `viewBox`) — but the SVG's actual rendered `getBoundingClientRect()` was only ~30% of the expected size. Root cause: Mermaid emits its SVG with `width="100%"` and no explicit numeric `height` attribute; `Mermaid.svelte`'s CSS deliberately leaves `.mermaid-container`/`.mermaid-canvas` unsized ("let the SVG size itself naturally", `.mermaid-canvas` is `position: absolute` with no explicit width/height). With no definite containing-block width for that percentage to resolve against, some real browsers fall back to the CSS spec's default replaced-element size (300×150, aspect-corrected) instead of the `viewBox`'s actual dimensions — so `fitToView()`'s scale, computed correctly against the `viewBox`, was being applied to the wrong base size. `fitToView()` implicitly assumes the SVG's natural (pre-transform) pixel size equals its `viewBox` size; that assumption silently broke. Headless Chromium (used for all automated Playwright reproduction during B15's investigation) resolves the percentage differently and doesn't hit this fallback, which is why every automated repro attempt showed correct fitting and only the user's real browser reproduced it — this was the same content, same code, same server fix, purely a browser-layout difference.
- Expected: the fit-to-view calculation's scale must reflect the diagram's actual rendered size, regardless of how a given browser resolves a percentage-width SVG inside an intentionally-unsized container.
- Resolved: `Mermaid.svelte`'s `renderDiagram()` now explicitly sets the inserted SVG's `width`/`height` attributes to the parsed `viewBox`'s dimensions immediately after insertion, before any fit/restore logic runs — pinning the SVG to a deterministic pixel size and eliminating the percentage-resolution ambiguity entirely, independent of container-sizing or browser-specific fallback behavior. Confirmed fixed by the user live, both for a fresh render and for a step-frames sequence's frame 0.
- Related, deliberately not addressed here: fixing this exposed a *different*, already-documented trade-off (C3 in `02`) — a step-frames sequence's single shared fit (computed once at frame 0) can overflow or under-fill later frames of very different size, previously masked entirely by this bug. See FR20 below.

**B18 — `runNodeToFrameDemo` (showcase Section 14): clicking a node in the browser does nothing (found 2026-07-09, user report)**
- Observed: after building and committing the step-frames sequence with `node_to_frame: { A: 0, B: 1, C: 2 }` via `runNodeToFrameDemo()`, clicking a mapped node (Client/API Gateway/Database) in the rendered Mermaid diagram has no effect — no frame jump, no visible feedback.
- Expected: per U4e, clicking a mapped node should call `POST /seek` and jump directly to that node's frame, with no agent involvement — same as documented behavior (and the same demo section that previously worked per the B16 fix in v0.22).

**B19 — Multi-frame sequences don't auto-fit per frame, only once per sequence (found 2026-07-09, user report) — re-report of FR21, now scheduled**
- Observed: navigating between frames of a step-frames sequence (`step()`/`seek()`) does not re-trigger auto-fit; the diagram keeps the viewport computed once at frame 0, which can overflow or under-fill later frames of a different intrinsic size — "bad visualization" per the user's report.
- Expected: auto-fit should happen per frame, not per snapshot/sequence — each frame change should recompute and apply its own fit-to-view, not reuse frame 0's.
- This is the exact behavior already decided as **FR21** (2026-07-06, intake-only, unimplemented — see `02` C3, `03` F19). B19 is that same decision being reconfirmed as an active problem rather than a deferred idea; user has now chosen to schedule its implementation (see milestone `Milestone_v0.26.1.md`).
