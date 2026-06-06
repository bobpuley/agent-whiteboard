# Architecture

> Decisions made here supersede deferred items in `01_input-ideas.md` and `02_assumptions-and-risks.md`.
> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## 1. Stack Decisions

| Layer                      | Choice                                                                                                                                                                                                                                                                                                       | Rationale                                                                                                                                                                                                                                              |
|----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Backend runtime            | Node.js ≥ 18 (LTS)                                                                                                                                                                                                                                                                                           | Better concurrency for multi-user WebSocket at scale; single runtime with browser; easier binary packaging in future. Node 18 is the minimum for Hono and `@modelcontextprotocol/sdk`.                                                                 |
| Backend framework          | Hono                                                                                                                                                                                                                                                                                                         | First-class TypeScript, ~15 kB bundle, minimal overhead; Express ruled out — heavier, bolted-on types                                                                                                                                                  |
| MCP server                 | Node.js MCP SDK (`@modelcontextprotocol/sdk`)                                                                                                                                                                                                                                                                | Official SDK, Node-native. Pin to exact version at `npm init` (Sprint 0); treat upgrades as deliberate decisions.                                                                                                                                      |
| MCP transport              | SSE (HTTP + Server-Sent Events)                                                                                                                                                                                                                                                                              | Server has its own lifecycle (also drives browser); SSE avoids a second process. stdio ruled out — requires Claude Code to spawn the server, but server must already be running for the browser.                                                       |
| Frontend framework         | Svelte                                                                                                                                                                                                                                                                                                       | Minimal bundle, reactive by default, no virtual DOM overhead; replaceable at low cost given thin v1 UX                                                                                                                                                 |
| Rendering libraries        | Mermaid.js ^11, KaTeX, vega-lite + vega-embed, DOMPurify (all npm, bundled by Vite)                                                                                                                                                                                                                         | Mermaid pinned to ^11 (breaking changes between major versions make floating risky). KaTeX, Vega-Lite, SVG/HTML (DOMPurify) added in Sprint 5 ✅. D2 and D3 deferred (D2 requires server-side render process; D3 is post-Phase-2 nice-to-have). |
| Transport (server→browser) | WebSocket                                                                                                                                                                                                                                                                                                    | Real-time incremental updates                                                                                                                                                                                                                          |
| Packaging (v1)             | `npm run dev` — dev-only, no distribution concern yet                                                                                                                                                                                                                                                        | No remote repo yet; packaging deferred                                                                                                                                                                                                                 |
| Dev server                 | Separate Vite dev server (`localhost:5173`) + Node server (`localhost:3000`); started together via `concurrently`; Vite proxies `/render`, `/stream`, `/mcp` to Node. **`/stream` requires `ws: true`** in Vite proxy config (WebSocket proxying is opt-in; HTTP proxy alone does not cover WS connections). | HMR on Svelte side; Node server implementation unchanged; production static build deferred to Phase 2                                                                                                                                                  |
| Browser auto-open          | `open` npm package                                                                                                                                                                                                                                                                                           | Cross-platform (macOS/Linux/Windows) with a single API call; no platform-specific logic                                                                                                                                                                |

---

## 2. System Architecture

```
[Claude Code agent]
    │
    └── MCP tool calls (render / clear / export / step)
           │
           ▼
    [MCP + HTTP Server]  (Node.js, :3000)
    │  • MCP tool handlers
    │  • REST POST /render, POST /clear, GET /export, POST /step  (curl-friendly fallback)
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
    │  • Renders: Mermaid, SVG/HTML, KaTeX, Vega-Lite (v1); step-through frames
    │  • export() returns last render() payload as text (all types)
    │  • Auto-opens on server start
    │  • Done button → POST /user-done → signalDone() → wakes wait_done() tool
```

