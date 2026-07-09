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

**A5 — Dev-mode (two-origin) and production (single-origin) parity is not verified automatically (found 2026-07-06, bug B16 in `01`)**
~~> ⚠️ ASSUMPTION: `client/vite.config.ts`'s dev proxy list was assumed to be kept in sync with every endpoint the browser calls directly, simply by developer discipline when adding a new browser→server call.~~
> ✅ CORRECTED: nothing enforces this — `/seek` (added for `node_to_frame`, v0.2) was never added to the proxy list, and no test caught it because the e2e suite and unit suites both run in a context where this particular gap doesn't surface (see `04` Testing Strategy Layer 2/3). Accepted as a residual risk rather than adding automated dev/prod parity testing — the fix (one proxy-map entry) is cheap whenever a gap like this is found; not worth structural investment for v1's local-only, single-developer scope (consistent with A1's risk-acceptance stance elsewhere in this section).

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
- **Clarification (2026-07-04, from Node.js/frontend code review intake):** DOMPurify-in-the-browser (`client/src/renderers/Html.svelte`) is the **sole** sanitization layer for live `html`/`svg` renders — there is no server-side hard gate (F6 in `03` is deliberate: the server passes `html`/`svg` payloads through unvalidated). This is an accepted single-layer design given the local-only, single-trusted-user model (A1) — anyone who can reach the unauthenticated API to inject malicious HTML already has local code execution, so this isn't a privilege-escalation vector. Residual risk is defense-in-depth only: any future renderer path for `html`/`svg` must not skip the DOMPurify call, or content reaches the DOM unsanitized with no second layer to catch it.

**C2 — Client-side rendering is fast enough**
Mermaid.js, D3, KaTeX etc. run in-browser. No server-side rendering pipeline needed.
- Risk: large or complex diagrams (hundreds of nodes) may hit browser performance limits. (NF4 sets a target of <200ms for <500 nodes.)

**C3 — Mermaid zoom/pan: fit-to-view on new content, persisted per snapshot (FR18, v0.19, shipped)**
> ✅ DECISION (2026-07-04, via `/grill-me` interview during intake): resolves FR18's three-part request.
1. **Auto-fit on new content only:** every genuinely new `render()` call (a new snapshot `id`) auto-fits the diagram (scaled to contain, centered) on first display. `step()`/`seek()` navigation within the same step-frames sequence does **not** re-trigger auto-fit — the whole sequence shares one viewport, consistent with the existing "remembered during the session" ask. A brand-new diagram replacing the canvas is treated as a fresh "opening," not a continuation. **Superseded, scheduled v0.26.1 (bug B19/FR21):** this per-sequence sharing is being reversed — see the residual-risk note below and `Milestone_v0.26.1.md` Sprint 50.
2. **Live persistence:** the browser debounces zoom/pan changes (~800ms after the last wheel/drag input) and reports the final viewport to the server via a new `POST /viewport` endpoint, keyed by the currently-displayed snapshot's `id`. **Superseded, scheduled v0.26.1:** key becomes composite `id:frameIndex` (see point 3 below and `04` "Mermaid Viewport Persistence").
3. **Storage — evaluated, decision: yes, via a separate cache file:** rather than mutating the immutable snapshot JSON files (which would contradict F10's write-once model), viewport state lives in its own global cache file — `<WHITEBOARD_SNAPSHOTS_DIR>/viewport-cache.json` — mapping `id → { scale, positionX, positionY }`. `positionX`/`positionY` are stored as **normalized fractions of the canvas container**, not raw pixels, so a saved view still looks correct if the browser window is a different size next time (raw pixels tied to the capture-time viewport would look off-center or clipped otherwise). **Superseded, scheduled v0.26.1 (bug B19):** mapping becomes `id:frameIndex → { scale, positionX, positionY }`, so each frame of a sequence persists its own manual viewport independently rather than one entry per whole sequence.
4. **Restore:** whenever a snapshot is displayed — a fresh `render()` or a `POST /snapshots/load` history reload — the server checks the cache for that `id`; if present, the browser applies the stored viewport instead of auto-fitting. **Superseded, scheduled v0.26.1:** every `step()`/`seek()` tick also performs this check now, keyed by `id:frameIndex`, not just the initial display.
5. **Cleanup:** `POST /snapshots/delete-files` and `POST /snapshots/delete-workspace` also remove the corresponding viewport-cache entry/entries, so deleted snapshots don't leave orphaned cache rows behind indefinitely (avoids compounding G3's already-accepted "no snapshot cleanup policy" with a second, untracked growth source).
6. **Scope:** Mermaid only — the only renderer with any zoom/pan mechanism today (confirmed: `Html.svelte`, `Katex.svelte`, `VegaLite.svelte` have none). No MCP tool exposure; this is a pure browser⇄server UI concern, consistent with D2's "agent is stateless with respect to the whiteboard."
- Risk (residual, unconfirmed) — **confirmed 2026-07-06 (FR21, B17 in `01`), re-report + scheduled 2026-07-09 (bug B19 in `01`):** a step-frames sequence's frames can have very different intrinsic sizes; a single shared viewport per sequence may look better-fit for some frames than others. This was originally "unconfirmed" because B17 (see below) meant no frame ever fit correctly to begin with, masking the effect entirely. Once B17 was fixed, the risk was immediately visible in practice (Section 6's sequence diagram overflowing vertically by frame 3; Section 7c/8's flowcharts overflowing horizontally on later, wider frames). User chose to reverse point 1 above — re-fit on every frame change instead of once per sequence — and initially asked to intake the decision only (FR21, unscheduled). On 2026-07-09 the user re-reported the same unimplemented behavior as an active bug (B19) and chose to schedule it: `Milestone_v0.26.1.md` Sprint 50. Additional decision made at scheduling time: manually-set zoom/pan (point 2/3 below) also becomes per-frame — the viewport-cache key changes from bare snapshot `id` to composite `id:frameIndex`, so each frame remembers its own manual viewport independently, consistent with each frame now getting its own auto-fit trigger. See `03` F19, `04` "Mermaid Viewport Persistence" for the updated cache schema.
- Risk (residual): the viewport-cache file is a second piece of persistent state alongside snapshot files; nothing currently guarantees the two stay in lockstep beyond the delete-time cleanup in point 5 (e.g. a manually-deleted snapshot file, outside the app, leaves an orphaned cache entry). Accepted as consistent with G4's existing stance that `~/.agent-whiteboard/` is the user's own responsibility.
- **B17 (found 2026-07-06, resolved v0.22) — the fit-to-view calculation silently assumed the SVG's natural (pre-transform) pixel size equals its `viewBox` size.** That assumption broke because Mermaid emits `width="100%"` with no explicit height, and `Mermaid.svelte`'s CSS deliberately leaves the container unsized; with no definite containing-block width to resolve the percentage against, some real browsers fall back to the CSS default replaced-element size (300×150) instead of the `viewBox`'s actual dimensions. The computed `scale` was correct — it was applied to the wrong base size. Headless Chromium (used throughout the B15 investigation) doesn't hit this fallback, which is why every automated reproduction attempt during that investigation showed correct fitting while the user's real browser did not — a genuine, non-obvious automated-testing blind spot for this class of CSS layout edge case, not a flaw in the B15 fix itself. Fixed by explicitly pinning the SVG's `width`/`height` attributes to its `viewBox` dimensions immediately after insertion, removing the ambiguity entirely regardless of browser or container-sizing quirks. See B17 in `01`.
- > ⚠️ ASSUMPTION: "fit to view" means scale-to-contain (entire diagram bounding box visible, centered on both axes) inside the canvas viewport. Not yet explicitly confirmed against a concrete example; revisit if the implemented behavior doesn't match user expectations once built.

---

## C2b — Slideshow broadcast parity with /render (Sprint 9 bug)

~~> ⚠️ ASSUMPTION (Sprint 9): "validates each slide (same rules as /render)" was interpreted as applying to validation only. `broadcastSlide()` forwarded the raw type and payload to the browser without unpacking step-frames.~~

> ✅ CORRECTED: "same rules as /render" must extend to **broadcast format**. For `step-frames` slides, the server must unpack the JSON, call `setStepFrames()`, and emit the same `{ type: frame_type, payload: frames[0].payload, stepFrames: true, currentFrame: 0, totalFrames: N }` event that `POST /render` produces. The browser has no renderer for `type: "step-frames"` and silently renders nothing when this contract is violated. Fixed in Sprint 9 bug-fix task (see `05`).

## C2c — Slideshow step-frames auto-advance behavior (Sprint 9 bug B2)

~~> ⚠️ ASSUMPTION (post Sprint 9 B1 fix): "frame 0 is displayed; Prev/Next remain functional" was assumed to be the complete desired behavior for step-frames slides in a slideshow. Auto-advance through frames was not considered.~~

> ✅ CORRECTED: A `step-frames` slide in a slideshow must **expand each frame into a separate timer tick** — each frame advances at `delay_ms` intervals, making step-frames first-class in the auto-play sequence, not a manual-only exception. Updated in F7 (requirements) and `04` Phase 2 notes. Fix tracked in Sprint 9 B2 bug-fix task.

## C2d — Slideshow broadcasts never carried the `id` field added by F19 (found 2026-07-06, user report — bug B15)

~~> ⚠️ ASSUMPTION (v0.19): when F19 added the `id`-keyed auto-fit/restore contract to the WebSocket `replace` event, it was assumed every broadcast producer (`render-core.ts`'s `commitRenderResult()`, `/step`, `/seek`, history reload) had been updated to match. `slideshow.ts` — last substantively touched at Sprint 9, eight versions earlier — was not among them, and nothing caught the omission because F7's "same format as /render" parity requirement predates F19 and was never re-verified against it.~~

> ✅ CORRECTED: "same WebSocket event format as `POST /render`" (F7) must be re-checked every time that format grows a new field, not just at the time F7 was written — parity between independently-implemented broadcast producers is not self-maintaining. `slideshow.ts` now generates and threads an `id` through every broadcast (fresh per plain slide; one id shared across a step-frames sequence's frame ticks). This is the same root cause the Design Debt Log (`01`) already flagged for `app.ts`/`mcp.ts` — duplicated logic across independently-maintained code paths drifts unless it's either tested for parity or extracted into one shared implementation; `slideshow.ts` is a third such path (broadcast construction), not just the two named there. Fixed in v0.22 (see `01` B15, `03` F7/F19, `04` Slideshow Command).

## C2e — The v0.23 broadcast unification only closed the drift at the `broadcastReplace()` layer; its `broadcastStepFrames()` convenience wrapper reintroduced it one layer up (found 2026-07-09, user report — bug B18, unfixed)

> ⚠️ ASSUMPTION (v0.23): the "unified broadcast projector" refactor (`broadcastReplace()` in `server/ws.ts`, `04` §"Unified broadcast projector") was assumed to have fully closed the class of bug C2d/B15 documents — every server→browser `replace` message drifting out of sync on which fields it carries. `broadcastStepFrames()` was added alongside it as "a thin convenience wrapper" for the frames-array + index call shape, and was assumed to forward everything a step-frames broadcast needs.

That assumption is false: `broadcastStepFrames()`'s own signature has no `nodeToFrame` parameter, so `commit_step_frames()`'s live broadcast (via `render-core.ts`'s `commitStepFramesResult()`) silently drops the map even though it was correctly computed and persisted moments earlier — clicking a mapped node in the browser does nothing (no `POST /seek` fires), since the client never sees `nodeToFrame` and disables its click listeners. The history-reload path, which calls `broadcastReplace()` directly rather than through the wrapper, is unaffected — proof the bug is specific to the wrapper's incomplete signature, not the underlying wire protocol.

**Lesson, extending C2d's:** unifying broadcast *construction* into one function only prevents drift among callers of that exact function. A convenience wrapper layered on top reopens the same risk for its own field list, and nothing currently tests that `broadcastStepFrames()`'s output is a superset-safe passthrough of everything `broadcastReplace()` supports. Not yet fixed or assigned a milestone — see `01` B18, `03` U4e, `04` §"Unified broadcast projector" and Node Click Flow.

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
> ✅ IMPLEMENTED (v0.3, Sprint 16): `snapshot.ts` wraps all disk writes in a try/catch. On failure, a warning is logged to stderr and execution continues — snapshot persistence failure never blocks rendering. The `mkdirSync` call uses `{ recursive: true }` to create the workspace directory if absent.
- Risk (residual): restricted home directory configurations or permission issues may still cause silent write failures, but the server remains functional.

**G2 — Workspace is always supplied by the agent (FR4, v0.7)**
> ✅ DECISION (FR4): `options.workspace` in `render()` is mandatory. The server never derives a workspace implicitly — no `basename(process.cwd())` fallback and no `WHITEBOARD_WORKSPACE` env var. The agent must pass an explicit workspace name on every `render()` call. If the parameter is absent, the server returns `{ ok: false, error: "workspace is required" }` and writes no snapshot.
- `WHITEBOARD_WORKSPACE` env var: **deprecated and removed** (v0.7). The server no longer reads it.
- `WHITEBOARD_SNAPSHOTS_DIR` env var: retained — sets the root directory for all snapshots (unrelated to workspace derivation).

**G2b — Workspace override precedence (superseded by FR4)**
> ✅ SUPERSEDED (FR4): The three-level precedence chain (`options.workspace` → `WHITEBOARD_WORKSPACE` → `basename(process.cwd())`) is collapsed. Only one level remains: the agent always supplies workspace explicitly in `options.workspace`.

**G2c — History panel "current workspace" tracked from last render() call**
> ✅ DECISION (v0.7): Since workspace is now mandatory in every `render()` call, the server always knows the most recent workspace. A module-level `lastWorkspace` variable in `session.ts` is updated on every successful `render()`. The history panel endpoints (`GET /snapshots`, `GET /snapshots/all`, `POST /snapshots/load` default) use `lastWorkspace` instead of the removed `WHITEBOARD_WORKSPACE` env var.
- `lastWorkspace` starts as an empty string; history endpoints return empty/no-isCurrent until the first `render()` call in a session.
- No new config surface, no client changes needed.

**G2d — npx distribution is a packaging change only, not an architecture change (FR17)**
> ⚠️ ASSUMPTION: shipping `npx agent-whiteboard` does not require rearchitecting the server, MCP transport, or client — only release/packaging work. Not yet validated by implementation.
- Blocker 1: `package.json` currently has `"private": true` and `"version": "0.1.0"`, both placeholders that predate any real release; must be decided (real starting version, `private: false`) before a first publish.
- Blocker 2: no `bin` entry / CLI wrapper exists. The only start path today is `npm run dev` (`concurrently`: `tsx watch server/index.ts` + Vite dev server + browser auto-open). An installable CLI needs its own entry point.
- Blocker 3 (real architecture gap, confirmed by reading `server/app.ts` / `server/index.ts` during the review): the Hono app has no static-file-serving route wired in for the production client build — `npm run build` produces `dist/client/`, but nothing serves it. The `04_architecture.md` "Dev server" row already flagged "production static build deferred to Phase 2" — this is that phase.
- Risk: until these are resolved, `npx agent-whiteboard` cannot work; the idea is captured here so it isn't lost, but no work is scheduled (see FR17 in `01`, deferred to backlog per user decision 2026-07-03).

**G1b — Snapshot filenames are not guaranteed unique (gap found 2026-07-04, B7 in `01`) — Resolved v0.18**
> ❌ INVALIDATED (implicit assumption): it was implicitly assumed that a second-precision timestamp filename (`<yyyyMMdd_HHmmss>_screen.json`) was sufficient to identify a snapshot uniquely on disk. In practice, two writes in the same wall-clock second (e.g. `render()` immediately followed by `commit_step_frames()`, or two rapid `render()` calls) collide and the second write silently overwrites the first — no error, no warning. Each snapshot's own `id` field (UUID, since v0.11) is unique, but the filename it's written to is not.
- Risk: silent, undetected loss of whiteboard history under ordinary fast-paced agent usage — not an edge case.
- **Resolved (v0.18):** `saveSnapshot()`'s filename now includes the snapshot's own `id` UUID alongside the timestamp, so two writes in the same second never collide. Regression test in `tests/unit/server/snapshot.test.ts`.

**G3 — No snapshot cleanup policy in v1**
> ✅ DECISION: Files accumulate indefinitely by design. No TTL, quota, or rotation is defined, and none is planned for v1.
- Risk: unbounded disk growth over long-lived projects.
- Mitigation: the user has two manual cleanup paths — the history panel's single/multi-select delete and "Workspace delete" (U7e, v0.12), or deleting files directly from `~/.agent-whiteboard/` on disk. No automated policy is needed given these exist. Accepted as sufficient for v1; revisit only if manual cleanup proves inadequate in practice.

**G4 — Snapshot payloads may contain sensitive content**
> ✅ DECISION: The user is responsible for the security of `~/.agent-whiteboard/`. No encryption or access control beyond standard file permissions is planned. This is consistent with the local-only, single-trusted-user deployment model (see A1) — the same trust boundary already applies to the whole tool.
- Risk: diagram payloads stored to disk may contain credentials, internal architecture diagrams, or PII. Accepted risk: the user controls what they render and their machine's file permissions.

---

## I. Incremental Step-Frames Creation (FR5)

**I1 — Partial step-frames state held in memory by ID**
> ✅ DECISION (v0.8): The server holds an in-memory map of `id → { frame_type, frames[], options, timer }`. State is never written to disk until `commit_step_frames()` is called. A 30-minute inactivity TTL (reset by each `append_frame()`) silently deletes abandoned entries — no cleanup API needed. Multiple concurrent builder sessions (distinct IDs) are supported. Specified in F15 (`03`) and `step-frames-builder.ts` (`04`).

**I2 — Frames are always appended sequentially**
> ✅ DECISION (v0.8): Frames are appended in order (frame 0 first, frame N last). Random-access insertion by index is not supported in v0.8. Documented in the `append_frame` MCP tool description. Future phases may add `patch_frame(id, index, payload)`. Specified in F15 (`03`).

**I3 — `init_step_frames()` renders an empty placeholder immediately**
> ✅ DECISION (v0.8): When `init_step_frames()` is called, the server immediately pushes a minimal placeholder state to the browser (`{ action: "replace", type: "step-frames-placeholder", title, frameCount: 0 }`). The browser displays a "Building step-frames… 0 frames" label so the user understands the state. This is fully specified in F15 (`03`) and the data flow section of `04`.

**I4 — `commit_step_frames()` finalization scope**
> ✅ UPDATED (v0.9): `commit_step_frames()` is responsible for finalization only: it assembles the full step-frames JSON, writes the snapshot, updates in-memory canvas state (so `export()` returns the complete assembled JSON), cancels any running slideshow, and deletes the builder entry. It still pushes a final WebSocket broadcast to the browser as part of the standard render pipeline (for consistency and to handle edge cases such as `clear()` being called between appends), but the primary visual appears incrementally via `append_frame()` — not at commit time. `commit_step_frames()` can fail only if the sequence is empty or the ID is unknown. `clear()` does NOT cancel in-progress builder entries.

**I5 — `append_frame()` renders an incremental partial step-frames preview**
> ✅ DECISION (v0.9): After each valid `append_frame()` call, the server immediately pushes the full accumulated partial step-frames sequence to the browser via WebSocket — the same format as `render(type="step-frames", ...)` but with only the frames appended so far, positioned at the latest frame (index N-1). The user sees the sequence grow one frame at a time. The in-memory canvas state is NOT updated on `append_frame()` — only `commit_step_frames()` updates it. Invalid payloads are rejected before any broadcast; prior frames and the browser state are preserved.

**I6 — False assumption: validation parity between the one-shot and incremental step-frames paths (B5, found 2026-07-03)**
> ❌ INVALIDATED: it was implicitly assumed (never explicitly stated as a decision, which is itself the gap) that `render(type="step-frames", ...)` and `append_frame()` gave the same validation guarantee per frame, since both ultimately produce the same `StepFrame[]` shape. In fact `append_frame()` calls `validatePayload(entry.frame_type, payload)` per frame (I1, v0.8) while the one-shot path only checks payload shape (`frame_type` is a string, `frames` non-empty, each `frame.payload` is a string) — it never runs `parseMermaid()` or the vega-lite JSON check against individual frames. A malformed frame in a one-shot payload is accepted and only fails when the user navigates to it.
> - Risk (historical): any future change to the incremental builder's validation that assumed "the one-shot path already does this too" would have been building on a false premise — the two paths had to be checked independently until unified.
> - ✅ Resolved v0.17 (see F3a-gap in `03`, B5 in `01`, and the architecture note in `04`): `validatePayload()`'s `step-frames` branch now validates every frame, unifying the two paths — both `render(type="step-frames")` and `append_frame()` give the same validation guarantee per frame. `StepFrame` also gained an optional per-frame `type`, additionally allowing mixed-type sequences.

---

**F1 — Test folder restructure (Sprint 15)**

> ✅ DECISION: `tests/unit/client/` is a placeholder only — no Svelte component unit tests exist today, and none are planned for v1. The directory signals intent but adds no immediate test coverage. Accepted: `tests/e2e/canvas.spec.ts` (Playwright) already covers the interactive browser surface end-to-end; component-level unit tests are deferred indefinitely rather than scoped to a milestone.

Risks from moving the three test roots:
- `playwright.config.ts` `testDir` must be updated to `"./tests/e2e"` — a missed update breaks `npm run test:e2e`
- `vitest.config.ts` `include` pattern must be updated to `"tests/unit/server/**/*.test.ts"` — a missed update causes Vitest to find no tests (silent pass instead of real coverage)
- `package.json` scripts that reference `manualtests/` (e.g. `node manualtests/showcase.js`) must be updated; any external runbooks or docs referencing old paths will silently break
- `test-results/` is a Playwright artifact output directory (controlled by `playwright.config.ts` `outputDir`); it is not a source folder and is not included in the `tests/` hierarchy — leaving it at root is correct, or it can be redirected to `tests/test-results/` via config without moving any source files
- **Decision:** `test-results/` stays at root (default Playwright behavior) unless the user decides otherwise

---

## H. History Navigation

**H1 — History load is write-silent**
> ✅ IMPLEMENTED (v0.4, Sprint 17): `POST /snapshots/load` renders via a dedicated code path that bypasses `snapshot.ts`. Only agent-initiated `render()` calls write snapshot files; user-initiated history navigation does not. This invariant is enforced in the implementation.

**H2 — Agent is unaware of history navigation**
> ✅ DECISION (v0.4): When the user loads a past snapshot from the history panel, the canvas is updated but the agent is not notified. Pending `wait_click()` or `wait_done()` calls continue waiting until their 10-minute timeout. If `wait_click()` is armed and the user loads a different diagram, the agent times out normally. Accepted as expected behavior — agent recovers via timeout handling.

**H3 — options.title is the history label**
> ✅ IMPLEMENTED (v0.4, Sprint 17): The history navigator uses `options.title` (stored in the snapshot `options` field) as the human-readable label for each entry. Falls back to `type + timestamp` if absent or empty. `options` (including `title`) is persisted by `snapshot.ts` — no schema change needed.

**H4 — All workspaces' snapshots are visible in the history panel**
> ✅ DECISION (v0.5): `GET /snapshots/all` scans every subdirectory of `~/.agent-whiteboard/` and returns contents grouped by workspace. All-workspace visibility accepted as expected behavior for a single-user local tool (see A1). Risk (multiple users sharing a machine) is accepted within the localhost-only deployment scope.

**H5 — Cross-workspace snapshot load is safe with a workspace name safety check**
> ✅ IMPLEMENTED (v0.5, Sprint 18): `POST /snapshots/load` validates `workspace` against a safe-name pattern (alphanumeric, dashes, underscores, dots, spaces; no path separators, no `..`, no null bytes) before resolving the path. Directory must exist under `WHITEBOARD_SNAPSHOTS_DIR`. Path traversal attacks are mitigated.

**H6 — History load updates current workspace (FR8, v0.10 ✅)**
> ✅ IMPLEMENTED (v0.10): When `POST /snapshots/load` succeeds, `lastWorkspace` is updated to the workspace of the loaded snapshot. This makes subsequent agent `render()` calls (which require `options.workspace`) and history panel opens consistent with the user's last navigation action — the user's browsing intent sets the working context.
- Risk: if the agent resumes generating diagrams after a history navigation, it may be surprised that `lastWorkspace` changed without an explicit `render()` call. Accepted: the user's action was deliberate; the agent is unaware of history navigation per H2 and will supply its own workspace in every `render()` call anyway (mandatory since v0.7, G2).
- Difference from H2: H2 (agent unaware of canvas change) is unchanged. H6 is a new consequence for server-side `lastWorkspace` state only.

**H7 — Controls panel replaces footer (FR9, v0.10 ✅)**
> ✅ IMPLEMENTED (v0.10): Moving the History toggle and Done button to a small right side panel was a pure client-side refactor. No server-side changes required. The Done button's click handler (`POST /user-done`) is unchanged; only its DOM placement and label changed.
- Risk: the right panel could occlude content on narrow viewports. Accepted: target audience is developers on workstations; narrow-viewport use is out of scope for v1.

**H8 — Done button arm state must be resent on WebSocket reconnect (FR11, v0.12 ✅)**
> ✅ IMPLEMENTED (v0.12): When a new browser connection opens (or the page reloads) while `wait_done()` is currently armed on the server, the server emits the `set_done_armed: true` event to the new connection so the Done button appears correctly.
- Risk: if the server only emits `set_done_armed` at call time (not on connect), a page refresh while `wait_done()` is in progress will leave the Done button hidden. The user cannot signal they are done until the agent times out (10 minutes).
- Mitigation: server tracks current `doneArmed` state in-memory; on WebSocket connect, immediately pushes `{ action: "set_done_armed", armed: <current state> }` to the new connection.

**K1 — Snapshot deletion is permanent (FR12, v0.12)**
> ✅ DECISION: Deleting a snapshot or workspace permanently removes files from the user's `~/.agent-whiteboard/` directory. There is no undo, no trash/recycle bin, and no soft-delete mechanism — accepted by design.
- Risk: accidental bulk deletion (e.g. "Workspace delete") destroys snapshots that cannot be recovered.
- Mitigation: a confirmation step is required for both "Delete entire workspace" and "Delete selected" (subset, including a single checked item) in the v0.16 delete/export modal (see K3, U7i) — replacing the old `window.confirm()`. ("Clear workspace" no longer exists — removed in v0.13, see K2.)
- **Gap found 2026-07-04 (B6 in `01`, code review) — Resolved v0.18:** the confirmation-step mitigation only covered the browser UI path. `POST /snapshots/delete-workspace` itself had a validation gap — `workspace: "."` passed its weaker ad hoc safety check and resolved to the snapshots root, so a direct call (bypassing the UI confirmation entirely) deleted every workspace's history in one shot. **Resolved:** the endpoint now reuses `isValidWorkspaceName()` and asserts the resolved path stays strictly inside the snapshots root before `rmSync`; regression test confirms `{"workspace": "."}` is rejected and deletes nothing.

**K2 — Workspace delete removes the OS directory (FR12, v0.12; Clear workspace removed v0.13)**
> ✅ DECISION (v0.13): "Clear workspace" is removed — it has the same high-level effect as "Workspace delete" with the added complexity of leaving behind an empty directory and an empty accordion row. `POST /snapshots/clear-workspace` server endpoint and corresponding UI button are removed. Only one bulk workspace operation remains: "Workspace delete", which calls `fs.rmdirSync` (or equivalent) and removes the directory and all its contents.
- Risk: if non-snapshot files exist inside a workspace directory (e.g. user placed other files there), "Workspace delete" removes them too.
- Decision: document clearly in UI that the operation removes all contents of the workspace folder. No scanning or selective removal in v1.

**K3 — Delete/export modal redesign (FR16, v0.16, shipped)**
> ✅ DECISION (2026-07-03, via `/grill-me` interview during intake — first pass got no response while the user was away, defaults were adopted provisionally; user then explicitly requested a re-grill and confirmed all 5 points live, unchanged from the provisional defaults):
> 1. **Full replacement:** the 2-step delete/export modal (see FR16 in `01`, prototyped in `mockup/whiteboard-view-v2.html`) replaces the entire inline selection UI in `HistoryPanel.svelte` — header recycle-bin/export icons, per-row checkboxes, select-bar, and per-workspace action bar are all removed. This narrows subset-selection from "any items across any workspaces in one action" (old UI) to "a subset within one workspace per action" (new modal, "zoom in" framing) — confirmed as an intentional scope reduction.
> 2. **Per-row single-delete button removed:** the always-visible hover-trash icon on each snapshot row is removed. Deleting one snapshot now goes through the modal (pick workspace → check 1 → "Delete selected"). One delete affordance, not two.
> 3. **Whole-workspace delete keeps a confirmation step**, consistent with K1's existing mitigation — the modal's "Delete entire workspace" and "Delete selected" actions require a second confirming interaction before they execute (e.g. a "click again to confirm" button state, replacing the old `window.confirm()`). Export actions ("Export entire workspace" / "Export selected") need no confirmation (non-destructive, no data loss).
> 4. **Step 1 (choose workspace) is skipped when exactly one workspace has snapshots** — the modal opens directly into step 2 for that workspace (back arrow hidden in this case, since there's no step 1 to return to). Step 1 shows normally whenever ≥2 workspaces exist.
> 5. **Pure client-side refactor:** no new REST endpoints or server-side changes. `POST /snapshots/delete-files`, `POST /snapshots/delete-workspace`, and `POST /export-html` (all filename-keyed, per L5's decision not to retrofit browser endpoints to `id`-based addressing) already cover everything the modal needs.

**J1 — Snapshot schema gains an `id` field (FR7, v0.11 ✅)**
> ✅ IMPLEMENTED (v0.11): Each snapshot JSON file includes an `id` UUID field generated at write time. Old snapshot files written before v0.11 do not have this field — the server handles `id: undefined` gracefully (treated as non-exportable by ID). The `render()` and `commit_step_frames()` success responses include the generated `id` field. Adding a new field to the snapshot schema and MCP response is backward-compatible: existing consumers ignore unknown fields.

---

## L. HTML Export (v0.13)

**L1 — `happy-dom` provides a sufficient DOM environment for server-side Mermaid rendering**
~~> ⚠️ ASSUMPTION: `mermaid.render()` can be called in a Node.js process when `happy-dom` provides `document`, `window`, and SVG DOM globals. The produced SVG is deterministic and complete.~~
> ❌ INVALIDATED (bug B4, `01`; fixed in v0.14, **shipped**): the flagged risk materialized in practice. `happy-dom` does not implement real text-layout/font-metrics APIs (no working `getComputedTextLength`, no real `getBBox`), which Mermaid's dagre-based layout engine depends on to size nodes and route edges. Observed failure modes: (1) node/edge `<foreignObject>` labels collapse to `width="0" height="0"` — text is present in the DOM but invisible; (2) the exported SVG's computed bounding box shrinks to the collapsed layout, producing a much-too-tight viewBox ("too zoomed in"); (3) diagrams with edge labels plus certain node shapes hit a different mermaid code path that throws outright (`"Could not find a suitable point for the given distance"`) instead of degrading silently. Per-item error isolation (previous mitigation) only caught case (3), not (1)/(2), since those don't throw.
- **Decision (v0.14, shipped):** stop rendering Mermaid server-side via `happy-dom`. Instead, embed the Mermaid source and the full `mermaid.js` library inline in the exported HTML and let it render client-side, in a real browser, when the file is opened — see F17 (`03`) and the HTML Export data flow (`04`). `happy-dom` is retained only for KaTeX/Vega-Lite/SVG/HTML paths, which do not depend on text-layout metrics. `server/export-html.ts` no longer renders Mermaid server-side (see `Milestone_v0.14.md`, Sprint 27, status released).
- Risk (residual): `happy-dom` APIs may still change across versions for the remaining (KaTeX/Vega-Lite/SVG/HTML) usages. Pin at install time.

**L2 — KaTeX runs server-side without a DOM**
> ✅ VALIDATED: `katex.renderToString(source, { displayMode: true, throwOnError: false })` does not require a browser DOM and can be called directly in Node.js. This is a documented property of KaTeX (it is specifically designed for server-side use), and has been running in production since v0.13.

**L3 — Vega-Lite can be compiled and rendered to SVG in Node.js**
> ✅ VALIDATED (in production use since v0.13): The pipeline `vl.compile(spec).spec` → `vega.parse()` → `new vega.View().toSVG()` works in Node.js without a full browser environment, as shipped in `POST /export-html`.
- Risk: Vega chart types that use canvas-backed rendering may fail server-side.
- Mitigation: per-item error isolation (same as L1).

**L4 — DOMPurify sanitization shares the `happy-dom` Window with Mermaid rendering**
> ✅ DECISION: One `happy-dom` Window instance is created per export call and reused for both `mermaid.render()` and `DOMPurify` (with `USE_PROFILES: { svg: true }` for SVG payloads, `{ html: true }` for HTML payloads). The Window is torn down after all items are rendered.
- **Gap found 2026-07-04 (B14 in `01`, code review) — Resolved v0.18:** the per-export Window is smuggled through Node's `global.*` object (`saveGlobals()`/`setGlobals()`/`restoreGlobals()` in `export-html.ts`), with no lock preventing two calls to `generateExportHtml()` from overlapping. It's reachable concurrently from two independent entry points — `POST /export-html` (browser) and the `export_html` MCP tool (agent) — which a single session could plausibly trigger close together. An overlapping second call's globals stomp on the first call's mid-flight state, and the first call's `finally` block restores globals out from under the second. Confirmed via a debug trace: `global.document` was left pointing at an already-closed Window after two overlapping calls settled. **Resolved:** the implementation (renamed `generateExportHtmlInner()`) is now called through a `generateExportHtml()` wrapper that serializes calls via a simple promise queue, so only one call's globals are ever active at once. Regression test in `tests/unit/server/export-html.test.ts`.

**L5 — Agent-facing export addresses snapshots by `id`; browser-facing endpoints stay filename-based (FR15, v0.15)**
> ✅ DECISION (2026-07-02, via `/grill-me` interview during intake): the objection to `id`-based addressing (some old snapshots lacked `id`) no longer applies — `saveSnapshot()` has generated an `id` unconditionally since v0.11 (never optional), and `scripts/backfill-snapshot-ids.py` has since been run against `~/.agent-whiteboard/`, so every snapshot on disk now has an `id`. Decisions:
> 1. **New agent-facing tools (`list_snapshots`, `export_html`) use `id` exclusively** — consistent with the existing `export(id)` / `render()` → `{ id }` precedent (F16, J1). Filename is treated as an internal storage detail the agent does not need.
> 2. **Existing browser-facing endpoints are NOT retrofitted in this milestone.** `GET /snapshots`, `GET /snapshots/all`, `POST /snapshots/load`, and `POST /snapshots/delete-files` remain filename-based; `HistoryPanel.svelte`'s selection/delete/export logic (keyed by filename) is untouched. Standardizing the browser flow on `id` is a real improvement but a much larger refactor (4–5 endpoints + a 755-line Svelte component) — deferred to its own future milestone so v0.15 stays focused and shippable.
> 3. **`POST /export-html` is extended, not duplicated:** each item in the `items` array may be `{ workspace, filename }` (existing, browser) or `{ workspace, id }` (new, agent) — one rendering pipeline, one lookup-by-id branch added alongside the existing lookup-by-filename.
> 4. **`GET /snapshots` is extended additively:** each returned entry gains an `id` field (harmless for the browser, which ignores unknown fields), and the endpoint accepts an optional explicit `?workspace=` query param — mandatory for agent use via `list_snapshots()`, still defaulting to `lastWorkspace` for the browser's existing call pattern.
> - Risk (residual): if a snapshot write ever failed to include `id` (e.g. a future code regression), that snapshot would be invisible to `id`-based export. Accepted: `saveSnapshot()` always generates `id` before any conditional logic; no code path skips it.

**L6 — `export_html` MCP tool writes to disk instead of returning HTML inline (v0.15)**
> ✅ DECISION: exported HTML can embed the full `mermaid.js` bundle (~3.3MB, see L1). Returning that inline in an MCP tool response would waste agent context and risk hitting tool-response size limits. The `export_html(workspace, ids, output_path?)` MCP tool instead writes the assembled HTML to disk and returns `{ ok: true, path }`. Default location (when `output_path` is omitted): `<WHITEBOARD_SNAPSHOTS_DIR>/<workspace>/exports/<name>-YYYYMMDD-HHmmss.html`, reusing the existing `buildDownloadFilename()` naming convention.
> - **`output_path` has no path restriction** when provided: the tool creates parent directories (`mkdir -p` semantics) and writes there, with no traversal/boundary check. Rationale: the calling agent already has unrestricted filesystem write access on the host via its own Bash/Write tools — this is the same local, single-trusted-user boundary as A1/G4. Adding a restriction here would not close any real attack surface, only add friction.
> - **Relative `output_path` values resolve against the server process's working directory**, not the agent's — since the server is typically a long-lived background process, its cwd may differ from the agent's session cwd. The MCP tool description must tell the agent to pass an absolute path if a specific location is required.
> - No REST endpoint is added purely for "write to disk" — a curl-based caller already gets this behavior for free via `curl ... -o file.html` against the (now `id`-aware) `POST /export-html`. Only the MCP tool wraps the disk-write + default-path convenience.

---

## M. Design Debt Remediation (v0.20/v0.21)

> Promoted 2026-07-05 from the Design Debt Log (`01`) via a `/grill-me` scoping interview during intake. Split into two milestones by regression risk: v0.20 is additive/no-behavior-change, v0.21 is the behavior-risk refactor work, deliberately sequenced after the safety net. See `03` NF9–NF13, `05` Milestone_v0.20.md / Milestone_v0.21.md.

**M1 — Retrofitting a linter after 32 sprints of unstyled code (v0.20)**
> ⚠️ ASSUMPTION: introducing ESLint (`eslint-plugin-svelte` + `@typescript-eslint`) now, rather than at project start, is still net-positive despite the codebase predating it.
- Risk: a first run against 32 sprints of code could surface a large one-time diff of violations, making the initial PR noisy and hard to review.
- Mitigation: scope the initial ruleset to catch real bugs (the class of thing that produced the a11y/unsafe-cast findings in the code review), not full stylistic conformance; let `--fix` absorb the mechanical part; don't gate CI/build on lint passing until the codebase is clean.

**M2 — Blanket test coverage is an adequate safety net for the v0.21 refactors, even though it isn't scoped to the refactor targets**
> ⚠️ ASSUMPTION: writing tests for every currently-untested module/component (client, `export-html.ts`, `slideshow.ts`, `events.ts`, `ws.ts`, `channel.ts`, `session.ts`, plus deeper `mcp.ts` coverage) in v0.20 gives enough behavioral coverage to catch regressions introduced by the v0.21 refactors (shared-core extraction, App.svelte decomposition), even though the tests aren't specifically targeted at those refactor's code paths.
- Risk: coverage gaps could still exist in exactly the code the refactors touch, since "blanket" breadth doesn't guarantee depth on any one module.
- Mitigation: the existing 31-test Playwright e2e suite (§7 in `04`) already exercises the full interactive browser surface end-to-end and is the real backstop — it must pass unchanged after both v0.21 refactors, independent of how the new unit tests are scoped.

**M3 — CSP + explicit Mermaid `securityLevel` is pure hardening with no rendering-behavior change (v0.20)**
> ⚠️ ASSUMPTION: adding a `Content-Security-Policy` header and an explicit Mermaid `securityLevel` is defense-in-depth only, since DOMPurify already sanitizes SVG/HTML payloads (see A/C sections above) and no live gap is being closed.
- Risk: a strict CSP (no `unsafe-inline`, no `unsafe-eval`) could break Mermaid's runtime diagram rendering (dagre/d3 sometimes inject inline styles) or Vega-Embed's canvas-backed rendering path (L3).
- Mitigation: start with a CSP permissive enough not to break current renderers, verified against the full e2e suite (§7 in `04`) before considering tightening it further in a future pass.

**M4 — Shared-core module extraction (`server/app.ts` + `server/mcp.ts`) is the highest blast-radius item in this remediation pass**
> ⚠️ RISK: consolidating the duplicated render/step-frames/workspace-validation logic reduces *future* drift risk (this duplication was the root cause of the `workspace: "."` bug, B6 in `01`) — but the extraction itself means a bug introduced during the refactor now affects the HTTP path and the MCP path simultaneously, instead of just one.
- Mitigation: ships in v0.21, after the v0.20 safety net (linter + blanket test coverage) lands; the full existing integration suite (223+ Vitest cases, §7 in `04`) must pass unchanged before this is considered done. Runs independently of the App.svelte/dynamic-import work in v0.21 (different layer — backend vs. frontend), so it doesn't block or get blocked by that sequencing.

**M5 — App.svelte decomposition risk (v0.21)**
> ⚠️ RISK: extracting WebSocket routing, canvas state, step-frame nav, modal orchestration, and Done-button lifecycle out of the 449-line god component into stores/reducers risks subtle Svelte reactivity-ordering regressions (e.g., a derived value recomputing in a different order than before).
- Mitigation: the 31-test e2e suite (§7 in `04`) covers this exact interactive surface end-to-end and must pass unchanged; scheduled *before* dynamic imports (M6) in v0.21 so lazy-load boundaries get placed against the new (settled) component/store boundaries rather than the current god component.

**M6 — Dynamic imports introduce a first-use loading delay, previously masked by eager bundling (v0.21)**
> ✅ ACCEPTED TRADE-OFF: lazy-loading Mermaid/KaTeX/Vega-Embed at the point of first use (after M5 settles component boundaries) means the first render of a given canvas type incurs a network/parse delay it didn't before.
- Accepted: this isn't on the app's critical startup path (nothing renders until the agent calls `render()` anyway) and reduces initial bundle size for every session that doesn't use every renderer type. No loading-spinner requirement is added for this.

**M7 — Version drift is not one uniform-risk item — split by actual blast radius (deferred item, not scheduled in v0.20/v0.21)**
> ⚠️ RISK (found during grill-me scoping, 2026-07-05): the Design Debt Log's "version drift" item bundled a trivial fix with a real migration. `@types/katex` was assumed to need a `0.16.8` → `0.17.x` bump to match installed `katex@0.17.0` — **implemented 2026-07-05 (v0.20), but not as a version bump:** no `0.17.x` release of `@types/katex` exists on npm (latest published is still `0.16.8`). Investigation found `katex@0.17.0` now ships its own native types (`types/katex.d.ts`, declared via its own `package.json` `"types"` field), making the separate DefinitelyTyped package obsolete for this version. Fix: removed `@types/katex` from `package.json` entirely; TypeScript resolves types directly from `katex`'s own package. Verified: `npm run build` (tsc + svelte-check + vite build) and `npm test` both pass unchanged. Vite (`4.5.10` → `8.1.3`, 4 majors behind) and `tsx` (`3.14` → `4.23`, 1 major behind) are **not** bundled in — `vitest@0.34.6` and `@sveltejs/vite-plugin-svelte` are both version-locked to the Vite major currently in use, so a Vite bump is its own migration with its own compatibility risk, not a hygiene fix.
- Mitigation: Vite/tsx migration remains logged in `01`'s Design Debt Log, unscheduled, until it gets its own scoping pass.

**M8 — Client/server `package.json` split into npm workspaces (deferred item, not scheduled)**
> ⚠️ RISK: unlike the small code-level hygiene fixes bundled into v0.20 (redundant `try/catch`, silent `catch {}`, memoizing `getMermaidBundle()`/`getKatexCss()`), splitting the shared `package.json` into an npm-workspaces layout touches `vite.config.ts`, build scripts, and potentially CI — a build-tooling restructuring, not a code fix.
- Mitigation: remains logged in `01`'s Design Debt Log, unscheduled, until it gets its own scoping pass.

---

## N. Architecture Consolidation (v0.23–v0.26)

> Promoted 2026-07-07 from `desing-analysis/` (a fresh-eyes structural redesign written before reading the code) via a `/grill-me` stress-test during intake (FR22 in `01`). The full analysis — target architecture, 9 unit deep-dives, decision points D1–D5, open questions OQ1–OQ15, and a baseline comparison grounded in the real code — was propagated here and into `03` §7 / `04` §9 / `Milestone_v0.23.md`–`Milestone_v0.26.md`, then the `desing-analysis/` folder was deleted (see N1). See `04` §9 for the actual target architecture (unit map, decision points, contract changes); this section covers only the meta-decisions about *whether/when/how* to adopt it.

**N1 — `desing-analysis/` is intake material, not a permanent parallel doc**
> ✅ DECISION: once its content is fully propagated into `02`/`03`/`04`/milestones, the folder is deleted. Keeping it around indefinitely would create a second source of truth that can drift from the canonical docs the moment implementation deviates from the plan — precisely the failure mode (`04` lagging the real code once already, see the baseline-comparison's closing note) this whole redesign targets one level up. The original fresh-eyes writeup remains recoverable from git history if ever needed.

**N2 — Full adoption (slices A+B+C+D), not the analysis's own risk-weighted recommendation**
> ✅ DECISION: the baseline-comparison document explicitly recommends adopting only slices A (unified projector), B (client renderer registry), and C (persistence policy + finalize dedup) now, deferring D (full Presentation/Frame model + snapshot migration + MCP contract break) "only if feature growth continues." User chose full A+B+C+D instead.
- Driver (confirmed via `/grill-me`): architecture-quality on principle ahead of a not-yet-scheduled public release — not a specific feature requiring the unified model. "We still have a few misbehaviours and we are close to a public release, so the quality of the design and the code matters as well as the app itself."
- Risk (accepted): D's own documented costs (C1–C4 below) are the strongest argument in the whole analysis and are not hypothetical — full adoption is a deliberate override of the analysis's own ROI ÷ blast-radius recommendation, not a default acceptance.

**N3 — Sequencing: one milestone per slice; D kept as one milestone with ordered, individually-tested sprint tasks**
> ✅ DECISION: v0.23 = A, v0.24 = B, v0.25 = C, v0.26 = D (see `05` Milestone Registry). D's own coupling (session.ts, canvasStore.ts, the WS contract, and the snapshot schema move together — cannot land one small PR at a time, per the baseline-comparison's C1) means it cannot be fragmented across version boundaries without a compat shim already ruled out (N5). It stays one milestone, but its sprint tasks are strictly ordered with individual acceptance criteria (schema+migration → reducer → WS contract → adapter/payload updates → return-channel generalization → full test-suite rewrite) — see `Milestone_v0.26.md`.

**N4 — Release gating de-risks D's contract break (C3)**
> ✅ DECISION: the redesign (all of A–D) completes *before* any public release; no fixed release date exists yet. This is deliberate: today there are zero external MCP consumers (solo project, single git contributor across all history) — the cheapest possible moment to break `type:"step-frames"` as a content type and change the WS/payload contract is now, not after shipping the old contract publicly and breaking it on real users shortly after launch.
- Consequence: **no back-compat shim** for the old MCP payload shape is planned or wanted — a clean cutover, consistent with this project's existing "no backwards-compatibility hacks" convention. `tests/human_driven/showcase.js` and `README.md` are updated to the new contract as part of v0.26, not maintained in parallel.
- Residual risk: if a public release date gets set before v0.26 completes, this decision must be revisited — shipping the *old* contract publicly, even briefly, reintroduces C3's real cost.

**N5 — Snapshot migration risk is bounded: real but small personal data, not "real user data" at scale**
> ✅ CLARIFIED: the baseline-comparison's C4 risk ("a bug corrupts real history") is real but the blast radius is now known precisely — `~/.agent-whiteboard/` currently holds 54 snapshots across 8 workspaces (`agent-whiteboard`, `distributed-systems-101`, `my-redis`, and five `study-coach_*` workspaces), all the user's own local data, single-developer, no other consumer.
- Mitigation (required for `Milestone_v0.26.md`'s migration task): back up `~/.agent-whiteboard/` before running the one-time deterministic migration script (OQ5a — a one-time upgrade, not a legacy dual-read path); the script must be idempotent and verified in a dry-run/backup-copy mode before running against the real directory.
- Not a blocker: small volume (54 files) makes exhaustive verification against a real backup copy tractable before committing to the real run, unlike the analysis's generic "corrupts real user data" framing which implicitly assumed a larger, less-inspectable dataset.
