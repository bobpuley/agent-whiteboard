# Assumptions and Risks

> Items marked `> ⚠️ ASSUMPTION:` are not yet confirmed by the user.
> Updated incrementally as decisions are made.

---

## A. Deployment & Environment

**A1 — Local-only deployment (v1)**
The whiteboard runs on localhost for v1. No cloud hosting, no multi-user access, no auth.
- Deployment assumption: v1 assumes a single trusted user on a local network. The server is not hardened for untrusted access; REST endpoints are world-accessible on the configured port without authentication.
- Constraint: the binding address must be configurable via environment variables so the same codebase can run on different hosts without changes (for local development on different machines, not for remote deployment).
- Risk: if auth and multi-user are not designed for from the start, adding them later may require structural rework.
- **Phase 3:** auth, session isolation, and per-user canvas states required for multi-user or hostile-network deployment.

**A2 — Target user is a developer / technical learner**
Non-technical audiences are out of scope for v1; expansion is a future consideration.

**A3 — Browser always available**
The render surface is a browser tab. The system assumes a browser is running on the same machine.
- Risk: headless / server environments have no display. Terminal fallback is deferred to Phase 2 — this risk is **unmitigated in v1**.
- **Decision:** risk explicitly accepted for v1. Target audience (developers on local machines) makes headless use an edge case.

**A4 — Session lifetime is short and in-memory**
Sessions are scoped to a single focused explanation. History does not need to survive a server restart in v1.
- Cross-session persistence (save/resume, history across restarts) is deferred to Phase 2.
- Risk: users who want to revisit a previous diagram have no recourse in v1 beyond export.

---

## B. MCP as Primary Interface

**B1 — MCP is stable enough to build on**
~~> ⚠️ ASSUMPTION: not formally validated — accepted as a known risk with no mitigation in v1.~~
> ✅ VALIDATED: MCP SSE transport confirmed working end-to-end in Sprint 0 (2026-05-31). `render()`, `clear()`, `export()` all exercised via Claude Code. Risk remains (MCP is still relatively new) but is no longer an unvalidated assumption.

We are betting that the MCP protocol spec is stable and that tooling (SDKs, clients) is mature enough for production use.
- Risk: MCP is relatively new; breaking changes in the spec or SDK could require rework.
- **Decision:** risk accepted. Pin to exact version at Sprint 0 (`npm init`); treat upgrades as deliberate decisions. See `04` §1.

**B2 — v1 targets Claude Code only**
Claude Code is the sole agent runtime for v1. It supports MCP natively. Multi-agent / multi-runtime support is a future concern.
- Risk: design decisions optimized for Claude Code may need revisiting when expanding to other runtimes.

---

## C. Rendering

**C1 — Declarative specs are sufficient**
The agent generates structured payloads (Mermaid source, Vega-Lite JSON, step-frame arrays, raw SVG/HTML). The renderer handles visualization. The agent does not write executable JS for rendering; raw HTML/SVG is explicitly supported via `type="html"` and `type="svg"` (Sprint 5 ✅) and sanitized by DOMPurify in the browser.
- Risk: some teaching scenarios may require custom visual logic that doesn't fit any declarative format — forcing either a new renderer type or relying on the html/svg escape hatch.

**C2 — Client-side rendering is fast enough**
Mermaid.js, D3, KaTeX etc. run in-browser. No server-side rendering pipeline needed.
- Risk: large or complex diagrams (hundreds of nodes) may hit browser performance limits. (NF4 sets a target of <200ms for <500 nodes.)

---

## C2b — Slideshow broadcast parity with /render (Sprint 9 bug)

~~> ⚠️ ASSUMPTION (Sprint 9): "validates each slide (same rules as /render)" was interpreted as applying to validation only. `broadcastSlide()` forwarded the raw type and payload to the browser without unpacking step-frames.~~

> ✅ CORRECTED: "same rules as /render" must extend to **broadcast format**. For `step-frames` slides, the server must unpack the JSON, call `setStepFrames()`, and emit the same `{ type: frame_type, payload: frames[0].payload, stepFrames: true, currentFrame: 0, totalFrames: N }` event that `POST /render` produces. The browser has no renderer for `type: "step-frames"` and silently renders nothing when this contract is violated. Fixed in Sprint 9 bug-fix task (see `05`).

