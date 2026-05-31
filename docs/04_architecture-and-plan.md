# Architecture and Plan

> Decisions made here supersede deferred items in `01_input-ideas.md` and `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. Stack Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend runtime | Node.js | Better concurrency for multi-user WebSocket at scale; single runtime with browser; easier binary packaging in future |
| Backend framework | Hono | First-class TypeScript, ~15 kB bundle, minimal overhead; Express ruled out — heavier, bolted-on types |
| MCP server | Node.js MCP SDK (`@modelcontextprotocol/sdk`) | Official SDK, Node-native |
| MCP transport | SSE (HTTP + Server-Sent Events) | Server has its own lifecycle (also drives browser); SSE avoids a second process. stdio ruled out — requires Claude Code to spawn the server, but server must already be running for the browser. |
| Frontend framework | Svelte | Minimal bundle, reactive by default, no virtual DOM overhead; replaceable at low cost given thin v1 UX |
| Rendering libraries | Mermaid.js | Only v1 renderer. D2 (`@terrastruct/d2`), Vega-Lite, KaTeX, D3 deferred to Phase 2. |
| Transport (server→browser) | WebSocket | Real-time incremental updates |
| Packaging (v1) | `npm run dev` — dev-only, no distribution concern yet | No remote repo yet; packaging deferred |
| Browser auto-open | `open` npm package | Cross-platform (macOS/Linux/Windows) with a single API call; no platform-specific logic |

---

## 2. System Architecture

```
[Claude Code agent]
    │
    └── MCP tool calls (render / clear / export)
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
    │  • Renders: Mermaid only (v1)
    │  • export() returns Mermaid source as text
    │  • Auto-opens on server start
```

**Phase 2 additions** (not in v1):
- WebSocket back-channel: browser → server → agent (bidirectionality)
- `step()` tool + step-through frame sequences
- D2, Vega-Lite, KaTeX, SVG/HTML renderers
- Multi-panel / named tabs
- Binary export (PNG/SVG/PDF)
- Multi-user session management
- Remote deployment / auth

---

## 3. MCP Tool Implementations

| Tool | Server-side action |
|------|--------------------|
| `render(type, payload, options?)` | Validates Mermaid payload; pushes render command to browser via WebSocket; stores as current canvas state |
| `clear()` | Resets in-memory canvas state; sends clear command to browser |
| `export()` | Returns current Mermaid source as text; no binary in v1 |
| `step(direction)` | Phase 2 — not implemented in v1 |

### Validation — two layers

**Layer 1 — MCP tool definition** (agent-facing, in `mcp.ts`)
The tool's JSON Schema and description are read by the agent when it loads the MCP server. Rich schemas and inline examples are the primary defence against hallucinated payloads.

| Type | Schema hint exposed to agent |
|------|------------------------------|
| `mermaid` | `string` — must begin with a valid diagram keyword (`graph`, `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `mindmap`) |

Phase 2 types (not exposed in v1): `d2`, `vega-lite`, `katex`, `svg`, `html`, `step-frames`.

**Layer 2 — Server-side validation** (safety net, in `session.ts` or `mcp.ts`)
Lightweight checks after the agent call arrives. On failure, returns a structured error the agent can act on:

```json
{ "ok": false, "error": "invalid payload: mermaid source must begin with a diagram keyword (e.g. 'graph TD')" }
```

On success:

```json
{ "ok": true }
```

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
  "action": "replace",
  "type": "mermaid",
  "payload": "graph TD; A --> B",
  "options": {
    "theme": "dark | light"
  }
}
```

`append`, `step` actions and all non-Mermaid types are Phase 2.

### Step-frames payload shape (Phase 2)

```json
{
  "frame_type": "mermaid",
  "frames": [
    { "label": "Step 1 — initial node", "payload": "graph TD; A" },
    { "label": "Step 2 — add edge",     "payload": "graph TD; A --> B" },
    { "label": "Step 3 — complete",     "payload": "graph TD; A --> B --> C" }
  ]
}
```

- `frame_type` — single type shared by all frames in v1; per-frame type is later.
- `label` — optional string; displayed in the UI as a step caption.
- `payload` — same format as a regular `render` payload for the given `frame_type`.

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
│   │   │   └── Mermaid.svelte   # only v1 renderer
│   │   └── ws.ts         # WebSocket client
│   └── public/
├── docs/
├── package.json
└── CLAUDE.md
```

---

## 7. Dev Plan — MVP Tasks

### Sprint 0 — Scaffold
- [ ] Init Node.js project (`package.json`, TypeScript config)
- [ ] Init Svelte project inside `client/`
- [ ] Basic `npm run dev` that starts server and opens browser

### Sprint 1 — Transport layer
- [ ] HTTP server with REST `POST /render` endpoint
- [ ] WebSocket server (`/stream`) — push JSON commands to connected browser
- [ ] Svelte SPA connects to WebSocket and logs received commands

### Sprint 2 — MCP server
- [ ] Add `@modelcontextprotocol/sdk` to server
- [ ] Implement `render`, `clear`, `export` tool handlers (SSE transport)
- [ ] Wire MCP handlers to in-memory session + WebSocket push

### Sprint 3 — Renderer
- [ ] Mermaid renderer (Mermaid.js)

### Sprint 4 — UX baseline
- [ ] Auto-open browser on server start
- [ ] Dark/light mode toggle
- [ ] Zoom/pan for diagram renderer
- [ ] `export()` returns current source spec as text

### Definition of Done — MVP
- Agent can call `render(type="mermaid", payload)` and diagram appears in browser within 200ms
- Agent can call `clear()` to reset the canvas
- Agent can call `export()` to retrieve the current Mermaid source as text
- Server starts with `npm run dev`, browser opens automatically
- Runs on macOS, Linux, Windows
- Binding address is configurable (not hardcoded to localhost)
