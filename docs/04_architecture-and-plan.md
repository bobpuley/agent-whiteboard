# Architecture and Plan

> Decisions made here supersede deferred items in `01_input-ideas.md` and `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. Stack Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend runtime | Node.js | Better concurrency for multi-user WebSocket at scale; single runtime with browser; easier binary packaging in future |
| Backend framework | Hono or Express | Lightweight, wide ecosystem; decision at implementation time |
| MCP server | Node.js MCP SDK (`@modelcontextprotocol/sdk`) | Official SDK, Node-native |
| Frontend framework | Svelte | Minimal bundle, reactive by default, no virtual DOM overhead; replaceable at low cost given thin v1 UX |
| Rendering libraries | Mermaid.js, Vega-Lite, KaTeX, D3 (for SVG animations) | Client-side, well-maintained, cover all v1 content types |
| Transport (server→browser) | WebSocket | Real-time incremental updates |
| Packaging (v1) | `npm run dev` — dev-only, no distribution concern yet | No remote repo yet; packaging deferred |

---

## 2. System Architecture

```
[Claude Code agent]
    │
    └── MCP tool calls (render / clear / step / export)
           │
           ▼
    [MCP + HTTP Server]  (Node.js)
    │  • MCP tool handlers
    │  • REST POST /render  (curl-friendly fallback)
    │  • WebSocket /stream  (push to browser)
    │  • Serves the Svelte SPA (static files)
    │  • In-memory session state (one canvas at a time)
           │
           ▼
    [Browser SPA]  (Svelte)
    │  • Receives render commands via WebSocket
    │  • Renders: Mermaid, Vega-Lite, KaTeX, SVG/HTML
    │  • Step-through: frame array + step() navigation
    │  • export() returns source spec as text
    │  • Auto-opens on server start
```

**Phase 2 additions** (not in v1):
- WebSocket back-channel: browser → server → agent (bidirectionality)
- Multi-panel / named tabs
- Binary export (PNG/SVG/PDF)
- Multi-user session management
- Remote deployment / auth

---

## 3. MCP Tool Implementations

| Tool | Server-side action |
|------|--------------------|
| `render(type, payload, options?)` | Validates payload; pushes render command to browser via WebSocket; stores as current canvas state |
| `clear()` | Resets in-memory canvas state; sends clear command to browser |
| `step(direction)` | Advances or rewinds frame index in current step-through sequence; pushes updated frame to browser |
| `export(format?)` | Returns current canvas source spec (Mermaid source, Vega-Lite JSON, etc.) as text; no binary in v1 |

---

## 4. Data Flow — Render Command

```
agent calls render(type="mermaid", payload="graph TD; A-->B", options={action:"replace"})
  → MCP server validates payload
  → stores as current canvas state (in-memory)
  → pushes JSON command over WebSocket to browser:
      { action: "replace", type: "mermaid", payload: "graph TD; A-->B", options: {} }
  → browser receives, hands off to Mermaid.js renderer
  → diagram appears in browser tab
  → MCP tool returns { ok: true }
```

---

## 5. API Payload Shape

```json
{
  "action": "replace | append | clear | step",
  "type": "mermaid | d2 | graphviz | vega-lite | katex | svg | html | step-frames",
  "payload": "...",
  "options": {
    "theme": "dark | light",
    "animate": true,
    "step_delay_ms": 800,
    "highlight": ["nodeId"]
  }
}
```

---

## 6. Project Structure (proposed)

```
agent-whiteboard/
├── server/
│   ├── index.ts          # entry point — starts HTTP + WebSocket + MCP
│   ├── mcp.ts            # MCP tool definitions and handlers
│   ├── session.ts        # in-memory canvas state
│   └── ws.ts             # WebSocket push to browser
├── client/               # Svelte SPA
│   ├── src/
│   │   ├── App.svelte
│   │   ├── renderers/    # one file per content type
│   │   │   ├── Mermaid.svelte
│   │   │   ├── VegaLite.svelte
│   │   │   ├── KaTeX.svelte
│   │   │   ├── SvgHtml.svelte
│   │   │   └── StepFrames.svelte
│   │   └── ws.ts         # WebSocket client
│   └── public/
├── docs/
├── package.json
└── CLAUDE.md
```

---

## 7. Dev Plan — MVP Tasks

### Phase 0 — Scaffold
- [ ] Init Node.js project (`package.json`, TypeScript config)
- [ ] Init Svelte project inside `client/`
- [ ] Basic `npm run dev` that starts server and opens browser

### Phase 1 — Transport layer
- [ ] HTTP server with REST `POST /render` endpoint
- [ ] WebSocket server (`/stream`) — push JSON commands to connected browser
- [ ] Svelte SPA connects to WebSocket and logs received commands

### Phase 2 — MCP server
- [ ] Add `@modelcontextprotocol/sdk` to server
- [ ] Implement `render`, `clear`, `step`, `export` tool handlers
- [ ] Wire MCP handlers to in-memory session + WebSocket push

### Phase 3 — Renderers
- [ ] Mermaid renderer (primary)
- [ ] KaTeX renderer
- [ ] Vega-Lite renderer
- [ ] SVG/HTML pass-through renderer
- [ ] Step-frames renderer with `step()` navigation

### Phase 4 — UX baseline
- [ ] Auto-open browser on server start
- [ ] Dark/light mode toggle
- [ ] Zoom/pan for diagram renderer
- [ ] `export()` returns current source spec as text

### Definition of Done — MVP
- Agent can call `render(type, payload)` and diagram appears in browser within 200ms
- Agent can call `step("next")` / `step("prev")` to animate a step-through sequence
- Agent can call `clear()` to reset the canvas
- Agent can call `export()` to retrieve the current source spec as text
- Server starts with `npm run dev`, browser opens automatically
- Runs on macOS, Linux, Windows
- Binding address is configurable (not hardcoded to localhost)