## C2c — Slideshow step-frames auto-advance behavior (Sprint 9 bug B2)

~~> ⚠️ ASSUMPTION (post Sprint 9 B1 fix): "frame 0 is displayed; Prev/Next remain functional" was assumed to be the complete desired behavior for step-frames slides in a slideshow. Auto-advance through frames was not considered.~~

> ✅ CORRECTED: A `step-frames` slide in a slideshow must **expand each frame into a separate timer tick** — each frame advances at `delay_ms` intervals, making step-frames first-class in the auto-play sequence, not a manual-only exception. Updated in F7 (requirements) and `04` Phase 2 notes. Fix tracked in Sprint 9 B2 bug-fix task.

---

## D. Agent Behavior

**D1 — Agents can generate valid rendering specs**
> ✅ RESOLVED (Sprint 6, 2026-05-31): Full server-side Mermaid parse validation implemented. After passing the keyword-prefix check, `mermaid.parse()` is called server-side; syntactically invalid payloads are rejected with `{ ok: false, error: "..." }` before reaching the browser. Note: some diagram types (classDiagram, gantt, pie, mindmap) require a DOM context unavailable in Node.js — for those, `mermaid.parse()` is skipped and the keyword-prefix check remains the safety net. Genuine parse errors (`Parse error on line N: ...`) are always rejected.

We assume LLMs reliably produce well-formed Mermaid, valid Vega-Lite JSON, and correctly structured step arrays.
- Risk: LLMs hallucinate syntax. Invalid payloads will cause silent render failures or broken diagrams unless the server validates and returns structured errors.
- **Decision (v1):** validation is a hard gate — invalid payloads are rejected server-side and returned as `{ ok: false, error: "..." }` to the agent; nothing is pushed to the browser. See `03` F3a.

**D2 — The whiteboard is stateless from the agent's perspective**
The agent sends commands forward-only. It also prints the textual representation (Mermaid source, JSON spec, etc.) in the terminal alongside the visual render — the terminal is the agent's own record of what it sent.
- No state-read MCP tool needed in v1.
- Risk: if incremental updates become complex (e.g. "modify only node X in the diagram I sent two steps ago"), the agent needs to track its own history internally or re-send the full updated spec.

---

## E. Bidirectionality (Phase 2)

**E2 — Mermaid SVG node IDs are extractable from click events**
> ✅ VALIDATED (Sprint 12, 2026-06-07): The `flowchart-<nodeId>-<counter>` pattern held up in practice. Stripping the prefix and trailing counter reliably recovers the original source node ID for `graph`/`flowchart` diagrams.
- Risk (residual): ID format varies across diagram types (`flowchart-*` vs `sequence*` vs `classDiagram-*`) and may change across Mermaid major versions. Edge elements follow a different pattern.
- Risk (residual): `sequenceDiagram`/`erDiagram` use auto-generated numeric IDs — click detection for those types may return an opaque ID rather than a human-readable label.
- **Decision:** `graph`/`flowchart` is the validated target. Sequence/ER diagram click support deferred. Pin Mermaid to `^11`; treat any ID-format change as a deliberate upgrade.

**E3 — `wait_click()` applies to Mermaid diagrams only (Phase 2 initial scope)**
> ✅ DECISION: Click interactivity is limited to Mermaid-rendered diagrams for Phase 2. Other renderer types (SVG, HTML, Vega-Lite, KaTeX) may support click in future phases but are out of scope for Phase 2.
- Risk: SVG and HTML renderers could also benefit from click events, but DOM structure and element ID schemes differ significantly — each would need its own click-extraction logic.
- **Decision:** Mermaid-only for Phase 2. Extend to other renderers in later phases.

**Maintenance — Mermaid major version upgrades**

Mermaid is pinned to `^11` due to breaking changes in the SVG structure and node ID formats between major versions. When a new major version is released:

