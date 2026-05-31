# Architecture and Plan

> Decisions made here supersede deferred items in `01_input-ideas.md` and `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. Stack Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend runtime | Node.js ≥ 18 (LTS) | Better concurrency for multi-user WebSocket at scale; single runtime with browser; easier binary packaging in future. Node 18 is the minimum for Hono and `@modelcontextprotocol/sdk`. |
| Backend framework | Hono | First-class TypeScript, ~15 kB bundle, minimal overhead; Express ruled out — heavier, bolted-on types |
| MCP server | Node.js MCP SDK (`@modelcontextprotocol/sdk`) | Official SDK, Node-native. Pin to exact version at `npm init` (Sprint 0); treat upgrades as deliberate decisions. |
| MCP transport | SSE (HTTP + Server-Sent Events) | Server has its own lifecycle (also drives browser); SSE avoids a second process. stdio ruled out — requires Claude Code to spawn the server, but server must already be running for the browser. |
| Frontend framework | Svelte | Minimal bundle, reactive by default, no virtual DOM overhead; replaceable at low cost given thin v1 UX |
| Rendering libraries | Mermaid.js ^11 (npm, bundled by Vite) | Only v1 renderer. Pinned to ^11 (latest stable major; breaking changes between v8/v9/v10/v11 make floating version risky). Loaded as npm package and bundled by Vite — no CDN dependency, works offline. D2, Vega-Lite, KaTeX, D3 deferred to Phase 2. |
| Transport (server→browser) | WebSocket | Real-time incremental updates |
| Packaging (v1) | `npm run dev` — dev-only, no distribution concern yet | No remote repo yet; packaging deferred |
| Dev server | Separate Vite dev server (`localhost:5173`) + Node server (`localhost:3000`); started together via `concurrently`; Vite proxies `/render`, `/stream`, `/mcp` to Node. **`/stream` requires `ws: true`** in Vite proxy config (WebSocket proxying is opt-in; HTTP proxy alone does not cover WS connections). | HMR on Svelte side; Node server implementation unchanged; production static build deferred to Phase 2 |
| Browser auto-open | `open` npm package | Cross-platform (macOS/Linux/Windows) with a single API call; no platform-specific logic |

---

## 2. System Architecture

```
[Claude Code agent]
    │
    └── MCP tool calls (render / clear / export)
           │
           ▼
    [MCP + HTTP Server]  (Node.js, :3000)
    │  • MCP tool handlers
    │  • REST POST /render, POST /clear, GET /export  (curl-friendly fallback)
    │  • WebSocket /stream  (push to browser)
    │  • Serves the Svelte SPA (static files in production)
    │  • In-memory session state (one canvas at a time)
    │
    │  ── dev only ──────────────────────────────────────
    │  Vite dev server (:5173) runs alongside Node (:3000)
    │  Browser opens :5173; Vite proxies /render, /stream,
    │  /mcp to :3000. Node serves static files only in the
    │  production build (Phase 2 packaging concern).
           │
           ▼
    [Browser SPA]  (Svelte)
    │  • Receives render commands via WebSocket
    │  • Renders: Mermaid only (v1)
    │  • export() returns Mermaid source as text
    │  • Auto-opens on server start
```

**Phase 2 additions** (not in v1):
- WebSocket back-channel: browser → server → agent (bidirectionality) — requires research spike before implementation: verify whether Claude Code's SSE MCP session supports async server-push events; if not, evaluate polling (`get_events()`) or out-of-band callback (see `02` E1)
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
| `render(type, payload)` | Validates Mermaid payload; pushes render command to browser via WebSocket (action always `"replace"` in v1); stores as current canvas state |
| `clear()` | Resets in-memory canvas state; sends clear command to browser |
| `export()` | Returns current Mermaid source as text; returns empty string if canvas is empty or was cleared; no binary in v1 |
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

**Validation is a hard gate:** on failure, nothing is pushed to the browser and the error is returned to the agent only. The browser state is unchanged.

### MCP tool response shapes

| Tool | Success | Failure |
|------|---------|---------|
| `render` | `{ "ok": true }` | `{ "ok": false, "error": "..." }` |
| `clear` | `{ "ok": true }` | — (always succeeds) |
| `export` | `{ "ok": true, "data": "<mermaid source>" }` — empty string if canvas is blank | `{ "ok": false, "error": "..." }` |

**Browser-side render errors:** if the payload passes server validation but the renderer fails (e.g. Mermaid.js throws), the browser displays the error message inline on the canvas in place of the diagram.

### REST fallback response shapes

The REST fallback endpoints (`POST /render`, `POST /clear`, `GET /export`) return the same JSON shapes as the MCP tool responses above. `GET /export` returns the JSON body `{ "ok": true, "data": "<mermaid source>" }` (not raw text).

---

## 4. Data Flows

### Render Command

```
agent calls render(type="mermaid", payload="graph TD; A-->B")
  → MCP server validates payload
  → stores as current canvas state (in-memory)
  → pushes JSON command over WebSocket to browser:
      { action: "replace", type: "mermaid", payload: "graph TD; A-->B" }
      (action is always "replace" in v1 — hardcoded server-side; Phase 2 adds "append" etc.)
  → browser receives, hands off to Mermaid.js renderer
  → diagram appears in browser tab
  → MCP tool returns { ok: true }
