# Dev Plan

> Phase tags: **MVP** = v1 scope; **Phase 2** = planned, not v1.

---

## MVP Sprints (Sprints 0–8)

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

## Phase 2 Sprint Plan

### Sprint 9 — Slideshow / Auto-play ✅

**Goal:** add a server-side `/slideshow` endpoint that accepts a playlist of slides and a delay, then auto-advances the canvas internally on a timer — no external orchestration required.

**Scope:**
- [x] `POST /slideshow` — accepts `{ slides: [{ type, payload, title? }], delay_ms: number }`, validates each slide (same rules as `/render`), starts an internal timer loop broadcasting one slide per interval
- [x] `POST /slideshow/stop` — cancels the running timer
- [x] Server holds at most one active slideshow at a time; a new `POST /slideshow` cancels any running one
- [x] `POST /render` and `POST /clear` also cancel any running slideshow (canvas ownership transfers)
- [x] No browser UI changes required — the browser just receives the same `replace`/`clear` WebSocket events it already handles
- [x] MCP: expose `slideshow(slides, delay_ms)` and `slideshow_stop()` tools alongside the existing ones
- [x] Manual test: updated `manualtests/showcase.js` to use `/slideshow` instead of scripted sleep loops

> **Implementation note:** slideshow state lives in `server/slideshow.ts` (new module). The validation helper `validatePayload()` was extracted in `app.ts` and reused by both `/render` and `/slideshow` to keep type-specific rules in one place. Slideshow advances through slides once (no loop); stops after the last slide. `step-frames` type is accepted in slideshow slides (frame 0 is displayed; browser Prev/Next buttons remain functional within that frame sequence).

**DoD:**
- [x] `node manualtests/showcase.js` produces the same 6-slide tour driven entirely by the server timer
- [x] A second call to `/slideshow` while one is running cancels the first and starts the new one
- [x] `POST /slideshow/stop` stops the timer and leaves the last rendered slide on screen

---

### Sprint 9 — Bug fix: slideshow step-frames renders nothing

- [x] **`server/slideshow.ts` — `broadcastSlide()`:** when a slide's `type` is `"step-frames"`, parse the JSON payload, call `setStepFrames()`, and broadcast frame 0 in the same format as `POST /render` (`{ action: "replace", type: frame_type, payload: frames[0].payload, stepFrames: true, currentFrame: 0, totalFrames: N }`). For all other types, the existing passthrough is correct.
- [x] **Tests:** add a test asserting that a slideshow containing a `step-frames` slide broadcasts the first frame (not the raw JSON) and leaves the session in step-frames state (so subsequent `POST /step` calls work).

**DoD:** `node manualtests/showcase.js --type step-frames` shows the first frame of the step-through sequence in the browser; Prev/Next navigation continues to work after the slideshow stops.

---

### Sprint 10 — Bidirectionality (deferred — after 5–8)

Requires `--dangerously-load-development-channels server:agent-whiteboard-events` during preview (verify exact syntax at Sprint 10 time — research preview flag). Defer until Sprints 5–8 are shipped and the Channels API is closer to GA.

**Trigger to proceed:** `--dangerously-load-development-channels` is no longer required (Channels API reaches GA in Claude Code), or the research preview has been stable across two consecutive Claude Code releases.

See `02` E1 for architecture. High-level:
- New stdio channel server (`server/channel.ts`) separate from the SSE server
- Bridges browser WebSocket user events → `notifications/claude/channel` events
- Adds a `reply` tool so Claude can send messages back through the channel

---

## Definition of Done — MVP
- Agent can call `render(type="mermaid", payload)` and diagram appears in browser within 200ms
- Agent can call `clear()` to reset the canvas
- Agent can call `export()` to retrieve the current canvas source as text (verbatim last `render()` payload, any type)
- Server starts with `npm run dev`, browser opens automatically
- Runs on macOS, Linux, Windows
- Binding address and port are configurable via environment variables (default: `localhost:3000`)
- `.mcp.json` committed to repo; Claude Code connects to the MCP server without manual config