**Shipped in MVP (not Phase 2):**
- Full server-side Mermaid parse validation — Sprint 6 ✅
- `step()` tool + step-through frame sequences — Sprint 7 ✅
- SVG/HTML, Vega-Lite, KaTeX renderers — Sprint 5 ✅ (D2 is post-Phase-2 — requires server-side render process)
- `options.title` overlay — Sprint 8 ✅

**Shipped in Phase 2:**
- Slideshow / auto-play (`slideshow()`, `slideshow_stop()`) — Sprint 9 ✅. Each slide broadcast using the same WebSocket event format as `POST /render`. `step-frames` slides expanded into individual timer ticks.
- `wait_done()` tool + Done button — Sprint 10 ✅. `server/events.ts` EventEmitter bus; `signalDone()` called by `POST /user-done`; `waitForDone()` called by both `POST /wait-done` (REST) and `wait_done()` (MCP tool). See §3 and §4.
- Channels API experiment (`server/channel.ts`) — Sprint 10 ✅. Stdio MCP channel server + HTTP relay on port 3001. Useful for async push events; not used as the primary "wait for user" primitive (see `02` E1).

**Remaining Phase 2 / Phase 3:**
- Node click events and other interactive signals (browser → agent via `signalNodeClick()` pattern)
- Multi-panel / named tabs
- Binary export (PNG/SVG/PDF)
- `options.theme` and action-variant options for `render()`
- Multi-user session management *(Phase 3)*
- Remote deployment / auth *(Phase 3)*

---

## 3. MCP Tool Implementations

| Tool                              | Server-side action                                                                                                                                                                                                                  |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `render(type, payload[, options])`| Validates payload for the given type; pushes render command to browser via WebSocket; stores as current canvas state. `options.title` (optional string, MVP) displays a label above the canvas. `options.theme` and action variants are Phase 2. For `step-frames`: loads all frames, displays frame 0, stores full payload. |
| `clear()`                         | Resets in-memory canvas state and step cursor; sends clear command to browser                                                                                                                                                       |
| `export()`                        | Returns the last submitted source payload verbatim as a string. For all types (mermaid, svg, katex, vega-lite, step-frames): returns whatever was passed to `render()`. Empty string if canvas is empty or cleared.                 |
| `step(direction)`                 | Advances (`"next"`) or rewinds (`"prev"`) the step cursor for a loaded `step-frames` sequence. Returns `{ ok: true, current_frame: N, total_frames: M }`. No-op (returns error) if no step-frames sequence is loaded. (MVP — Sprint 7 ✅) |
| `wait_done()`                     | Calls `waitForDone()` from `server/events.ts` — suspends until `signalDone()` fires (user clicks Done) or the 10-minute timeout elapses. Returns `{ ok: true }`. All concurrent `wait_done()` calls resolve simultaneously on a single click. (Phase 2 — Sprint 10 ✅) |
| `wait_click([node_actions])`      | Arms the browser click listener; suspends until `signalClick(event)` fires (user clicks a node/edge) or the 10-minute timeout elapses. `node_actions` (optional): map of node ID → string[] — pushed to browser via WebSocket `set_node_actions` command before suspending. Returns `{ ok: true, type, id, label, action? }`. Only one `wait_click()` active at a time; a second call cancels the first. (Phase 2 — Sprint 12) |

### Validation — two layers

**Layer 1 — MCP tool definition** (agent-facing, in `mcp.ts`)
The tool's JSON Schema and description are read by the agent when it loads the MCP server. Rich schemas and inline examples are the primary defence against hallucinated payloads.

| Type      | Schema hint exposed to agent                                                                                                                         |
|-----------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mermaid` | `string` — must begin with a valid diagram keyword (`graph`, `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `mindmap`) |

Additional types exposed in v1 (Sprint 5 ✅): `vega-lite`, `katex`, `svg`, `html`. Step-frames exposed in v1 (Sprint 7 ✅): `step-frames`.
Post-Phase-2 (deferred): `d2` — requires a server-side render process, not client-side.

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