```

### Clear Command

```
agent calls clear()
  → MCP server resets in-memory canvas state
  → pushes JSON command over WebSocket to browser:
      { action: "clear" }
  → browser clears the canvas (blank state)
  → MCP tool returns { ok: true }
```

### Export Command

```
agent calls export()
  → MCP server reads current in-memory canvas state
  → if canvas is empty (never rendered, or cleared):
      MCP tool returns { ok: true, data: "" }
  → otherwise:
      MCP tool returns { ok: true, data: "<mermaid source>" }
  (no WebSocket push — export is a read-only query; browser state is unchanged)
```

---

## 5. API Payload Shape

```json
{
  "action": "replace",
  "type": "mermaid",
  "payload": "graph TD; A --> B"
}
```

`action` is always `"replace"` in v1 — hardcoded server-side, not part of the MCP tool signature.
`append`, `step` actions, `options` (theme etc.), and all non-Mermaid types are Phase 2.

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
├── .mcp.json             # MCP server registration — committed to repo
├── tsconfig.json         # server TypeScript config (see below)
├── package.json
└── CLAUDE.md
```

### TypeScript configuration (server)

- Module system: **ESM** (`"module": "NodeNext"`, `"moduleResolution": "NodeNext"`)
- Target: `ES2022` (Node 18 supports it natively; no downlevel async needed)
- Strict mode: `true`
- Rationale: Hono and `@modelcontextprotocol/sdk` are ESM-first; CJS interop adds friction

The Svelte/Vite client has its own `tsconfig.json` generated by `create svelte` — no manual config needed.

---

## 7. MCP Registration

`.mcp.json` is committed to the repo root.

> ⚠️ ASSUMPTION: Claude Code loads `.mcp.json` automatically on project open. Verified on Claude Code ≥ 1.x (CLI); behaviour on older versions or IDE extensions may differ — confirm at Sprint 0.

```json
{
  "mcpServers": {
    "agent-whiteboard": {
      "type": "sse",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

- The server must be running before Claude Code connects — `npm run dev` starts it.
- Port `3000` is the default; overridable via `PORT` environment variable.

---

## 8. Dev Plan — MVP Tasks

### Sprint 0 — Scaffold
- [ ] Init Node.js project (`package.json`, TypeScript config)
- [ ] Init Svelte project inside `client/` with Vite
- [ ] Configure Vite proxy: `/render`, `/mcp` → `localhost:3000` (HTTP); `/stream` → `localhost:3000` with `ws: true` (WebSocket)
- [ ] Add `concurrently` + `wait-on` to root `package.json`; `npm run dev` starts Node first, waits for `http://localhost:3000/mcp` to be reachable, then starts Vite. Once Vite is ready (`:5173`), the `open` package opens the browser. Browser is opened by the startup script (not the Node server) to avoid a race where the browser loads before Vite is serving. Assumption: Claude Code connects after the server is already running (typical real-world flow); `wait-on` covers the automated case.
- [ ] Commit `.mcp.json` with SSE registration pointing to `http://localhost:3000/mcp`
- [ ] **Verify** that Claude Code auto-loads `.mcp.json` from the project root on open (see `04` §7); if not, document the manual step required

### Sprint 1 — Transport layer
- [ ] HTTP server with REST `POST /render`, `POST /clear`, `GET /export` endpoints
- [ ] WebSocket server (`/stream`) — push JSON commands to connected browser
- [ ] Svelte SPA connects to WebSocket and logs received commands

### Sprint 2 — MCP server
- [ ] Add `@modelcontextprotocol/sdk` to server
- [ ] Implement `render`, `clear`, `export` tool handlers (SSE transport)
- [ ] Wire MCP handlers to in-memory session + WebSocket push

### Sprint 3 — Renderer
- [ ] Mermaid renderer (Mermaid.js)

### Sprint 4 — UX baseline
- [ ] Auto-open browser: startup script opens `:5173` after Vite is ready (via `open` npm package; not the Node server — see Sprint 0)
- [ ] Zoom/pan for diagram renderer
- [ ] `export()` returns current source spec as text

### Testing strategy — v1

Minimal automated integration tests only. No unit tests, no e2e/browser automation in v1.

MCP tool handlers are thin wrappers over the same session logic exercised by the REST tests. MCP correctness is verified manually at Sprint 0; no separate MCP integration tests in v1.

Covered by automated tests:
- `POST /render` with a valid Mermaid payload → `{ ok: true }`
- `POST /render` with a missing/invalid keyword → `{ ok: false, error: "..." }`, canvas unchanged
- `POST /render` then `GET /export` (or MCP `export()`) → returns the submitted source
- `POST /clear` → canvas reset; subsequent `export()` returns empty string

Test runner: **Vitest** (shares the Node/TypeScript stack; no separate config needed).

Full Mermaid render correctness and browser behaviour verified manually.

Phase 2: add Playwright e2e once the UX stabilises.

### Definition of Done — MVP
- Agent can call `render(type="mermaid", payload)` and diagram appears in browser within 200ms
- Agent can call `clear()` to reset the canvas
- Agent can call `export()` to retrieve the current Mermaid source as text
- Server starts with `npm run dev`, browser opens automatically
- Runs on macOS, Linux, Windows
- Binding address and port are configurable via environment variables (default: `localhost:3000`)
- `.mcp.json` committed to repo; Claude Code connects to the MCP server without manual config
