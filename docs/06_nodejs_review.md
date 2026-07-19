# Review Report

## No authentication or authorization on any endpoint

### Description
Every REST route in `server/app.ts` (render, clear, slideshow, step-frames builder, snapshot delete, HTML export) and every MCP tool in `server/mcp.ts` is reachable by anyone who can open a TCP connection to the process — there is no API key, token, or origin check anywhere in the codebase. The only thing standing between "local dev tool" and "anyone on the network can wipe your snapshots" is the default bind address.

### Evidence
- `server/index.ts:12` — `const HOST = process.env.HOST ?? "localhost";` is the sole safeguard; it is trivially overridden by an environment variable with no additional gate.
- `server/app.ts:423-463` — `POST /snapshots/delete-files` and `POST /snapshots/delete-workspace` perform destructive filesystem operations gated only by workspace-name syntax validation (`validateWorkspaceForDelete`), not by caller identity.
- `server/channel.ts:29-46` — the stdio-channel HTTP relay listens on `127.0.0.1:CHANNEL_PORT` and accepts any POST to `/user-done` unauthenticated (lower risk since it's loopback-only, but still no shared-secret check between the main server and the relay).
- No file in `server/` imports or checks any credential, header, or shared secret.

### Impact
If the process is ever started with `HOST=0.0.0.0` (or behind a port-forward, container, VPN, or misconfigured proxy), any network peer can render arbitrary content to the whiteboard, delete a user's entire snapshot history, or exfiltrate stored snapshot payloads via `GET /export` — with zero audit trail.

### Affected Files
- server/app.ts
- server/index.ts
- server/mcp.ts
- server/channel.ts

### Recommended Fix
Add a lightweight shared-secret or bearer-token middleware (Hono middleware checking a header against an env-provided token) that's required whenever `HOST` is not a loopback address, or refuse to bind to non-loopback hosts at all unless a token is configured. Document the trust model explicitly (this is a local-first tool) so the assumption is intentional rather than implicit.

### Urgency Level
HIGH

---

## No request body size limit on JSON endpoints

### Description
`createApp()` never installs a body-size-limiting middleware (e.g. Hono's `bodyLimit`). Every route calls `c.req.json<...>()` directly on the raw request stream. Payloads (`mermaid`/`svg`/`html`/`vega-lite` strings, step-frames arrays) are then run through synchronous/CPU-heavy processing — `mermaid.parse()`, `vega.parse()`/`view.toSVG()`, `JSON.parse()`, `katex.renderToString()`, DOMPurify — with no upper bound on input size.

### Evidence
- `server/app.ts:56-87` (`POST /render`), `:117-163` (`POST /slideshow`), `:191-205` (`POST /step-frames/:id/frame`) — all parse `c.req.json()` with no size guard.
- No `import { bodyLimit } from "hono/body-limit"` (or equivalent) anywhere in `server/`.

### Impact
A single oversized request (e.g. a multi-megabyte `vega-lite` spec or `html` payload) can spike memory and block the event loop during synchronous rendering, degrading or crashing the server for the one process serving all clients. Combined with the "no auth" finding above, this is also a straightforward remote DoS vector if the port is ever reachable externally.

### Affected Files
- server/app.ts

### Recommended Fix
Add Hono's `bodyLimit` middleware (or manually check `Content-Length`/stream size) with a sane cap (e.g. 5–10 MB) applied globally in `createApp()`, returning 413 on overflow.

### Urgency Level
MEDIUM

---

## Fragile global-state serialization in HTML export pipeline

### Description
`generateExportHtmlInner()` patches global objects (`document`, `window`, `CSSStyleSheet`, etc.) for the duration of each export so happy-dom-backed rendering (DOMPurify, mermaid) works, then restores them in a `finally`. Because this isn't reentrant, the code's own comment acknowledges the race and works around it with a hand-rolled promise queue (`exportQueue`) rather than fixing the root cause.

### Evidence
- `server/export-html.ts:42-76` — `saveGlobals`/`setGlobals`/`restoreGlobals` mutate `global` directly.
- `server/export-html.ts:563-587` — the comment explicitly documents the bug this queue works around ("can leave global DOM state pointing at an already-closed Window once both settle (B14)") and the fix is a serialization queue, not isolation.

### Impact
The queue only serializes *this function's own* callers (`POST /export-html` and the `export_html` MCP tool). Any other code path that touches `global.document`/`global.window` during one of the `await` points inside the export loop (e.g. a future feature, or a test running in the same process) is not protected and can corrupt shared state or crash mid-render. This is a correctness landmine that will resurface as the codebase grows.

### Affected Files
- server/export-html.ts

### Recommended Fix
Prefer an isolated rendering context per call instead of mutating `globalThis` — e.g. run happy-dom-dependent rendering in a worker thread, or check whether the specific libraries (DOMPurify, mermaid) can accept an explicit `window`/`document` instance rather than relying on globals. If the queue approach is kept short-term, add a code comment/test asserting no other module touches these globals, and consider a lint rule or runtime assertion that fails loudly if globals are already patched when `setGlobals` is called (reentrancy guard) instead of silently racing.

### Urgency Level
MEDIUM

---

## Inconsistent validation of `nodeToFrame` loaded from disk

### Description
`nodeToFrame` (node ID → frame index map) is validated with `nodeToFrameSchema.safeParse()` when it arrives via the `commit_step_frames` MCP tool or `POST /step-frames/:id/commit`, but the *same field*, when read back from a snapshot JSON file, is accepted with a bare, unchecked type assertion instead of running through that schema.

### Evidence
- `server/validate.ts:14` — `export const nodeToFrameSchema = z.record(z.string(), z.number());` is the canonical schema, explicitly documented (`validate.ts:7-12`) as "the single implementation both MCP's zod inputSchema and REST's request-body validation parse against."
- `server/app.ts:377-380`:
  ```ts
  const nodeToFrame =
    snapshot.nodeToFrame !== null && typeof snapshot.nodeToFrame === "object"
      ? (snapshot.nodeToFrame as Record<string, number>)
      : undefined;
  ```
  — only checks "is an object," not that values are numbers.
- `server/snapshot-reader.ts:239-241` (`findSnapshotByIdInWorkspace`) has the identical unchecked cast.

### Impact
A hand-edited or corrupted snapshot file (or one written by a future/older version of this tool with a different shape) can inject a `nodeToFrame` map with non-numeric values. That value is then broadcast verbatim to the browser (`render-core.ts:186-196`) and used there for frame-index lookups — a downstream type error or silent `NaN`/`undefined` frame jump is the likely outcome, in a code path the schema was specifically built to prevent everywhere else.

### Affected Files
- server/app.ts
- server/snapshot-reader.ts

### Recommended Fix
Replace both unchecked casts with `nodeToFrameSchema.safeParse(...)`, treating a failed parse the same way malformed `frames` is already treated (skip/ignore the field, or reject the load) — consistent with the "one implementation" intent already stated in `validate.ts`.

### Urgency Level
MEDIUM

---

## Widespread synchronous filesystem I/O on hot paths

### Description
Snapshot and viewport-cache persistence is built entirely on synchronous `fs` calls (`readFileSync`, `writeFileSync`, `readdirSync`, `mkdirSync`, `rmSync`, `unlinkSync`). Several of these run in loops over every file in a directory, and the viewport cache rewrites its *entire* JSON file on every single call.

### Evidence
- `server/viewport-cache.ts:44-54` (`writeCache`) and `:64-68` (`setViewport`) — every viewport update does a full synchronous read-modify-write of one shared JSON file, even though updates can occur on ordinary zoom/pan interactions.
- `server/snapshot-reader.ts:57-106` (`listSnapshots`) synchronously reads and JSON-parses every `_screen.json` file in a workspace directory; `:112-133` (`listAllSnapshots`) calls this once per workspace subdirectory, compounding the effect for `GET /snapshots/all`.
- `server/snapshot-writer.ts:132-176` (`deleteSnapshotFiles`, `deleteWorkspace`) synchronously reads every file's `id` field before deleting, one at a time.

### Impact
All of this blocks the single Node.js event loop for the duration of the call. For a single-user local tool with a handful of snapshots this is unlikely to be noticeable, but it scales linearly (or worse) with snapshot count and will visibly stall `wait_click`/`wait_done` interaction resolution and WebSocket broadcasts for every other connected client while a large `GET /snapshots/all` or delete operation runs.

### Affected Files
- server/viewport-cache.ts
- server/snapshot-reader.ts
- server/snapshot-writer.ts

### Recommended Fix
Switch to the `fs/promises` async equivalents, especially for the loop-heavy read paths (`listSnapshots`, `listAllSnapshots`, delete operations). For the viewport cache specifically, consider debouncing writes or keeping an in-memory cache that's flushed periodically instead of a full synchronous rewrite per update.

### Urgency Level
MEDIUM

---

## Outdated core build/test tooling majors

### Description
`vitest` and `vite` are pinned to pre-1.0 / old-major version ranges well behind their current majors.

### Evidence
- `package.json:57` — `"vite": "^4.5.10"`
- `package.json:58` — `"vitest": "^0.34.6"`

### Impact
Staying multiple majors behind means missing several years of bug fixes, performance improvements, and (for vite) security patches to the dev server, at increasing migration cost the longer the gap grows.

### Affected Files
- package.json

### Recommended Fix
Plan a deliberate upgrade of `vite`/`vitest` (and re-run `svelte-check`/the client test suite afterward, since `@sveltejs/vite-plugin-svelte` version compatibility is coupled to the vite major). Not urgent in isolation, but worth tracking as tech debt before it becomes a forced migration.

### Urgency Level
LOW

---

## Bare global `crypto.randomUUID()` reliance

### Description
`snapshot-writer.ts` calls the Web Crypto API's `randomUUID()` via the implicit Node.js global `crypto`, without an explicit `import { randomUUID } from "node:crypto"` — unlike `export-html.ts`, which does import `createHash` explicitly from the same module.

### Evidence
- `server/snapshot-writer.ts:48` — `return crypto.randomUUID();` with no corresponding import anywhere in the file.
- `server/export-html.ts:3` — `import { createHash } from "crypto";` for contrast, showing the explicit-import pattern is already used elsewhere in this codebase.
- `package.json:6-8` — `"engines": { "node": ">=18" }`.

### Impact
`globalThis.crypto` was not stabilized as an unflagged global across all of the Node 18.x line's early patch releases. Depending on exactly which 18.x patch a user has installed, `crypto.randomUUID()` as a bare global could be undefined, causing every snapshot write to throw. This is inconsistent with the package's own stated minimum engine and with how the sibling file imports the same module explicitly.

### Affected Files
- server/snapshot-writer.ts

### Recommended Fix
Import explicitly: `import { randomUUID } from "node:crypto";` and call `randomUUID()` directly, matching the pattern already used in `export-html.ts`. This removes any doubt about global availability regardless of exact Node 18.x patch version.

### Urgency Level
LOW

---

## Explicit `any` cast bypassing MCP SDK types

### Description
The channel relay casts the MCP `Server` instance to `any` to call a proprietary notification method not present in the SDK's public types.

### Evidence
- `server/channel.ts:32` — `;(mcp as any).notification({ ... }).catch(() => {})` with an `eslint-disable-line @typescript-eslint/no-explicit-any` acknowledging the cast.

### Impact
Low direct risk since it's a deliberate, documented workaround for an SDK gap (Claude-proprietary `notifications/claude/channel` method) — but it's an unchecked escape hatch that would silently swallow a typo in the method/param shape at compile time, and the swallowed `.catch(() => {})` means any failure here (malformed notification, transport closed) is invisible.

### Affected Files
- server/channel.ts

### Recommended Fix
Define a minimal local interface for the one extra method actually needed (`notification(params: {...}): Promise<void>`) and cast to that interface instead of `any`, so at least the call-site shape is still type-checked. Consider logging (not just swallowing) failures from the `.catch()`.

### Urgency Level
LOW

---

## Unvalidated numeric environment variables

### Description
`PORT` and `CHANNEL_PORT` are parsed from environment variables with no validation that the result is a usable port number.

### Evidence
- `server/index.ts:11` — `const PORT = parseInt(process.env.PORT ?? "3000", 10);`
- `server/channel.ts:13` — `const CHANNEL_PORT = Number(process.env.CHANNEL_PORT ?? 3001)`
- `server/app.ts:234` — the same `CHANNEL_PORT` pattern is repeated for the forwarding fetch call.

### Impact
An invalid value (e.g. `PORT=abc`) produces `NaN`, which is then passed to `serve()`/`.listen()`. The failure mode at that point depends entirely on the underlying library's handling of `NaN` as a port, likely a confusing low-level error rather than a clear "invalid PORT env var" message.

### Affected Files
- server/index.ts
- server/channel.ts
- server/app.ts

### Recommended Fix
Validate the parsed value (`Number.isInteger(port) && port > 0 && port < 65536`) and fail fast with a clear error message before attempting to bind/listen/fetch.

### Urgency Level
LOW

---

## `app.ts` is a single large multi-concern route file

### Description
All 20 REST endpoints — canvas render/step/seek/clear, slideshow, incremental step-frames builder, user-interaction signaling, snapshot history/delete, viewport persistence, and HTML export — live in one 511-line file.

### Evidence
- `server/app.ts:1-510` — a single `createApp()` function containing every route registration for the whole REST surface.

### Impact
Not a correctness issue today — the shared logic is already well-factored out into `render-core.ts`, `persist.ts`, `validate.ts`, etc., so `app.ts` itself is mostly thin request-shape parsing. But as more endpoints are added, this file will keep growing and become harder to navigate/review as one unit, and it increases the surface area any single change to `createApp()` touches.

### Affected Files
- server/app.ts

### Recommended Fix
Consider splitting route registration into per-feature modules (e.g. `routes/render.ts`, `routes/slideshow.ts`, `routes/snapshots.ts`, `routes/export.ts`) that each export a Hono sub-app or a `(app: Hono) => void` registration function, called from `createApp()`. Not urgent — a good opportunity to do incrementally next time a feature area is touched.

### Urgency Level
LOW

---

## Missing supplementary security headers alongside CSP

### Description
The only security header set globally is `Content-Security-Policy`. There is no `X-Content-Type-Options: nosniff`, and no equivalent-to-`X-Frame-Options` beyond what CSP's `frame-ancestors 'none'` already covers.

### Evidence
- `server/app.ts:43-54` — the CSP middleware is the sole security header applied to every response via `app.use("*", ...)`.

### Impact
Low risk in isolation given the CSP is already fairly strict (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`), but `X-Content-Type-Options: nosniff` is a cheap, standard defense-in-depth addition against MIME-sniffing issues, particularly relevant since this server serves user/agent-supplied SVG and HTML content.

### Affected Files
- server/app.ts

### Recommended Fix
Add `c.header("X-Content-Type-Options", "nosniff")` alongside the existing CSP header in the same middleware.

### Urgency Level
LOW