| Tool     | Success                                                                                                                                 | Failure                           |
|----------|-----------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------|
| `render` | `{ "ok": true }`                                                                                                                        | `{ "ok": false, "error": "..." }` |
| `clear`  | `{ "ok": true }`                                                                                                                        | — (always succeeds)               |
| `export` | `{ "ok": true, "data": "<source>" }` — verbatim last `render()` payload; empty string if canvas is blank. Same contract for all types. | — (always succeeds) |
| `step`       | `{ "ok": true, "current_frame": N, "total_frames": M }`                                                                              | `{ "ok": false, "error": "..." }` |
| `wait_click` | `{ "ok": true, "type": "node"\|"edge", "id": "<id>", "label": "<label>", "action": "<chosen>" }` — `action` only present when `node_actions` was supplied and user selected one. On timeout: `{ "ok": true, "type": "timeout" }`. | — |

**Browser-side render errors:** if the payload passes server validation but the renderer fails (e.g. Mermaid.js throws), the browser displays the error message inline on the canvas in place of the diagram.

### REST fallback response shapes

The REST fallback endpoints (`POST /render`, `POST /clear`, `GET /export`) return the same JSON shapes as the MCP tool responses above. `GET /export` returns the JSON body `{ "ok": true, "data": "<source>" }` — verbatim last `render()` payload for any type (not raw text).

`POST /step` was added in Sprint 7 (MVP ✅). Body: `{ "direction": "next" | "prev" }`. Returns the same shape as the MCP `step()` response.

`POST /user-done` was added in Sprint 10 (Phase 2 ✅). No body required. Calls `signalDone()` to wake all pending `wait_done()` calls; also forwards to channel relay. Returns `{ ok: true }`.

`POST /wait-done` was added in Sprint 10 (Phase 2 ✅). No body. Long-polls until `signalDone()` fires or the 10-minute timeout elapses. Returns `{ ok: true }`.

`POST /node-click` — Phase 2 (Sprint 12). Body: `{ "type": "node"|"edge", "id": "<id>", "label": "<label>", "action": "<chosen>" }`. Calls `signalClick(event)` (events.ts) to resolve any pending `waitForClick()`. Returns `{ "ok": true }`. No-op if no `wait_click()` is pending.

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
      MCP tool returns { ok: true, data: "<source>" }  (verbatim last render() payload, any type)
  (no WebSocket push — export is a read-only query; browser state is unchanged)
```

### Done Signal

```
user clicks Done button in browser
  → browser fires POST /user-done to Hono server
  → server calls signalDone()  (events.ts EventEmitter bus)
  → all pending waitForDone() promises resolve
  → any suspended wait_done() MCP tool calls return { ok: true } to agent
  → server also forwards to channel relay on port 3001 (if running)
  → browser button shows "Sent ✓" for 2s
```

### Node Click Flow (Phase 2 — Sprint 12)

```
agent calls wait_click([node_actions])
  → server pushes WebSocket command to browser:
      { action: "set_node_actions", node_actions: { "A": ["Explain", "Drill down"], ... }, enabled: true }
  → browser arms click listener on all Mermaid SVG node/edge elements
      (nodes with registered actions show popup on click; others accept plain click)
  → server suspends via waitForClick()
  → user clicks a node (or selects an action from popup)
  → browser fires POST /node-click:
      { type: "node", id: "A", label: "Client", action: "Drill down" }
  → server calls signalClick(event)  (events.ts EventEmitter bus)
  → waitForClick() resolves
  → server pushes { action: "set_node_actions", enabled: false } to disarm browser
  → MCP wait_click() returns { ok: true, type: "node", id: "A", label: "Client", action: "Drill down" }

Agent then handles the result (examples):
  • case 1 — drill-down: call render() with an expanded diagram
  • case 2 — navigation: call step() until the target frame
  • case 3 — explain: generate explanation in CLI
  • case 4 — action chosen: switch on action string, call appropriate tool
