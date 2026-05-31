# Architecture and Plan

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
```

**Shipped in MVP (not Phase 2):**
- Full server-side Mermaid parse validation — Sprint 6 ✅
- `step()` tool + step-through frame sequences — Sprint 7 ✅
- SVG/HTML, Vega-Lite, KaTeX renderers — Sprint 5 ✅ (D2 is post-Phase-2 — requires server-side render process)
- `options.title` overlay — Sprint 8 ✅

**Phase 2 additions** (not in v1):
- Bidirectionality (browser → agent): implemented via a **separate stdio channel server** (Channels API, Claude Code ≥ v2.1.80 research preview). The channel server bridges browser WebSocket/REST → `notifications/claude/channel` events in the Claude Code session. The existing SSE server is unchanged. Requires `--dangerously-load-development-channels server:agent-whiteboard-events` during preview (verify exact syntax at Sprint 10 — research preview flag, may change before GA). See `02` E1 for full rationale.
- Slideshow / auto-play (`slideshow()`, `slideshow_stop()`) — Sprint 9
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
| `step`   | `{ "ok": true, "current_frame": N, "total_frames": M }`                                                                                 | `{ "ok": false, "error": "..." }` |

**Browser-side render errors:** if the payload passes server validation but the renderer fails (e.g. Mermaid.js throws), the browser displays the error message inline on the canvas in place of the diagram.

### REST fallback response shapes

The REST fallback endpoints (`POST /render`, `POST /clear`, `GET /export`) return the same JSON shapes as the MCP tool responses above. `GET /export` returns the JSON body `{ "ok": true, "data": "<source>" }` — verbatim last `render()` payload for any type (not raw text).

`POST /step` was added in Sprint 7 (MVP ✅). Body: `{ "direction": "next" | "prev" }`. Returns the same shape as the MCP `step()` response.

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

| Key     | Type                   | Default  | Description                              |
|---------|------------------------|----------|------------------------------------------|
| `theme` | `"dark" \| "light"`   | `"dark"` | Sets the canvas theme for this render call. Persists until next `render()` or explicit change. |

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

---

## 8. Dev Plan — MVP Tasks

### Sprint 0 — Scaffold ✅
- [x] Init Node.js project (`package.json`, TypeScript config)
- [x] Init Svelte project inside `client/` with Vite
- [x] Configure Vite proxy: `/render`, `/mcp` → `localhost:3000` (HTTP); `/stream` → `localhost:3000` with `ws: true` (WebSocket)
- [x] Add `concurrently` + `wait-on` to root `package.json`; `npm run dev` starts Node first, waits for `http://localhost:3000/mcp` to be reachable, then starts Vite. Browser auto-open wired to startup script (Sprint 4).
- [x] Commit `.mcp.json` with SSE registration pointing to `http://localhost:3000/mcp`
- [x] **Verified** — Claude Code loads `.mcp.json` automatically, but the server must be **enabled manually** via `/mcp enable agent-whiteboard` or the `/mcp` dialog after first open. Once enabled, tools are available in the session. Fixed a bug: `McpServer` must be instantiated **per SSE connection** (not as a singleton) — the SDK throws "Already connected to a transport" otherwise.

> **Implementation note:** macOS 11 (Big Sur) is incompatible with esbuild ≥ 0.21 (requires macOS 12). Stack pinned to Vite 4 + Svelte 4 + `@sveltejs/vite-plugin-svelte` v2 + vitest 0.34 to stay within the esbuild 0.18 range. `ws` npm package used for WebSocket instead of `@hono/node-server/ws` (not exported at the installed version). Revisit on macOS 12+ or when upgrading Node infra.

### Sprint 1 — Transport layer ✅
- [x] HTTP server with REST `POST /render`, `POST /clear`, `GET /export` endpoints
- [x] WebSocket server (`/stream`) — push JSON commands to connected browser
- [x] Svelte SPA connects to WebSocket and dispatches render commands

### Sprint 2 — MCP server ✅
- [x] Add `@modelcontextprotocol/sdk` to server
- [x] Implement `render`, `clear`, `export` tool handlers (SSE transport)
- [x] Wire MCP handlers to in-memory session + WebSocket push

### Sprint 3 — Renderer ✅
- [x] Mermaid renderer (Mermaid.js) — renders diagrams; displays inline error on parse failure

### Sprint 4 — UX baseline ✅
- [x] Auto-open browser: `dev:open` script runs `wait-on http://localhost:5173 && open http://localhost:5173`; added as third concurrently process in `npm run dev`
- [x] Zoom/pan for diagram renderer: scroll-to-zoom (cursor-anchored), drag-to-pan, double-click to reset — implemented in CSS transforms inside `Mermaid.svelte`; no new dependencies
- [x] `export()` returns current canvas source spec as JSON `{ ok: true, data: "..." }` (MCP + REST)