1. Run `npm run test:e2e` (Playwright tests) — especially `e2e/canvas.spec.ts` which covers Mermaid rendering
2. If tests pass, the ID extraction logic and render behavior are still compatible — upgrade is safe
3. If tests fail (e.g., node click detection broken, SVG structure changed), the extraction logic must be updated:
   - Check `client/src/renderers/Mermaid.svelte` — `extractNodeId()` and `extractEdgeId()` functions
   - Update the regex patterns or DOM traversal logic to match the new Mermaid SVG format
   - Re-run e2e tests to verify
4. **Deprecation period:** optional — release a patch with the new Mermaid version as supported; no need for a migration period in v1
5. **Process:** treat Mermaid upgrades as deliberate decisions, not automatic updates. Update `package.json` pinning explicitly and document the change in the commit message.

Current Mermaid version constraint in `package.json`: `"mermaid": "^11.4.0"`

---

**E1 — Bidirectionality requires a Channel (stdio MCP server), not SSE push**
> ✅ RESOLVED and VERIFIED (Sprint 10, 2026-06-06): Channels API confirmed stable enough for production experiments.

Claude Code SSE MCP sessions do **not** support async server-push events. The correct mechanism is the **Channels API** (Claude Code ≥ v2.1.80).

A channel is a **separate stdio MCP server** (not SSE) spawned by Claude Code as a subprocess. It pushes events via `mcp.notification({ method: "notifications/claude/channel", params: { content, meta? } })`, which Claude Code delivers as `<channel source="...">` tags in the agent's context.

**Verified API shape (2026-06-06):**
- Server declares `capabilities.experimental: { 'claude/channel': {} }` in the `Server` constructor
- Notification method: `notifications/claude/channel`; params: `{ content: string, meta?: Record<string, string> }`
- `meta` keys must be identifier-safe (`[a-zA-Z0-9_]`); invalid chars silently dropped
- Claude Code delivers events as `<channel source="name" ...attr>content</channel>` tags
- `assertNotificationCapability()` in the SDK has no case for this method and passes silently
- **Development:** `claude --dangerously-load-development-channels server:<name>` (server must be registered in `.mcp.json` with `command`/`args`)
- **Production:** must be allowlisted plugin or org `allowedChannelPlugins` entry

**Architectural implication (implemented Sprint 10):**
- The existing SSE server (port 3000, render/clear/export tools) is unchanged.
- `server/channel.ts`: stdio channel server + HTTP relay on port 3001.
- Main server (`server/app.ts`) forwards browser `POST /user-done` → relay → notification.
- Browser has a "Done" button that fires `POST /user-done`.
- See `04` §2 for updated Phase 2 architecture.

---

## F. Project Infrastructure

**G1 — `~/.agent-whiteboard/` is writable**
> ⚠️ ASSUMPTION: The server assumes the user's home directory is writable and that creating `~/.agent-whiteboard/<workspace>/` will succeed silently on first run.
- Risk: restricted home directory configurations or permission issues cause a silent write failure or a startup crash.
- Mitigation (proposed): catch the error, log a warning, and continue — snapshot persistence failure must never block rendering.

**G2 — Workspace name derived from `basename(process.cwd())`**
> ⚠️ ASSUMPTION: The workspace name is the final path component of the directory where the server is started (e.g. `/Users/bob/workspaces/my-project` → `my-project`).
- Risk: if the server is started from a parent or sibling directory, snapshots land in an unexpected workspace folder.
- Mitigation (current): expose a `WHITEBOARD_WORKSPACE` environment variable override; document the default in the README.
- Mitigation (FR0, planned): allow the agent to pass `options.workspace` in `render()` calls to override the workspace dynamically per-call, without server restart or env var setup.

**G2b — Workspace override precedence (FR0)**
> ⚠️ ASSUMPTION: Per-call `options.workspace` overrides `WHITEBOARD_WORKSPACE` env var, which overrides `basename(process.cwd())`.
- Precedence order: `options.workspace` (highest) → `WHITEBOARD_WORKSPACE` env var → `basename(process.cwd())` (default, lowest)
- Risk: unclear whether a per-call workspace should also affect the browser's history panel scope, or only the snapshot file path. Currently history is scoped to a single workspace at a time (`WHITEBOARD_WORKSPACE` or default).
- Mitigation: clarify whether history panel should remain locked to the env-var workspace, or follow the per-call workspace. Recommend: per-call workspace is snapshot-routing only; history panel remains locked to the current workspace to avoid confusion.

