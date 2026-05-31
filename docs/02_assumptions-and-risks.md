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

**A4 — Session lifetime is short and in-memory**
Sessions are scoped to a single focused explanation. History does not need to survive a server restart in v1.
- Cross-session persistence (save/resume, history across restarts) is deferred to v2.
- Risk: users who want to revisit a previous diagram have no recourse in v1 beyond export.

---

## B. MCP as Primary Interface

**B1 — MCP is stable enough to build on**
We are betting that the MCP protocol spec is stable and that tooling (SDKs, clients) is mature enough for production use.
- Risk: MCP is relatively new; breaking changes in the spec or SDK could require rework.

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
We assume LLMs reliably produce well-formed Mermaid, valid Vega-Lite JSON, and correctly structured step arrays.
- Risk: LLMs hallucinate syntax. Invalid payloads will cause silent render failures or broken diagrams unless the server validates and returns structured errors.

**D2 — The whiteboard is stateless from the agent's perspective**
The agent sends commands forward-only. It also prints the textual representation (Mermaid source, JSON spec, etc.) in the terminal alongside the visual render — the terminal is the agent's own record of what it sent.
- No state-read MCP tool needed in v1.
- Risk: if incremental updates become complex (e.g. "modify only node X in the diagram I sent two steps ago"), the agent needs to track its own history internally or re-send the full updated spec.

---

## E. Bidirectionality (Phase 2)

**E1 — WebSocket return channel is sufficient for user events**
When bidirectionality is built, user interactions (clicks, steps, quiz answers) are sent back to the agent via WebSocket → MCP server.
- Risk: the agent's MCP session must remain open and stateful long enough to receive async events — not all MCP runtimes handle long-lived sessions well.
- Open research item for Phase 2: verify whether Claude Code's SSE MCP session supports async server-push events. If not, fallback options include polling (agent calls a `get_events()` tool) or a separate callback mechanism outside MCP.