### Testing ✅
- [x] Extracted `createApp()` into `server/app.ts` (testable without side effects); added `resetCanvas()` to `session.ts` for test isolation
- [x] `server/app.test.ts`: 9 integration tests covering all 4 scenarios from the testing strategy (valid render, invalid keyword, render→export round-trip, clear→export empty)

### Testing strategy — v1

Minimal automated integration tests only. No unit tests, no e2e/browser automation in v1.

MCP tool handlers are thin wrappers over the same session logic exercised by the REST tests. MCP correctness verified manually: `export()`, `render()`, and `clear()` confirmed working end-to-end (MCP → WebSocket → browser) on 2026-05-31.

Covered by automated tests:
- `POST /render` with a valid Mermaid payload → `{ ok: true }`
- `POST /render` with a missing/invalid keyword → `{ ok: false, error: "..." }`, canvas unchanged
- `POST /render` then `GET /export` (or MCP `export()`) → returns the submitted source
- `POST /clear` → canvas reset; subsequent `export()` returns empty string

Test runner: **Vitest** (shares the Node/TypeScript stack; no separate config needed).

Full Mermaid render correctness and browser behaviour verified manually.

Playwright e2e: deferred to after Sprint 10 (bidirectionality) — browser interaction tests are most valuable once the full interactive surface is stable. No dedicated sprint before then.

### Sprint 5 — Additional renderers ✅

Priority order: SVG/HTML first (trivial), then KaTeX, then Vega-Lite. D2 deferred (requires a server-side render process).

- [x] **SVG/HTML renderer** (`type="svg"` and `type="html"`)
  - Server: accept `svg` and `html` as valid types; no keyword validation (passthrough — any string is a valid HTML/SVG payload); only the `type` field is validated against the known-types list
  - Browser: new `Html.svelte` renderer — strips malicious markup with DOMPurify before setting `innerHTML`; sanitization is silent (no error state — the cleaned output is rendered)
  - MCP schema: expose `svg` and `html` as accepted types with inline examples
  - DoD: agent calls `render(type="svg", payload="<svg>...</svg>")` and SVG appears in browser; XSS vectors are stripped by DOMPurify before render
- [x] **KaTeX renderer** (`type="katex"`)
  - Browser: new `Katex.svelte` renderer — npm install `katex`, render LaTeX string in display mode
  - Server: accept `katex` type; no structural validation (KaTeX handles parse errors in-browser)
  - DoD: agent calls `render(type="katex", payload="E = mc^2")` and rendered math appears
- [x] **Vega-Lite renderer** (`type="vega-lite"`)
  - Browser: new `VegaLite.svelte` renderer — npm install `vega-lite` + `vega-embed`; parse payload as JSON and embed
  - Server: accept `vega-lite` type; validate payload is parseable JSON before pushing
  - DoD: agent calls `render(type="vega-lite", payload=<Vega-Lite JSON string>)` and chart appears
- [x] Update MCP tool schema to expose all new types
- [x] Update `export()` — already correct by design: returns verbatim last payload for all types

### Sprint 6 — Full server-side Mermaid parse validation ✅

- [x] Add Mermaid.js as a Node.js import in `server/` via `server/validate.ts`
- [x] In `app.ts` / `mcp.ts`: after keyword-prefix check, attempt `mermaid.parse(payload)` — reject with structured error if it throws
- [x] DoD: `render(type="mermaid", payload="graph TD; A -->")` (valid keyword, invalid syntax) returns `{ ok: false, error: "..." }` and nothing is pushed to the browser

> **Implementation note:** Some diagram types (classDiagram, gantt, pie, mindmap) internally call DOMPurify during `mermaid.parse()`, which requires a DOM context unavailable in Node.js. Those errors are treated as "Node environment limitation — validation skipped"; the keyword-prefix check (Layer 1) remains the safety net for those types. Genuine parse errors (`Parse error on line N: ...`) are always rejected. Types where full Node.js parse works: graph/flowchart, sequenceDiagram, erDiagram.

### Sprint 7 — Step-through (`step()` tool + frame sequences) ✅

- [x] **Server:** implement `step(direction)` MCP tool
  - In-memory: extended `session.ts` with `frames[]`, `currentFrame`, `frameType`, `rawPayload` alongside `canvasState`
  - `render(type="step-frames", payload)`: parse JSON, validate structure, store frames, push frame 0 to browser
  - `step(direction)`: advance/rewind cursor, push new frame to browser, return `{ ok: true, current_frame, total_frames }`
  - `clear()`: resets entire canvas including frames + cursor
  - `export()`: returns original full frames JSON string
