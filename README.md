# Agent Whiteboard

A domain-agnostic interactive whiteboard for AI teacher agents. An AI agent renders diagrams, math, charts, and HTML to a local browser tab via MCP tools — and can pause to wait for the user to signal they're ready to continue.

## How it works

```
[Claude Code agent]
    │
    └── MCP tools (render / clear / export / step / seek / slideshow / wait_done / wait_click)
           │
           ▼
    [Node.js server :3000]  — MCP over SSE + REST fallback + WebSocket
           │
           ▼
    [Browser tab :5173]  — Svelte SPA, auto-opens on start
```

The server exposes MCP tools over SSE at `http://localhost:3000/mcp`. Claude Code connects automatically when `.mcp.json` is present in the project root.

## Requirements

- Node.js ≥ 18
- Claude Code (CLI or IDE extension)

## Setup

```bash
npm install
```

## Start

```bash
npm run dev
```

This starts the Node server (`:3000`), the Vite dev server (`:5173`), and opens the browser tab automatically.

Enable the MCP server in Claude Code the first time:

```
/mcp
```

Select `agent-whiteboard` and enable it. The tools will be available immediately.

## MCP tools

### `render(type, payload[, options])`

Push content to the whiteboard canvas. Replaces whatever is currently on screen.

| `type` | `payload` |
|---|---|
| `"mermaid"` | Mermaid diagram source. Must begin with a valid keyword (`graph`, `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `mindmap`). |
| `"svg"` | Inline SVG markup. |
| `"html"` | HTML/CSS fragment. Sanitized via DOMPurify — inline styles only; `<script>` and `<style>` tags are stripped. |
| `"katex"` | LaTeX string, rendered in display mode. |
| `"vega-lite"` | Vega-Lite JSON spec (must be valid JSON string). |
| `"step-frames"` | Ordered sequence of frames for step-through (see below). Displays frame 0; use `step()` to navigate. |

`options` (optional):
- `title` — string label displayed above the canvas for this render call.
- `node_to_frame` — (`step-frames` only) map of node ID → frame index. When set, clicking a mapped node in the browser jumps directly to its frame via `POST /seek` — no `wait_click()` call needed. Overridden for the duration of any `wait_click()` call; agent must re-render with the map to re-enable it.

**Returns:** `{ "ok": true }` or `{ "ok": false, "error": "..." }`

### `step(direction)`

Advance (`"next"`) or rewind (`"prev"`) the step cursor for a loaded `step-frames` sequence.

**Returns:** `{ "ok": true, "current_frame": N, "total_frames": M }` or `{ "ok": false, "error": "..." }`

### `seek(frame)`

Jump the step-frame cursor to an arbitrary frame index without repeated `step()` calls.

**Returns:** `{ "ok": true, "current_frame": N, "total_frames": M }` or `{ "ok": false, "error": "..." }`

### `clear()`

Reset the canvas to a blank state.

**Returns:** `{ "ok": true }`

### `export()`

Return the current canvas source payload verbatim. For `step-frames`, returns the full original frames JSON (not just the current frame). Returns an empty string if the canvas is blank.

**Returns:** `{ "ok": true, "data": "<source>" }`

### `slideshow(slides, delay_ms)`

Load a playlist and auto-advance it on a server-side timer.

- `slides` — array of `{ type, payload, title? }` objects (same types as `render()`).
- `delay_ms` — interval in milliseconds between slides.

A new call cancels any running slideshow. Use `slideshow_stop()` to stop early.

**Returns:** `{ "ok": true }` or `{ "ok": false, "error": "..." }`

### `slideshow_stop()`

Cancel the running slideshow. The last rendered slide stays on screen. No-op if nothing is running.

**Returns:** `{ "ok": true }`

### `wait_done()`

Block until the user clicks the **Done** button in the browser tab, then return. Use this after `render()` when you want the user to review a diagram before the agent continues. Times out after 10 minutes.

**Returns:** `{ "ok": true }`

### `wait_click()`

Arm the browser for a single node or edge click on the current Mermaid diagram. Nodes are highlighted with a blue outline and pointer cursor. Applies reliably to `graph`/`flowchart` diagrams; other types are best-effort.

Only one `wait_click()` may be pending at a time — a second call cancels the first. Times out after 10 minutes.

**Returns:** `{ "ok": true, "type": "node"|"edge", "id": "<id>", "label": "<label>", "action": null }` on click, or `{ "ok": true, "type": "timeout" }` on timeout.

## Step-frames payload shape

```json
{
  "frame_type": "mermaid",
  "frames": [
    { "label": "Step 1", "payload": "graph TD; A" },
    { "label": "Step 2", "payload": "graph TD; A --> B" },
    { "label": "Step 3", "payload": "graph TD; A --> B --> C" }
  ]
}
```

Pass this JSON stringified as the `payload` argument to `render(type="step-frames", ...)`.

## Example agent flow

```
render(type="mermaid", payload="graph TD; A --> B", options={ title: "System overview" })
→ wait_done()   # agent pauses; user clicks Done when ready
→ render(type="katex", payload="E = mc^2")
→ wait_done()
```

## REST fallback

All tools have HTTP equivalents for scripting or testing without an MCP client:

| Endpoint | Body |
|---|---|
| `POST /render` | `{ "type": "...", "payload": "...", "options": { "title": "..." } }` |
| `POST /step` | `{ "direction": "next" \| "prev" }` |
| `POST /clear` | — |
| `GET /export` | — |
| `POST /slideshow` | `{ "slides": [...], "delay_ms": N }` |
| `POST /slideshow/stop` | — |
| `POST /seek` | `{ "frame": N }` |
| `POST /user-done` | — (simulates the Done button click) |
| `POST /wait-done` | — (long-polls until Done is signalled) |
| `POST /node-click` | `{ "type": "node"\|"edge", "id": "...", "label": "..." }` (sent by browser) |
| `POST /wait-click` | — (long-polls until a node/edge click is signalled) |

All endpoints return the same JSON shapes as the MCP tools.

## Manual showcase

Exercises every renderer via a server-side slideshow (requires `npm run dev` running):

```bash
node manualtests/showcase.js
```

Options:

```
-p, --port <port>     Server port (default: 3000)
-d, --delay <ms>      Delay between slides (default: 5000)
-t, --type <types>    Comma-separated types to show (mermaid, svg, html, katex, vega-lite, step-frames)
-h, --help
```

## Tests

```bash
npm test          # Vitest unit/integration tests (server)
npm run test:e2e  # Playwright end-to-end tests (requires npm run dev:test first)
```

## MCP registration

`.mcp.json` is committed to the repo root and picked up automatically by Claude Code:

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

The server must be running before Claude Code connects. The port is overridable via the `PORT` environment variable.
