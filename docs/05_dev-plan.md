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

### Testing strategy

Two test layers:

**Layer 1 — Server integration tests (Vitest)**

`server/app.test.ts` — 47 tests covering all REST endpoints. Runs with `npm test`. Scoped to `server/**/*.test.ts` via `vitest.config.ts` (added Sprint 11).

MCP tool handlers are thin wrappers over the same session logic exercised by the REST tests. MCP correctness verified manually: `export()`, `render()`, and `clear()` confirmed working end-to-end (MCP → WebSocket → browser) on 2026-05-31.

**Layer 2 — Browser e2e tests (Playwright) — Sprint 11 ✅**

`e2e/canvas.spec.ts` — 16 tests covering the full interactive browser surface. Runs with `npm run test:e2e`. Uses system Chrome (`channel: "chrome"`); `dev:test` starts the servers without opening a browser.

Covered scenarios:
- Initial placeholder state (confirms WebSocket connects)
- All 5 renderer types actually render in the browser (Mermaid, HTML, SVG, KaTeX, Vega-Lite)
- Title overlay show/hide/clear
- Clear reverts canvas to placeholder
- Step-frames: step-bar visible, Prev/Next disabled states, frame labels, browser button clicks (full client→server→WebSocket→browser round-trip)
- Done button label feedback and 2 s revert

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

### Sprint 9 — Bug fix: slideshow step-frames renders nothing ✅

- [x] **`server/slideshow.ts` — `broadcastSlide()`:** when a slide's `type` is `"step-frames"`, parse the JSON payload, call `setStepFrames()`, and broadcast frame 0 in the same format as `POST /render` (`{ action: "replace", type: frame_type, payload: frames[0].payload, stepFrames: true, currentFrame: 0, totalFrames: N }`). For all other types, the existing passthrough is correct.
- [x] **Tests:** add a test asserting that a slideshow containing a `step-frames` slide broadcasts the first frame (not the raw JSON) and leaves the session in step-frames state (so subsequent `POST /step` calls work).

**DoD:** `node manualtests/showcase.js --type step-frames` shows the first frame of the step-through sequence in the browser; Prev/Next navigation continues to work after the slideshow stops.

---

### Sprint 9 — Bug fix: slideshow step-frames does not auto-advance ✅

- [x] **`server/slideshow.ts` — `startSlideshow()`:** before starting the timer, expand any `step-frames` slides into individual frame entries via `expandSlides()`. A `FrameTick` carries `frames`, `frameType`, `rawPayload`, `frameIndex`, and optional `title`. `broadcastTick()` calls `setStepFrames()` on frame 0 and `seekStepFrame(index)` on subsequent frames.
- [x] **`server/session.ts` — `seekStepFrame(index)`:** new function to seek the cursor to an arbitrary frame without resetting the sequence. Used by the slideshow expander.
- [x] **Tests:** 3 new tests in `describe("POST /slideshow — step-frames auto-advance (B2)")`: timer advances through all 3 frames, session stays in step-frames state after full advance, mixed playlist correctly interleaves frame ticks and plain slides.
- [x] **Showcase:** `node manualtests/showcase.js --type step-frames` auto-advances through all 3 frames without manual input (verified manually).

**DoD:** `node manualtests/showcase.js --type step-frames` shows all 3 frames in sequence, each displayed for `delay_ms` before advancing, with no manual Prev/Next interaction required; session step-frames state is correct after the slideshow ends.

---

### Sprint 9 — Bug fix: slideshow stops after slide 1 → slide 2 ✅