- [x] **Browser:** step caption overlay (shows `frame.label` if present) in step-bar
- [x] **Browser:** prev/next nav buttons visible only when a step-frames sequence is active; clicking calls `POST /step` REST fallback
- [x] **MCP schema:** `step-frames` type exposed in `render()` with inline example; `step(direction)` tool registered
- [x] **REST fallback:** `POST /step` endpoint with body `{ "direction": "next" | "prev" }`; returns same JSON as MCP `step()` response
- [x] DoD: agent loads a 3-frame Mermaid step sequence; calls `step("next")` twice; browser advances correctly; `export()` returns the full frames JSON; `curl -X POST /step -d '{"direction":"next"}'` also advances the sequence

### Sprint 8 — Title overlay ✅

Add an optional `title` parameter to `render()` that displays a label above the canvas content, independent of the renderer type.

- [x] **API:** extend `render(type, payload, options?)` — `options.title` is an optional string; no other `options` keys in this sprint
- [x] **Server (`app.ts` / `mcp.ts`):** pass `title` (if present) in the WebSocket push: `{ action: "replace", type, payload, title?: string }`; store alongside canvas state in `session.ts`
- [x] **Browser (`App.svelte`):** render a `<header class="canvas-title">` above the renderer when `title` is set; hidden when absent or on `clear()`
- [x] **`export()`:** title is not part of the exported source spec — it is display metadata only
- [x] **MCP schema:** document `options.title` in the `render()` description with an inline example
- [x] **`manualtests/showcase.js`:** update all examples to pass a title via `options`
- [x] **Browser — step-through nav buttons:** `Prev` is disabled when `currentFrame === 0`; `Next` is disabled when `currentFrame === totalFrames - 1`. Requires the WebSocket push to carry `currentFrame` and `totalFrames` alongside the frame payload so the browser can track state without a separate query.
- [x] **Browser — page chrome:** add a subtle, elegant border around the canvas area to frame the content visually; keep it minimal (thin, neutral colour, slight rounding — no heavy shadows or gradients).
- [x] DoD: `render({ type: "mermaid", payload: "...", options: { title: "My diagram" } })` shows the title above the diagram; `render()` without `options` shows no title; `clear()` removes title; on a loaded step-through sequence, `Prev` is greyed out on frame 1 and `Next` is greyed out on the last frame; canvas area has a clean border

---

### Sprint 9 — Slideshow / Auto-play

**Goal:** add a server-side `/slideshow` endpoint that accepts a playlist of slides and a delay, then auto-advances the canvas internally on a timer — no external orchestration required.

**Scope:**
- `POST /slideshow` — accepts `{ slides: [{ type, payload, title? }], delay_ms: number }`, validates each slide (same rules as `/render`), starts an internal timer loop broadcasting one slide per interval
- `POST /slideshow/stop` — cancels the running timer
- Server holds at most one active slideshow at a time; a new `POST /slideshow` cancels any running one
- `POST /render` and `POST /clear` also cancel any running slideshow (canvas ownership transfers)
- No browser UI changes required — the browser just receives the same `replace`/`clear` WebSocket events it already handles
- MCP: expose `slideshow(slides, delay_ms)` and `slideshow_stop()` tools alongside the existing ones
- Manual test: update `manualtests/showcase.js` to use `/slideshow` instead of scripted sleep loops

**DoD:**
- `node manualtests/showcase.js` produces the same 6-slide tour driven entirely by the server timer
- A second call to `/slideshow` while one is running cancels the first and starts the new one
- `POST /slideshow/stop` stops the timer and leaves the last rendered slide on screen

---

### Sprint 10 — Bidirectionality (deferred — after 5–8)

Requires `--dangerously-load-development-channels server:agent-whiteboard-events` during preview (verify exact syntax at Sprint 10 time — research preview flag). Defer until Sprints 5–8 are shipped and the Channels API is closer to GA.

**Trigger to proceed:** `--dangerously-load-development-channels` is no longer required (Channels API reaches GA in Claude Code), or the research preview has been stable across two consecutive Claude Code releases.

See `02` E1 for architecture. High-level:
- New stdio channel server (`server/channel.ts`) separate from the SSE server
- Bridges browser WebSocket user events → `notifications/claude/channel` events
- Adds a `reply` tool so Claude can send messages back through the channel

---

### Definition of Done — MVP
- Agent can call `render(type="mermaid", payload)` and diagram appears in browser within 200ms
- Agent can call `clear()` to reset the canvas
- Agent can call `export()` to retrieve the current canvas source as text (verbatim last `render()` payload, any type)
- Server starts with `npm run dev`, browser opens automatically
- Runs on macOS, Linux, Windows
- Binding address and port are configurable via environment variables (default: `localhost:3000`)
- `.mcp.json` committed to repo; Claude Code connects to the MCP server without manual config