```

**Mermaid node ID extraction (browser-side):**
After `mermaid.render()` produces an SVG, the Svelte component intercepts `click` events on SVG elements with class `.node` (nodes) and `.edgePath` / `.edgeLabel` (edges). Node IDs are embedded in the SVG element's `id` attribute as `flowchart-<nodeId>-<counter>`; the component strips prefix and counter to recover the original source ID. For edge elements, source+target are extracted from the `id`. Node labels are read from the innerText of the `.nodeLabel` child element.

---

## 5. API Payload Shape

```json
{
  "action": "replace",
  "type": "mermaid",
  "payload": "graph TD; A --> B"
}
```

`action` is always `"replace"` in v1 — hardcoded server-side, not part of the MCP tool signature. `append` and other action variants are Phase 2. `options.theme` is Phase 2; `options.title` is MVP (Sprint 8 ✅). Non-Mermaid types (`svg`, `html`, `katex`, `vega-lite`, `step-frames`) are all MVP (Sprints 5 & 7 ✅); `d2` is post-Phase-2.

### `options` parameter

`render()` accepts an optional third argument `options`. `options.title` is MVP (Sprint 8 ✅). In Phase 2, `theme` is added:

```json
{
  "theme": "dark"
}
```

| Key     | Type                   | Phase | Default  | Description                              |
|---------|------------------------|-------|----------|------------------------------------------|
| `title` | `string`               | MVP   | `""`     | Displays a label above the canvas for this render call. Hidden if absent or empty. Cleared by `clear()`. Not included in `export()` output. |
| `theme` | `"dark" \| "light"`   | Phase 2 | `"dark"` | Sets the canvas theme for this render call. Persists until next `render()` or explicit change. |

Additional `options` keys (action variants etc.) are deferred beyond Phase 2.

### Step-frames protocol (MVP — Sprint 7 ✅)

Step-through is a two-tool protocol:

1. **Load:** `render(type="step-frames", payload=<JSON string>)` — validates, stores all frames, displays frame 0. Returns `{ ok: true }`.
2. **Navigate:** `step(direction="next"|"prev")` — advances or rewinds the cursor. Returns `{ ok: true, current_frame: N, total_frames: M }`.
3. **Export:** `export()` — returns the full original frames JSON string (not the current frame), so the agent can reconstruct or resume the sequence.

`clear()` resets the step cursor along with the canvas.

### Step-frames payload shape (MVP — Sprint 7 ✅)

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
│   ├── app.ts            # Hono app + REST endpoints (testable, no startup side effects)
│   ├── app.test.ts       # Vitest integration tests (47 tests)
│   ├── mcp.ts            # MCP tool definitions and handlers
│   ├── session.ts        # in-memory canvas state
│   ├── slideshow.ts      # slideshow timer logic
│   ├── events.ts         # signalDone/waitForDone + signalClick/waitForClick EventEmitter bus
│   ├── validate.ts       # Mermaid keyword + parse validation
│   ├── ws.ts             # WebSocket push to browser
│   └── channel.ts        # stdio channel server (Channels API experiment)
├── client/               # Svelte SPA
│   ├── src/
│   │   ├── App.svelte
│   │   ├── ws.ts         # WebSocket client
│   │   └── renderers/    # one file per content type
│   │       ├── Mermaid.svelte
│   │       ├── Html.svelte
│   │       ├── Katex.svelte
│   │       └── VegaLite.svelte
│   └── public/
├── e2e/
│   └── canvas.spec.ts    # Playwright e2e tests (16 tests) — Sprint 11
├── docs/
├── .mcp.json             # MCP server registration — committed to repo
├── playwright.config.ts  # Playwright config — Sprint 11
├── vitest.config.ts      # scopes Vitest to server/**/*.test.ts — Sprint 11
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

> ✅ VERIFIED (Sprint 0, 2026-05-31): Claude Code loads `.mcp.json` automatically on project open. The server must be **enabled manually** via `/mcp enable agent-whiteboard` or the `/mcp` dialog after first open; once enabled, tools are available. Behaviour on older versions or IDE extensions may differ.

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
