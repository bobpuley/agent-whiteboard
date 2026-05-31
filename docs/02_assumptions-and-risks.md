# Assumptions and Risks

> Items marked `> ⚠️ ASSUMPTION:` are not yet confirmed by the user.
> Updated incrementally as decisions are made.

---

## A. Deployment & Environment

**A1 — Local-only deployment (v1)**
The whiteboard runs on localhost for v1. No cloud hosting, no multi-user access, no auth.
- Constraint: the server must not hardcode localhost — binding address must be configurable so the same service can be exposed remotely without code changes.
- Risk: if auth and multi-user are not designed for from the start, adding them later may require structural rework.

**A2 — Target user is a developer / technical learner**
Non-technical audiences are out of scope for v1; expansion is a future consideration.

**A3 — Browser always available**
The render surface is a browser tab. The system assumes a browser is running on the same machine.
- Risk: headless / server environments have no display. Terminal fallback is deferred to Phase 2 — this risk is **unmitigated in v1**.
- **Decision:** risk explicitly accepted for v1. Target audience (developers on local machines) makes headless use an edge case.

**A4 — Session lifetime is short and in-memory**
Sessions are scoped to a single focused explanation. History does not need to survive a server restart in v1.
- Cross-session persistence (save/resume, history across restarts) is deferred to Phase 2.
- Risk: users who want to revisit a previous diagram have no recourse in v1 beyond export.

---

## B. MCP as Primary Interface

**B1 — MCP is stable enough to build on**
~~> ⚠️ ASSUMPTION: not formally validated — accepted as a known risk with no mitigation in v1.~~
> ✅ VALIDATED: MCP SSE transport confirmed working end-to-end in Sprint 0 (2026-05-31). `render()`, `clear()`, `export()` all exercised via Claude Code. Risk remains (MCP is still relatively new) but is no longer an unvalidated assumption.

We are betting that the MCP protocol spec is stable and that tooling (SDKs, clients) is mature enough for production use.
- Risk: MCP is relatively new; breaking changes in the spec or SDK could require rework.
- **Decision:** risk accepted. Pin to exact version at Sprint 0 (`npm init`); treat upgrades as deliberate decisions. See `04` §1.

**B2 — v1 targets Claude Code only**
Claude Code is the sole agent runtime for v1. It supports MCP natively. Multi-agent / multi-runtime support is a future concern.
- Risk: design decisions optimized for Claude Code may need revisiting when expanding to other runtimes.

---

## C. Rendering

**C1 — Declarative specs are sufficient**
The agent generates structured payloads (Mermaid source, Vega-Lite JSON, step-frame arrays). The renderer handles visualization. The agent never writes raw HTML or JS for rendering.
- Risk: some teaching scenarios may require custom visual logic that doesn't fit any declarative format — forcing either a new renderer type or an escape hatch (raw HTML/SVG).

**C2 — Client-side rendering is fast enough**
Mermaid.js, D3, KaTeX etc. run in-browser. No server-side rendering pipeline needed.
- Risk: large or complex diagrams (hundreds of nodes) may hit browser performance limits. (NF4 sets a target of <200ms for <500 nodes.)

---

## D. Agent Behavior

**D1 — Agents can generate valid rendering specs**
> ✅ RESOLVED (Sprint 6, 2026-05-31): Full server-side Mermaid parse validation implemented. After passing the keyword-prefix check, `mermaid.parse()` is called server-side; syntactically invalid payloads are rejected with `{ ok: false, error: "..." }` before reaching the browser. Note: some diagram types (classDiagram, gantt, pie, mindmap) require a DOM context unavailable in Node.js — for those, `mermaid.parse()` is skipped and the keyword-prefix check remains the safety net. Genuine parse errors (`Parse error on line N: ...`) are always rejected.

We assume LLMs reliably produce well-formed Mermaid, valid Vega-Lite JSON, and correctly structured step arrays.
- Risk: LLMs hallucinate syntax. Invalid payloads will cause silent render failures or broken diagrams unless the server validates and returns structured errors.
- **Decision (v1):** validation is a hard gate — invalid payloads are rejected server-side and returned as `{ ok: false, error: "..." }` to the agent; nothing is pushed to the browser. See `03` F3a.

**D2 — The whiteboard is stateless from the agent's perspective**
The agent sends commands forward-only. It also prints the textual representation (Mermaid source, JSON spec, etc.) in the terminal alongside the visual render — the terminal is the agent's own record of what it sent.
- No state-read MCP tool needed in v1.
- Risk: if incremental updates become complex (e.g. "modify only node X in the diagram I sent two steps ago"), the agent needs to track its own history internally or re-send the full updated spec.

---

## E. Bidirectionality (Phase 2)

**E1 — Bidirectionality requires a Channel (stdio MCP server), not SSE push**
> ✅ RESOLVED: research spike completed 2026-05-31 via Claude Code docs.

Claude Code SSE MCP sessions do **not** support async server-push events. The correct mechanism is the **Channels API** (Claude Code ≥ v2.1.80, research preview).

A channel is a **separate stdio MCP server** (not SSE) spawned by Claude Code as a subprocess. It pushes events via `mcp.notification({ method: "notifications/claude/channel", ... })`, which Claude Code delivers as `<channel source="...">` tags in the agent's context. Two-way channels also expose a `reply` MCP tool for Claude to call back.

**Architectural implication for Phase 2:**
- The existing SSE server (port 3000, render/clear/export tools) is unchanged.
- A **second, separate stdio channel server** is required to bridge browser user events → Claude Code session.
- During the research preview, launching requires `--dangerously-load-development-channels server:agent-whiteboard-events`.
- Full production use requires packaging as a plugin on the Anthropic-approved allowlist or an org `allowedChannelPlugins` entry.
- Risk: research preview — the `--channels` flag contract may change before GA. Exact flag syntax (`--dangerously-load-development-channels server:agent-whiteboard-events`) should be verified at Sprint 10 time.
- **Sprint 10 trigger:** proceed when `--dangerously-load-development-channels` is no longer required (Channels API reaches GA), or when the research preview has been stable across two consecutive Claude Code releases.
- See `04` §2 for updated Phase 2 architecture.
