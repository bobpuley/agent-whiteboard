# Server design problems — REST/MCP duplication audit

Scope: `server/*.ts` (17 files, ~3535 lines), triggered by `server/app.ts` being
>600 lines with responsibilities that aren't clearly separated. This report
focuses on the concrete question: **how much logic is actually shared between
the REST entry point (`app.ts`) and the MCP entry point (`mcp.ts`), and where
does each one carry its own copy of the same rule?**

Every finding below is backed by a file:line reference. No code was changed;
this is an analysis document.

---

## 1. What already works well

Several modules exist specifically to be the single source of truth for both
transports, and mostly succeed:

- **`render-core.ts`** — its header comment states the intent directly: *"used
  identically by the REST handlers (app.ts) and the MCP tool handlers
  (mcp.ts) so the two transports can never drift (NF12)."* Five functions
  fully deliver on this: `validateWorkspaceInput`, `commitRenderResult`,
  `initStepFramesResult`, `appendFrameAndBroadcast`, `commitStepFramesResult`.
  Both `app.ts` and `mcp.ts` do nothing but parse their protocol-specific
  input, call one of these, and format the protocol-specific output.
- **`validate.ts`** — `validateFrame()` is documented (line 78-82) as the
  single atomic-content validator: *"Every command path that accepts frame
  content ... funnels each frame through this same function; there is no
  second implementation."* True for `render()` and `append_frame()`. Not true
  for `slideshow()` (see Finding 1).