- [x] **Investigate `server/slideshow.ts` — `startSlideshow()`:** root cause is in `manualtests/showcase.js`, not the server. `totalMs = activeSlides.length * DELAY_MS` counted slides, not ticks — after the B2 step-frames expansion, a single step-frames slide becomes N frame-ticks, so the showcase called `/slideshow/stop` too early (e.g. a step-frames slide with 3 frames got only 1 × DELAY_MS budget instead of 3).
- [x] **Fix the timer loop:** server timer loop is correct. Fixed `showcase.js`: `countTicks()` sums frame counts for step-frames slides and 1 for plain slides; `totalMs = countTicks(activeSlides) * DELAY_MS`. Log line notes tick count when it differs from slide count.
- [x] **Tests:** added `"advances through all 3 slides of a 3-slide playlist (B3)"` in `describe("POST /slideshow")` — verifies slide 0 at t=0, slide 1 after 1 interval, slide 2 after 2 intervals.

**DoD:** `node manualtests/showcase.js` displays all slides in the playlist, each held for `delay_ms` before advancing, without any manual interaction; the timer stops naturally after the last slide.

---

### Sprint 10 — Bidirectionality experiment: "Done" button ✅

**Goal:** validate the Channels API end-to-end with the smallest useful signal — a "Done" button in the browser that tells Claude to continue.

**Scope:**
- [x] `server/channel.ts` (new): stdio MCP channel server with `capabilities.experimental: { 'claude/channel': {} }` + HTTP relay on port 3001 (default, overridable via `CHANNEL_PORT` env var)
- [x] `server/app.ts`: `POST /user-done` endpoint — forwards to channel relay; gracefully ignores if channel server not running
- [x] `client/src/App.svelte`: "Done" button (bottom-right, always visible); shows "Sent ✓" for 2s after click
- [x] `.mcp.json`: `agent-whiteboard-channel` stdio entry (`node_modules/.bin/tsx server/channel.ts`)

**To test:**
1. `npm run dev` (starts main server + Vite as before)
2. In a **new** Claude Code session: `claude --dangerously-load-development-channels server:agent-whiteboard-channel`
3. Ask Claude to render a diagram; click "Done" in the browser
4. Claude Code context receives: `<channel source="agent-whiteboard-channel" event="user_done">User has finished exploring...</channel>`

**DoD:** Claude Code receives a `<channel>` tag when the user clicks "Done"; the button shows "Sent ✓" feedback; the main server works normally if the channel server is not running.

---

### Sprint 10 — `wait_done()` MCP tool ✅

**Insight from channels experiment:** `notifications/claude/channel` is designed for async push events. Using it as a "gate" (block until user acts) is unreliable because the notification arrives mid-stream and Claude Code may process it unpredictably. A long-polling MCP tool is the correct primitive for a blocking "wait for user" pattern.

**Changes:**
- [x] `server/events.ts` (new): `signalDone()` + `waitForDone()` — in-process EventEmitter bus with 10-minute timeout
- [x] `server/app.ts`: `POST /user-done` calls `signalDone()` (wakes waiting `wait_done` calls); new `POST /wait-done` long-polls until signal
- [x] `server/mcp.ts`: `wait_done()` tool — calls `waitForDone()` directly; blocks from agent's perspective until browser Done is clicked

**Agent usage pattern:**
```
render(type="mermaid", payload="...", options={ title: "..." })
wait_done()   // ← blocks here; returns { ok: true } when user clicks Done
// continue lesson
```

**DoD:** agent calls `wait_done()` after `render()` and does not continue until the user clicks Done in the browser; clicking Done resolves all pending `wait_done()` calls simultaneously; times out after 10 minutes.

---

### Sprint 10 — Next steps (bidirectionality full implementation)

- Node click events: browser button/click → `POST /user-done`-style endpoint → `signalNodeClick(nodeId)` → new MCP tool `wait_node_click()`
- Optional `reply` tool on the channel server so Claude can send messages back to the browser
- See `02` E1 for channel server architecture details

---

### Sprint 11 — Playwright e2e tests ✅

**Goal:** add end-to-end browser tests for the full interactive surface, now that `wait_done()` / Done button completes the bidirectional MVP.