**G3 — No snapshot cleanup policy in v1**
> ⚠️ ASSUMPTION: Files accumulate indefinitely. No TTL, quota, or rotation is defined.
- Risk: unbounded disk growth over long-lived projects.

**G4 — Snapshot payloads may contain sensitive content**
> ⚠️ ASSUMPTION: The user is responsible for the security of `~/.agent-whiteboard/`. No encryption or access control beyond standard file permissions.
- Risk: diagram payloads stored to disk may contain credentials, internal architecture diagrams, or PII.

---

**F1 — Test folder restructure (Sprint 15)**

> ⚠️ ASSUMPTION: `tests/unit/client/` is a placeholder only — no Svelte component unit tests exist today. Creating the directory structure signals intent but adds no immediate test coverage.

Risks from moving the three test roots:
- `playwright.config.ts` `testDir` must be updated to `"./tests/e2e"` — a missed update breaks `npm run test:e2e`
- `vitest.config.ts` `include` pattern must be updated to `"tests/unit/server/**/*.test.ts"` — a missed update causes Vitest to find no tests (silent pass instead of real coverage)
- `package.json` scripts that reference `manualtests/` (e.g. `node manualtests/showcase.js`) must be updated; any external runbooks or docs referencing old paths will silently break
- `test-results/` is a Playwright artifact output directory (controlled by `playwright.config.ts` `outputDir`); it is not a source folder and is not included in the `tests/` hierarchy — leaving it at root is correct, or it can be redirected to `tests/test-results/` via config without moving any source files
- **Decision:** `test-results/` stays at root (default Playwright behavior) unless the user decides otherwise

---

## H. History Navigation

**H1 — History load is write-silent**
> ⚠️ ASSUMPTION: `POST /snapshots/load` calls the render pipeline but does NOT call `saveSnapshot()`. Only agent-initiated `render()` calls write snapshot files; user-initiated history navigation does not.
- Risk: if this invariant is violated, loading from history would cascade into infinite snapshot writes.
- Mitigation: `POST /snapshots/load` renders via a dedicated code path that bypasses `snapshot.ts`.

**H2 — Agent is unaware of history navigation**
> ⚠️ ASSUMPTION: When the user loads a past snapshot from the history panel, the canvas is updated but the agent is not notified. Any pending `wait_click()` or `wait_done()` calls continue waiting unaffected.
- Risk: if the agent has called `wait_click()` and is waiting for a click on diagram X, the user may navigate to a history entry and replace the canvas with diagram Y. The agent will not receive the expected click and will time out.
- Mitigation: document this as expected behavior; the agent recovers via normal 10-minute timeout handling.

**H3 — options.title is the history label**
> ⚠️ ASSUMPTION: The history navigator uses `options.title` (already stored in the snapshot `options` field) as the human-readable label for each entry. If absent or empty, the UI falls back to `type + timestamp`.
- No schema change needed — `options` (including `title`) is already persisted by `snapshot.ts`.
- Risk: snapshots written before FR2 may have no title, making those history entries less descriptive.

**H4 — All workspaces' snapshots are visible in the history panel**
> ⚠️ ASSUMPTION: `GET /snapshots/all` scans every subdirectory of `~/.agent-whiteboard/` and returns their contents grouped by workspace. The user is assumed to be the sole operator of this machine — snapshots from all projects are shown without isolation.
- Risk: if multiple users share a machine, one user could browse another's diagram history via the browser panel.
- Mitigation: the server is localhost-only by default (see A1); this risk is accepted within the local-only deployment scope.

**H5 — Cross-workspace snapshot load is safe with a workspace name safety check**
> ⚠️ ASSUMPTION: `POST /snapshots/load` accepts an optional `workspace` field. The server validates that the value is a plain directory name — no path separators, no `..`, no null bytes — before constructing the file path.
- Risk: a crafted `workspace` value could attempt to escape the snapshots root directory.
- Mitigation: server validates `workspace` against a safe-name pattern (alphanumeric, dashes, underscores, dots, spaces only) before resolving the path. Directory must exist under `WHITEBOARD_SNAPSHOTS_DIR`.