- **`persist.ts`** — a registry (`COMMAND_PERSIST_TRIGGERS`) that forces every
  command path to declare how it persists, specifically to prevent the
  historical bug where `slideshow()` silently never wrote a snapshot
  (FR20/B15, referenced in the file's own comments).
- **`ws.ts`** — `broadcastReplace()` is a single builder every broadcast site
  goes through, explicitly to prevent fields from being silently dropped by
  one call site and not another (the B15/C2b/C2d "drift class" described in
  the file).
- **`interaction.ts`** — one arm/await/resolve primitive
  (`createBroadcastInteraction` / `createSingleFlightInteraction`) backs both
  `wait_done` and `wait_click`, in both transports.

These are the right pattern. The problems below are all places where the same
pattern was *not* applied — usually to functionality added after the initial
design.

---

## 2. REST ↔ MCP endpoint map

| REST | MCP tool | Shared? |
|---|---|---|
| `POST /render` | `render` | ✅ fully shared (`commitRenderResult`) |
| `POST /step` | `step` | ⚠️ business logic duplicated, not in `render-core.ts` |
| `POST /seek` | `seek` | ⚠️ business logic duplicated, not in `render-core.ts` |
| `POST /clear` | `clear` | ⚠️ duplicated (3 lines, low risk) |
| `POST /slideshow` | `slideshow` | 🔴 diverges: different validation logic |
| `POST /slideshow/stop` | `slideshow_stop` | ⚠️ duplicated (1 line, negligible) |
| `POST /step-frames/init` | `init_step_frames` | ✅ shared |
| `POST /step-frames/:id/frame` | `append_frame` | ✅ shared |
| `POST /step-frames/:id/commit` | `commit_step_frames` | ✅ shared logic; duplicated input-shape validation |
| `POST /wait-done` | `wait_done` | ✅ shared (`waitForDone`) |
| `POST /wait-click` | `wait_click` | ✅ shared logic; duplicated input-shape validation |
| `GET /export` | `export` | ⚠️ handler body duplicated verbatim |
| `GET /snapshots` | `list_snapshots` | 🔴 diverges: different validation rules, different behavior |
| `POST /export-html` | `export_html` | ⚠️ partially shared; feature asymmetry |
| `GET /snapshots/all` | — | REST-only (browser HistoryPanel) |
| `POST /snapshots/load` | — | REST-only (browser HistoryPanel) |
| `POST /viewport` | — | REST-only (browser pan/zoom persistence) |
| `POST /snapshots/delete-files` | — | REST-only (browser HistoryPanel) |
| `POST /snapshots/delete-workspace` | — | REST-only (browser HistoryPanel) |
| `POST /user-done` | — | REST-only (inbound signal from browser) |
| `POST /node-click` | — | REST-only (inbound signal from browser) |

The REST-only rows are correct as-is — they're called by the browser UI, not
an agent. That's a different consumer, not duplication.

---

## 3. Findings, ranked by severity

### 🔴 F1 — `slideshow`: MCP tool bypasses the documented validation invariant

`validate.ts:78-82` states there is "no second implementation" of frame
validation. But the MCP `slideshow` tool (`mcp.ts:256-299`) does not call
`validateFrame()` at all — it hand-rolls a subset of the same checks inline
(`hasMermaidKeyword` + `parseMermaid` for mermaid, `JSON.parse` for
vega-lite). The REST `/slideshow` handler (`app.ts:219`) correctly calls
`validateFrame()` for every slide.

Observable impact today is limited, because `validateFrame()` is currently a
no-op for `svg`/`html`/`katex`. But the divergence is real: any future change
to `validateFrame()` (a size limit, a sanitation rule, a new type) is
automatically picked up by REST and silently *not* picked up by MCP, because
MCP's `slideshow` doesn't route through it.

**Files:** `server/validate.ts:78-111`, `server/mcp.ts:256-299`,
`server/app.ts:203-228`

### 🔴 F2 — `step`/`seek`: the one hot-path pair never extracted into `render-core.ts`

Unlike `render`/`init_step_frames`/`append_frame`/`commit_step_frames`, the
business logic behind `step` and `seek` is copied character-for-character
between the two files instead of living in `render-core.ts`.

`step`: compare `app.ts:114-142` to `mcp.ts:108-146`. Both independently
build `resolvedId`, call `getViewport(resolvedId, result.currentFrame)`, and
call `broadcastStepFrames(...)` — same lines, same order, same logic.

`seek`: compare `app.ts:144-175` to `mcp.ts:149-194`. Both independently do
the bounds check, call `seekStepFrame`, build `resolvedId`, and call
`broadcastReplace(...)` with a `getViewport` lookup.

This directly contradicts `render-core.ts`'s own stated purpose (NF12 — "the
two transports can never drift"), which in practice only covers half of the
stateful commands.

**Files:** `server/app.ts:114-175`, `server/mcp.ts:95-194`,
`server/render-core.ts` (target location, currently missing these)

### 🟡 F3 — `list_snapshots` vs `GET /snapshots`: same intent, different rules, different behavior

MCP's `list_snapshots` (`mcp.ts:557`) uses `validateWorkspaceInput()` —
workspace is required, no fallback. REST's `GET /snapshots`
(`app.ts:370-383`) uses a different inline check — workspace is optional and
falls back to `getLastWorkspace()` when omitted. This is not just duplicated
code; it's **different observable behavior** for what's conceptually the same
operation.

**Files:** `server/app.ts:370-383`, `server/mcp.ts:539-569`,
`server/render-core.ts:24-36`

### 🟡 F4 — `export-html`: feature asymmetry, not just duplication

REST accepts export items as either `{workspace, filename}` or
`{workspace, id}` per item. MCP's `export_html` only accepts
`{workspace, ids}`. The filename-lookup branch in `app.ts:653-674`
hand-parses and shape-checks a snapshot file inline instead of reusing
anything from `snapshot-reader.ts`.

This asymmetry is plausibly intentional (`filename` is a browser-only
concept; agents work from `ids` returned by `list_snapshots`), but it isn't
documented as a deliberate design decision anywhere — it reads like an
REST-only extension that was never formalized or revisited for MCP parity.

**Files:** `server/app.ts:637-696`, `server/mcp.ts:572-654`

### 🟡 F5 — Snapshot-root resolution is reimplemented independently 9 times

The expression `process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(),
".agent-whiteboard")` (or an equivalent local function wrapping it) appears
as nine separate, independent definitions:

- `app.ts:358`, `app.ts:384`, `app.ts:393`, `app.ts:412` — four raw inline
  copies
- `app.ts:540-542` — `resolveSnapshotRoot()`, a *local* function scoped to
  `createApp()`'s closure, so it's usable within `app.ts` but not importable
  by `mcp.ts`
- `mcp.ts:518`, `mcp.ts:563`, `mcp.ts:620` — three more raw inline copies
- `viewport-cache.ts:20-22` — its own private `snapshotsRoot()` function
- `snapshot.ts:56` — another inline copy, inside `saveSnapshot()`

No module exports a single canonical function for this. Every file that
needs the snapshots root re-derives it.

**Files:** as listed above

### 🟢 F6 — The "is this a valid Frame" predicate is written 3 times, twice in the same file

- `snapshot-reader.ts:33-39` — embedded inside `isFrameArray()`
- `app.ts:450-451` — re-defined inline inside the `/snapshots/load` handler
- `app.ts:666-667` — re-defined *again*, identically, inside the
  `/export-html` handler — same file, same predicate, written twice

This is the clearest direct answer to "why is `app.ts` so large and
under-separated": it isn't only that REST and MCP duplicate each other —
individual REST handlers duplicate each other *within the same file* because
each one was written as a self-contained unit instead of calling a shared
helper.

**Files:** `server/app.ts:450-451`, `server/app.ts:666-667`,
`server/snapshot-reader.ts:29-41`

### 🟢 F7 — Systemic pattern: shape validation duplicated between zod (MCP) and hand-written type guards (REST)

Two more instances of the same underlying pattern as F1/F3, at lower risk
because the shapes involved are simple:

- `node_actions` (`wait_click`): `isNodeActionsValid()` type guard in
  `app.ts:39-44` vs `z.record(z.string(), z.array(z.string()))` in
  `mcp.ts:340-341`.
- `node_to_frame` (`commit_step_frames`): `isNodeToFrameValid()` type guard
  in `app.ts:46-49` vs `z.record(z.string(), z.number())` in
  `mcp.ts:483-486`.

Root cause: Hono doesn't have a schema library wired to REST request bodies
the way MCP tools require a zod `inputSchema`, so every REST handler ends up
hand-rolling its own version of a rule that MCP already expresses declaratively.

**Files:** `server/app.ts:39-49`, `server/mcp.ts:340-341`, `server/mcp.ts:483-486`

---

## 4. Root cause

The module layer (`render-core.ts`, `validate.ts`, `persist.ts`,
`interaction.ts`, `ws.ts`) is well-designed and several of its own comments
explicitly state an intent to be the single source of truth. The gap isn't
missing architecture — it's **inconsistent application over time**. Shared
extraction happened for the functionality present in the original design
(render, the step-frames builder). Every capability added afterward (step and
seek's viewport-restore behavior, slideshow, export, list-snapshots, delete)
was implemented first in one entry point and then re-implemented — not
factored out — in the other.

This is the same failure mode that already caused a real, documented bug:
`persist.ts:26-27` describes FR20/B15 — `slideshow()` originally had no
persistence entry registered anywhere and simply never wrote a snapshot,
because "just add it directly in the handler" was the default move instead of
routing through the shared persistence path.

## 5. Quantitative summary

- 21 REST endpoints, 14 MCP tools, 14 conceptual REST↔MCP pairs
- 5 of 14 pairs fully share business logic (F-free)
- 2 pairs diverge in observable behavior (F1, F3)
- 2 pairs duplicate identical logic verbatim without behavioral divergence
  yet (F2 step/seek — highest-risk of the "verbatim" group, since it's the
  one still missing from `render-core.ts`)
- 1 pair has an undocumented feature asymmetry (F4)
- 1 expression (snapshots-root resolution) independently reimplemented 9
  times across 4 files (F5)
- 1 validation predicate (Frame shape) independently reimplemented 3 times
  across 2 files, including twice within the same file (F6)
- 2 more input shapes validated twice via two different mechanisms (F7)