**Setup:**
- [x] Install `@playwright/test`; use system Chrome (`channel: "chrome"`) — no Playwright browser download needed
- [x] `playwright.config.ts` at root: `testDir: "./e2e"`, `webServer` starts `dev:test` (server + Vite, no `dev:open`)
- [x] `dev:test` script: `tsx server/index.ts` + `npm run dev:client` (no browser auto-open)
- [x] `test:e2e` script: `playwright test`
- [x] `vitest.config.ts` added to scope Vitest to `server/**/*.test.ts` only, so Vitest ignores `e2e/`

**Tests (`e2e/canvas.spec.ts` — 16 tests, all passing):**

*Initial state:*
- [x] Shows "Waiting for content…" placeholder on load

*Rendering (all renderer types):*
- [x] Mermaid: `POST /render` → `.mermaid-container svg` visible in browser
- [x] HTML: `POST /render` → custom element visible inside `.html-renderer`
- [x] SVG: `POST /render` → `<svg>` visible inside `.html-renderer`
- [x] KaTeX: `POST /render` → `.katex` element visible inside `.katex-renderer`
- [x] Vega-Lite: `POST /render` → `<svg>` chart visible inside `.vegalite-renderer`

*Title overlay:*
- [x] `options.title` present → `.canvas-title` shows with correct text
- [x] No `options.title` → `.canvas-title` not visible
- [x] `POST /clear` → `.canvas-title` disappears

*Clear:*
- [x] `POST /clear` after render → placeholder returns, renderer element gone

*Step-frames (browser interaction):*
- [x] Load step-frames → `.step-bar` visible, Prev disabled, Next enabled
- [x] Frame label shown in `.step-label`
- [x] Click Next → label advances to frame 2, Prev becomes enabled
- [x] Click Prev → label rewinds to frame 1, Prev disabled again
- [x] Click Next twice → reaches last frame, Next disabled

*Done button:*
- [x] Click Done → button shows "Sent ✓" (disabled), reverts to "Done" after 2 s

**DoD:** `npm run test:e2e` runs all 16 tests green in ~6 s using the existing dev servers (reuses running servers in dev, starts fresh in CI). `npm test` (Vitest) continues to cover 47 server integration tests, unaffected.

---

### Sprint 12 — Node click: plain `wait_click()` (no popup) ✅

**Goal:** implement the minimal node/edge click feedback loop — agent calls `wait_click()`, user clicks any node or edge in a Mermaid diagram, agent receives the identity of the clicked element.

**Scope:**

- [x] **`server/events.ts`:** add `signalClick(event: ClickEvent)` + `waitForClick(): Promise<ClickEvent>` + `resetClick()` (test use). `ClickEvent`: `{ type: "node" | "edge" | "timeout", id: string, label: string, action: string | null }`. At most one pending `waitForClick()` at a time; a second call cancels the first.
- [x] **`server/app.ts`:** `POST /node-click` endpoint — body: `{ type, id, label }`; calls `signalClick()`; returns `{ ok: true }`. No-op if no listener is pending. `POST /wait-click` long-polls until click or timeout.
- [x] **`server/mcp.ts`:** `wait_click()` tool (no `node_actions` argument yet — that is Sprint 14). Pushes `set_node_actions` broadcast to arm/disarm browser. Returns `{ ok: true, type, id, label, action: null }` (`action` always present per response contract; null until Sprint 14 adds popup menus).
- [x] **`client/src/renderers/Mermaid.svelte`:** `clickable` prop; attaches/detaches click listeners on SVG `.node` and `.edgeLabel` elements; extracts node ID from `flowchart-<id>-<N>` pattern; stops event propagation to prevent drag; adds `clickable-node` CSS class + cursor pointer.
- [x] **`client/src/ws.ts`:** `set_node_actions` variant added to `RenderCommand` type.
- [x] **`client/src/App.svelte`:** handles `set_node_actions` command; tracks `clickable` reactive state; passes to `MermaidRenderer`.
- [x] **Tests:** 5 new integration tests for `POST /node-click` / `POST /wait-click` — no-op, round-trip, edge click, second-call cancels first, timeout via `vi.runAllTimersAsync()`. 53 tests total, all passing.
- [x] **`manualtests/click-demo.js`:** renders a 3-node flowchart, long-polls `/wait-click`, logs the returned click event.

