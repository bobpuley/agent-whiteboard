# North Star

## Core Idea

A **domain-agnostic, persistent visual workspace** that AI teacher agents control during a lesson — a second screen alongside the terminal. The agent drives the canvas (diagrams, animations, step-through sequences) while the learner watches and eventually interacts; the terminal remains the agent's primary output channel.

The root problem is not "how to draw diagrams" but how to give a CLI agent a rich display surface and a return channel for user actions, with shared state.

---

## Target UX

**Moment-to-moment experience:**
1. Developer opens a terminal and starts `npm run dev` — a browser tab opens automatically.
2. Agent (Claude Code) renders a diagram or step-through animation without leaving the CLI.
3. Learner watches, zooms, navigates frames — no context-switch between terminal and browser.
4. Learner signals readiness (Done button) or clicks a node; agent receives the event and adapts.

**Design principles:**
- Zero-config startup: one command, one browser tab, no manual setup
- Agent uses declarative specs (Mermaid, Vega-Lite, step-frames JSON) — never raw drawing instructions
- Bidirectionality is a first-class goal, not an afterthought

---

## Capability Levels

| Level | Name | Status |
|-------|------|--------|
| 0 | Static diagrams + Markdown | ✅ MVP |
| 1 | Multi-format rendering (SVG, HTML, KaTeX, Vega-Lite) | ✅ MVP |
| 2 | Presentation / step-through (`step()`, `slideshow()`) | ✅ Phase 2 |
| 3 | Animations / simulations (frame sequences, state transitions) | Partial — step-frames cover discrete steps; continuous animation is future |
| 4 | Interactive canvas (free-form drawing, drag-to-connect) | Deferred |
| 5 | Full bidirectionality — user events → agent adapts explanation | In progress (Phase 2) |

The north star is **Level 5**: a constructivist learning loop where the learner clicks, drags, or answers; the agent sees the event; the canvas and narration adapt in real time.

---

## MVP Definition of Done

*(Achieved — Sprints 0–8)*

- Agent calls `render(type="mermaid", payload)` → diagram appears in browser within 200 ms
- Agent calls `clear()` → canvas resets; `export()` → returns last payload verbatim
- `npm run dev` starts server and opens browser automatically
- Runs on macOS, Linux, Windows
- Port and binding address configurable via environment variables
- `.mcp.json` committed; Claude Code connects without manual config

---

## Phase 2 North Star (current focus)

*(Sprints 9–14+)*

Full bidirectionality: the agent renders a diagram, pauses, the user interacts (clicks a node, selects an action from a popup menu, signals "done"), and the agent receives a structured event and continues — all within one unbroken lesson flow, no copy-paste, no external tools.

Concrete milestone: agent renders a step-through sequence, user clicks a node, agent generates a drill-down diagram for that node and narrates it — without the user leaving the browser or the agent leaving the terminal.

---

## What "Finished" Looks Like (Long-Term)

A developer can open Claude Code, ask it to explain any distributed systems concept, and receive an animated, interactive visual lesson — step-by-step, with clickable nodes, quiz moments, and adaptive drill-downs — entirely within their existing toolchain, with no external SaaS, no account, and no context-switching.