**DoD:** ✅

---

### Sprint 13 — Client-controlled step-frame navigation + POST /wait-click bugfix ✅

**Status:** Complete (2026-06-07). All four tasks shipped: POST /wait-click bugfix, seek() MCP tool, POST /seek endpoint, node_to_frame autonomous navigation.

> **Dependency:** Sprint 13 must complete before Sprint 14. The `POST /wait-click` bugfix (broadcasting `set_node_actions enabled:true` on the REST path) is a prerequisite for the REST endpoint to work correctly with `node_actions` in Sprint 14.

**Goal:** Complete bidirectional feature set for Phase 2 — let the agent control frame navigation via `seek()`, and optionally attach a node→frame map to render so the browser navigates autonomously via node clicks.

**Bug fix — `POST /wait-click` does not arm the browser:**
- [x] **`server/app.ts` — `POST /wait-click`:** broadcast `{ action: "set_node_actions", enabled: true }` before `waitForClick()`; broadcast `{ action: "set_node_actions", enabled: false }` after it resolves (or times out).

**Scope:**

- [x] **`server/session.ts`:** add `nodeToFrame?: Record<string, number>` to the step-frames state; extended `setStepFrames()` to accept optional `nodeToFrame` parameter.
- [x] **`server/app.ts`:**
  - `POST /render` for `step-frames`: accept `options.node_to_frame?: Record<string, number>`; store it in session; include it in the WebSocket broadcast.
  - New `POST /seek` endpoint: body `{ "frame": N }` — calls `seekStepFrame(N)`, broadcasts the target frame to the browser, returns `{ ok: true, current_frame: N, total_frames: M }`. Error if no step-frames sequence is loaded or frame is out of range.
- [x] **`server/mcp.ts`:**
  - `render()` step-frames: expose `options.node_to_frame` — `z.record(z.string(), z.number()).optional()`.
  - New `seek(frame)` MCP tool: jumps the cursor to an arbitrary frame index.
- [x] **`client/src/ws.ts`:** added `nodeToFrame?: Record<string, number>` to the `replace` action in `RenderCommand`.
- [x] **`client/src/App.svelte`:** track `nodeToFrame` in canvas state and `nodeToFrameEnabled` boolean; disable `nodeToFrameEnabled` when `set_node_actions enabled:true` arrives (wait_click overrides); NOT restored when `set_node_actions enabled:false` arrives.
- [x] **`client/src/renderers/Mermaid.svelte`:** new `nodeToFrame` prop; attach autonomous click listeners on mapped nodes; on click calls `POST /seek`; mutually exclusive with `clickable` (wait_click mode).
- [x] **Tests:** 7 new integration tests for `POST /seek` (valid frame, out-of-range, no sequence loaded, negative frame, non-integer, seek from position, seek to 0) + 1 POST /wait-click round-trip test. 60 tests total, all passing.
- [x] **`manualtests/click-demo.js`:** added `--mode nav` flag demonstrating `node_to_frame` — renders a 4-frame step sequence, user clicks layer nodes (FE/BE/DB) to jump frames autonomously.

**DoD:** ✅
- Agent calls `render({ type: "step-frames", payload: "...", options: { node_to_frame: { "FE": 1, "BE": 2, "DB": 3 } } })`; clicking node `FE` in the browser jumps directly to frame 1 without any `wait_click()` call; agent is free to do other work.
- `seek(frame=2)` MCP tool jumps to frame 2 from any current position in one call.
- `POST /seek` REST endpoint behaves identically.

---

### Sprint 14 — Node click: popup action menu + edge support + `node_actions` ✅

**Status:** Complete (2026-06-08). All tasks shipped.

> **Blocked by:** Sprint 13 (the `POST /wait-click` bugfix must land first so the REST path correctly arms the browser before Sprint 14 extends it with `node_actions`).

**Goal:** extend `wait_click()` with agent-pre-defined per-node popup menus; confirm edge support; validate across multiple Mermaid diagram types.

**Scope:**

- [x] **`server/events.ts`:** Added `action: string | null` to `ClickEvent` interface (always present; `null` when no popup shown or plain click; string when menu item selected).
- [x] **`server/mcp.ts`:** Added `node_actions` optional parameter to `wait_click()`.
  - Input schema: `z.record(z.string(), z.array(z.string())).optional()` — map of node ID → string[].
  - Push `{ action: "set_node_actions", node_actions, enabled: true }` (with the map populated) to browser.
  - Return value includes `action: string | null` always.
- [x] **`server/app.ts`:** `POST /node-click` body extended with optional `action?: string`; stored as `action: body.action ?? null` in `ClickEvent`.
- [x] **`client/src/App.svelte`:** Tracks `nodeActions` state from `set_node_actions` WebSocket commands; passes to `MermaidRenderer`.
- [x] **`client/src/renderers/Mermaid.svelte`:** Popup menu logic.
  - On click of a node whose ID has a non-empty entry in `node_actions`: renders an inline floating menu (fixed-positioned `<div>`) listing the action strings.
  - User clicks a menu item → fires `POST /node-click` with `{ type, id, label, action }`.
  - Clicking a node with no registered actions → plain click, `POST /node-click` without `action`.
  - Clicking outside the menu (backdrop) dismisses it without firing.
  - Edge clicks: always plain (no popup).
  - Popup is dismissed when `clickable` becomes false (wait_click disarmed).
- [x] **Tests:** 4 new integration tests for `node_actions` round-trip (menu action returned in click event), plain click on unregistered node, edge click with `action: null`, no-op node-click with action. Existing Sprint 12/13 tests updated to include `action: null` in expected responses. 64 tests total, all passing.
- [x] **Validate across Mermaid types:** Node ID extraction via `flowchart-<id>-<N>` pattern is reliable for `graph`/`flowchart` types. `classDiagram`, `sequenceDiagram`, `erDiagram` use different SVG structures — node IDs are opaque or auto-generated; documented in `mcp.ts` tool description ("best-effort"). No attempt to extend extraction to new types in this sprint.
- [x] **`manualtests/click-demo.js`:** Added `--mode popup` to demonstrate the `node_actions` round-trip (simulates popup selection via `POST /node-click` with `action` field). Real browser popup requires MCP `wait_click(node_actions=...)` from Claude Code.

**DoD:** ✅
- Agent calls `wait_click(node_actions={ "B": ["Explain this", "Drill down"] })` after rendering a `graph TD`; clicking node B shows a popup with two options; selecting "Drill down" resolves `wait_click()` with `{ ok: true, type: "node", id: "B", label: "Server", action: "Drill down" }`; clicking an unregistered node returns a plain click (`action: null`); clicking an edge returns `{ type: "edge", ..., action: null }`.
- Menu dismisses cleanly on outside click; browser returns to normal (non-clickable) state after resolution.
- `action` field is always present in `wait_click()` responses (null or string).

> **Implementation note:** `POST /wait-click` (REST) remains plain-click only — it does not accept `node_actions` body even in Sprint 14. REST endpoints are `curl`-friendly fallbacks for debugging; popup menus are an MCP-exclusive feature requiring browser-side coordination. Use the MCP `wait_click(node_actions)` tool for popup menu support.

---

## Definition of Done — MVP
- Agent can call `render(type="mermaid", payload)` and diagram appears in browser within 200ms
- Agent can call `clear()` to reset the canvas
- Agent can call `export()` to retrieve the current canvas source as text (verbatim last `render()` payload, any type)
- Server starts with `npm run dev`, browser opens automatically
- Runs on macOS, Linux, Windows
- Binding address and port are configurable via environment variables (default: `localhost:3000`)
- `.mcp.json` committed to repo; Claude Code connects to the MCP server without manual config
