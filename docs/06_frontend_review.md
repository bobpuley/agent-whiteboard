# Review Report

## Executive Summary

The `./client` codebase is a small (24 source files, ~2,500 LOC), well-factored Svelte 4 + TypeScript
front end for the Agentic Teaching Whiteboard. It shows clear signs of iterative hardening: nearly
every source file has a matching Vitest unit test, stale-render races are guarded consistently
(token pattern in `Mermaid.svelte`, `Katex.svelte`, `VegaLite.svelte`), heavy visualization libraries
(mermaid, katex, vega-embed, bootstrap CSS) are lazy-loaded via dynamic `import()`, and state is
centralized in a small number of purpose-built Svelte stores rather than scattered component state.
Code comments consistently document *why* a given workaround exists (Svelte reactive-statement
ordering, viewBox pinning for headless-vs-real-browser SVG sizing, etc.), which is unusually good
provenance for a discovery-phase project.

The most consequential findings are an accessibility gap in the Mermaid node-action popup (no
keyboard-reachable dismiss path — effectively a keyboard trap) and a security inconsistency where
Mermaid's rendered SVG is injected via `innerHTML` without the same DOMPurify pass that
`Html.svelte` applies to `svg`/`html` content, relying solely on mermaid's internal
`securityLevel: "strict"`. Neither is currently known to be exploited, but both diverge from
patterns the rest of the codebase already follows correctly, which is what makes them worth fixing
before this becomes a wider-audience-facing tool.

**Overall Quality Score: 7.5 / 10**

### Category Scores

| Category                        | Score /10 | Notes                                                                     |
|---------------------------------|-----------|---------------------------------------------------------------------------|
| 1. Type Safety                  | 7         | Strict TS on; a few unchecked `res.json()` casts and non-null assertions  |
| 2. Component Architecture       | 7         | Good extraction discipline; `DeleteExportModal.svelte` is oversized       |
| 3. Svelte Best Practices        | 8         | Reactive statements are minimal and well-guarded                          |
| 4. State Management             | 8         | Clean single-reducer canvas store; stores stay minimal                    |
| 5. Rendering Performance        | 8         | Keyed `{#each}`, stale-render token guards throughout                     |
| 6. Bundle & Build Optimization  | 8         | Heavy libs correctly lazy-loaded                                          |
| 7. Accessibility                | 6         | Solid dialog/focus-trap foundation, but popup keyboard gap                |
| 8. Security                     | 7         | DOMPurify used consistently except in Mermaid's SVG path                  |
| 9. Visualization & Rich Content | 8         | Disposal/cleanup and async races handled correctly                        |
| 10. Async Data Handling         | 7         | No WS auto-reconnect; otherwise solid                                     |
| 11. Forms & Validation          | 8         | Simple, effective double-click-to-confirm pattern                         |
| 12. Error Handling              | 8         | Consistent, commented try/catch; no silent swallowing                     |
| 13. Testing                     | 8         | Excellent breadth; a few utility modules untested                         |
| 14. Maintainability             | 7         | Strong comments; a couple of oversized files                              |
| 15. Styling & CSS               | 7         | Theme tokens used well in chrome; renderer sub-components hardcode colors |
| 16. Dependency Hygiene          | 8         | No obvious bloat; lazy-loading matches stack guidance                     |
| 17. Vite Configuration          | 8         | Small, correct proxy setup incl. WS proxy                                 |

---

## Mermaid node-action popup has no keyboard-reachable dismiss path

### Description
`NodeActionPopup.svelte` opens a floating menu of actions when a clickable Mermaid node is
selected. The only way to close it is to click the transparent backdrop with a mouse, or to press
Enter on one of the listed actions (which *selects* that action rather than canceling). There is no
`Escape` handler anywhere in the component, and the backdrop `<div>` has no `tabindex`/keydown
handler, so a keyboard-only user who opens this popup cannot back out of it without triggering one
of the listed actions.

### Evidence
`client/src/renderers/mermaid/NodeActionPopup.svelte:10-30`:
```svelte
{#if popup}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="popup-backdrop" on:click={() => dispatch("dismiss")}></div>
  ...
  {#each popup.actions as action, i (i)}
    <div
      class="popup-item"
      role="button"
      tabindex="0"
      on:click={() => dispatch("select", action)}
      on:keydown={(e) => e.key === "Enter" && dispatch("select", action)}
    >
      {action}
    </div>
  {/each}
```
No `keydown` listener for `Escape` exists in this file, in `Mermaid.svelte`, or in
`nodeInteractions.ts`. The lint suppressions (`a11y-click-events-have-key-events`,
`a11y-no-static-element-interactions`) were added instead of providing the keyboard equivalent they
warn about. Additionally, `popup-item` only handles `Enter`, not `Space` — native `<button>`
elements support both, so this custom `role="button"` implementation is a strictly worse keyboard
experience even for users who do reach the menu.

### Impact
A keyboard-only user (or anyone using switch/voice-control software that emulates keyboard
navigation) who triggers a node-action popup has no way to cancel it short of tabbing to an action
and activating it — effectively a keyboard trap on a `role="dialog"`-adjacent overlay. This is
explicitly called out as a HIGH-severity accessibility pattern ("keyboard traps") because it blocks
a whole category of users from safely dismissing the UI.

### Affected Files
- client/src/renderers/mermaid/NodeActionPopup.svelte
- client/src/renderers/mermaid/nodeInteractions.ts

### Recommended Fix
1. Add a `keydown` handler on the popup container (or reuse the existing `trapFocus` action from
   `client/src/lib/trapFocus.ts`, which already implements `Escape`-to-close plus Tab-cycling) that
   dispatches `dismiss` on `Escape`.
2. Give the backdrop a keyboard-operable equivalent, or simply rely on the `Escape` handler and make
   the backdrop `aria-hidden` (it's decorative once the popup has a proper dismiss path).
3. Extend `popup-item`'s `keydown` handler to also activate on `" "` (Space), matching native button
   semantics — or replace the `div[role="button"]` with an actual `<button>` element, which gets
   both key bindings and focus styling for free and removes the need for the two `svelte-ignore`
   suppressions.

### Urgency Level
HIGH

---

## Mermaid's rendered SVG bypasses the app's DOMPurify sanitization pass

### Description
`Html.svelte` explicitly sanitizes all `svg`/`html` payloads with DOMPurify before assigning
`innerHTML`. `Mermaid.svelte` renders diagram source through `mermaid.render()` and assigns the
resulting SVG string directly to `container.innerHTML` with no DOMPurify pass, relying entirely on
mermaid's own `securityLevel: "strict"` initialization option to have sanitized the output.

### Evidence
`client/src/renderers/Html.svelte:57-63`:
```ts
const clean = DOMPurify.sanitize(src, {
  USE_PROFILES: type === "svg" ? { svg: true, svgFilters: true } : { html: true },
});
container.innerHTML = clean;
```
`client/src/renderers/Mermaid.svelte:112-149`:
```ts
mermaidPromise = import("mermaid").then((mod) => {
  const instance = mod.default;
  instance.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
  return instance;
});
...
const { svg } = await mermaid.render(id, src);
...
if (container) container.innerHTML = svg;
```
No `DOMPurify.sanitize(svg, ...)` call exists in this file. This is a direct-injection code path
identical in shape to the one `Html.svelte` treats as untrusted, but with the sanitization step
omitted.

### Impact
The whiteboard's entire premise is rendering content driven by an AI teacher agent — i.e., content
whose provenance is not fully controlled by the end user viewing it. Mermaid diagram source is
attacker-influenceable text (labels, click bindings, HTML-in-label constructs) in the same way
arbitrary HTML/SVG payloads are, and mermaid's `strict` mode has had past bypass issues in specific
diagram constructs across versions. Today this is defense-in-depth-by-omission rather than a
demonstrated bypass, but it is an inconsistency the codebase itself already knows to avoid (per the
`Html.svelte` comment thread) and should be closed before the tool is used with less-trusted agent
output.

### Affected Files
- client/src/renderers/Mermaid.svelte

### Recommended Fix
Run the mermaid-produced `svg` string through the same `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })`
call used in `Html.svelte` before assigning it to `container.innerHTML`, immediately after
`mermaid.render()` resolves and before the `token !== renderToken` staleness check that follows.
This keeps mermaid's own sanitization as a first layer and DOMPurify as a second, consistent with
how `svg`/`html` payloads are already treated.

### Urgency Level
MEDIUM

---

## Unchecked `any`-typed JSON response in `snapshotActions.ts`

### Description
`fetchSnapshots.ts` types its `res.json()` result and validates its shape before use. The sibling
module `snapshotActions.ts`, which does the equivalent work for delete/export requests, does not —
`res.json()` is left as implicit `any`, and `data.ok` / `data.error` are accessed with no runtime or
compile-time shape guarantee.

### Evidence
`client/src/lib/fetchSnapshots.ts:13-14` (the good pattern):
```ts
const res = await fetch("/snapshots/all");
const data = (await res.json()) as { ok: boolean; workspaces?: WorkspaceGroup[]; error?: string };
```
`client/src/lib/snapshotActions.ts:6-24` (the gap, repeated three times in the file):
```ts
export async function deleteWorkspace(workspace: string): Promise<void> {
  const res = await fetch("/snapshots/delete-workspace", { ... });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? "Delete failed");
}
```
`data` here is `any`; `data.ok` and `data.error` compile without any type checking, so a server
response shape change (e.g., renaming `error` to `message`) would silently produce
`"Delete failed"` everywhere instead of surfacing at compile time.

### Impact
Low runtime risk today (the server contract is simple and colocated in the same repo), but it's an
easy source of a silent regression if the server's error envelope shape changes, and it's
inconsistent with the safer pattern the codebase already established one file over.

### Affected Files
- client/src/lib/snapshotActions.ts

### Recommended Fix
Introduce a small shared type (e.g. `interface ApiResult { ok: boolean; error?: string }`) in
`snapshotTypes.ts` and cast/validate each `res.json()` call against it, matching
`fetchSnapshots.ts`'s existing convention. If external validation weight is wanted later, this is
also the natural seam for a lightweight Zod/Valibot schema per the stack's own review guidance.

### Urgency Level
MEDIUM

---

## Non-null assertions in `registry.ts` make renderer prop wiring fragile

### Description
Every `props()` function in the renderer registry dereferences `presentation!` with a non-null
assertion. `App.svelte` already had to add a same-tick guard (`currentComponentType === rendererKey`)
specifically to stop this from crashing when a stale cached component type outlives a `clear()`/
disconnect — the guard is described in `App.svelte`'s own comment as a fix for exactly this crash.
The underlying fragility remains: any future call site of `rendererRegistry[key].props()` that
doesn't replicate that guard will reintroduce the crash.

### Evidence
`client/src/renderers/registry.ts:44-79`:
```ts
function htmlProps(type: "svg" | "html") {
  return ({ presentation }: RendererContext) => ({
    source: presentation!.frames[0].payload,
    type,
  });
}
...
props: ({ presentation, clickable, nodeActions, nodeToFrameEnabled, nodeToFrame, viewport, currentFrame }) => ({
  source: presentation!.frames[0].payload,
  ...
```
`client/src/App.svelte:51-60` (the mitigating guard, added after the fact):
```ts
// ... a stale-but-still-cached currentComponentType (e.g. "mermaid" from
// before a clear()/WS-disconnect reset presentation to null) recomputes
// props eagerly against content that's no longer there, crashing on
// registry.ts's non-null assertions before the template ever gets a chance
// to fall back to the "Waiting for content…" branch.
$: rendererProps = currentComponentType && currentComponentType === rendererKey
  ? rendererRegistry[currentComponentType].props({ ... })
  : {};
```

### Impact
The crash is currently prevented, but only by a guard that lives in the *caller*, not in the
registry itself — the type system offers no protection if that guard is refactored away or a new
caller is added (e.g. a future test harness or a second render surface). `RendererContext.presentation`
is typed as possibly-null specifically because it can be null; the `!` assertions silence the
compiler rather than encoding the actual invariant.

### Affected Files
- client/src/renderers/registry.ts
- client/src/App.svelte

### Recommended Fix
Narrow `presentation` before calling into `htmlProps`/the mermaid/katex/vega-lite `props()`
functions — e.g. have `RendererEntry.props` accept a context type where `presentation` is
non-nullable, and have the one call site in `App.svelte` perform the null check when constructing
that narrowed context, rather than asserting away nullability inside the registry. This makes the
existing guard load-bearing in the type system instead of only in application logic.

### Urgency Level
MEDIUM

---

## `scopeCss.ts` is hand-duplicated between client and server with no sync check

### Description
The client's `scopeCss()` (used to scope injected Bootstrap CSS in `Html.svelte`) is a byte-for-byte
duplicate of a function in `server/export-html.ts`, kept in sync manually because "client and server
are separate builds with no shared-module convention in this codebase" (per the file's own header
comment). There is no test or build check asserting the two stay identical.

### Evidence
`client/src/lib/scopeCss.ts:1-8`:
```ts
// Client-side counterpart of server/export-html.ts's scopeCss() (v0.31
// Sprint 69/71) — duplicated rather than shared, since client and server are
// separate builds with no shared-module convention in this codebase. Keep
// the two in sync by hand if either changes.
export function scopeCss(css: string, anchorIds: string[]): string {
  const selectorList = anchorIds.map((id) => `#${id}`).join(", ");
  return `@scope (${selectorList}) {\n${css}\n}`;
}
```

### Impact
If either copy is edited without the other, client-rendered HTML and server-exported HTML will
silently diverge in how Bootstrap/theme CSS is scoped — a correctness bug that would likely only
surface visually (wrong or missing styling in exported vs. live-rendered content) and would be easy
to miss in review since the two files are far apart in the tree.

### Affected Files
- client/src/lib/scopeCss.ts
- server/export-html.ts

### Recommended Fix
Short term: add a small cross-checking unit test (in either test suite) that imports both
implementations and asserts identical output for a shared set of fixtures, so drift fails CI instead
of failing silently. Longer term, since this is a Vite + tsx/Node project already on ESM, a tiny
shared package or `shared/` source directory importable by both builds would remove the duplication
requirement entirely.

### Urgency Level
MEDIUM

---

## `DeleteExportModal.svelte` exceeds the codebase's own component-size threshold

### Description
`DeleteExportModal.svelte` is 608 lines, combining: two operating modes (delete/export), a two-step
wizard (workspace picker → item selector), a double-click confirm-arm/disarm timer, a "done" toast
timer, and all associated markup/CSS. This is comfortably past the ">500 lines" threshold this very
review's own maintainability criteria flags, and it is the largest file in `client/src` by a wide
margin (next largest, `App.svelte`, is 390 lines including a large inline SVG icon set).

### Evidence
`client/src/DeleteExportModal.svelte` — 608 lines total; the `<script>` block alone (lines 1-180)
manages: `step`, `selectedWorkspace`, `selectedFilenames`, `confirmingWhole`, `confirmingSubset`,
`busy`, `errorMessage`, `doneMessage`, `confirmTimer`, `doneTimer`, plus the reset/pick/goBack/close/
toggle/arm/show/run×2/handle×2 functions that operate on them.

### Impact
Not a bug today — the component is well-commented and its tests (`DeleteExportModal.test.ts`, 89
lines) pass — but its size and the number of interacting pieces of local state (9 `let` bindings)
make it the most expensive file in the client to safely modify, and the most likely place a future
change introduces a state-interaction bug (e.g., a timer not cleared on an unexpected transition).

### Affected Files
- client/src/DeleteExportModal.svelte

### Recommended Fix
Split along the existing step boundary: extract the step-1 workspace-picker list and the step-2
whole-workspace-action/snapshot-checklist/footer into two child components (e.g.
`WorkspacePickerStep.svelte`, `SnapshotSelectionStep.svelte`), each taking the relevant slice of
state as props/events. The confirm-arm-timer logic (`armConfirm`, `confirmTimer`) is generic enough
to extract into a small reusable action or hook shared with any future "confirm to delete" UI,
similar to how `trapFocus.ts` and `snapshotActions.ts` were already extracted from this same file's
earlier, even larger version.

### Urgency Level
MEDIUM

---

## No automatic WebSocket reconnection after disconnect

### Description
`ws.ts`'s `connectWebSocket()` opens exactly one `WebSocket` and never retries. On `close`, it
dispatches a `clear` render command and a `ws:disconnected` DOM event (which flips the
"Server disconnected" banner in `App.svelte`), but nothing ever attempts to reconnect — recovery
requires the user to manually reload the page.

### Evidence
`client/src/ws.ts:65-96`:
```ts
export function connectWebSocket(onCommand: CommandHandler): () => void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${location.host}/stream`);
  ...
  ws.addEventListener("close", () => {
    onCommand({ action: "clear" });
    window.dispatchEvent(new CustomEvent("ws:disconnected"));
  });
  ws.addEventListener("open", () => {
    window.dispatchEvent(new CustomEvent("ws:connected"));
  });
  return () => ws.close();
}
```
`App.svelte`'s banner text confirms this is the intended (current) behavior: *"Server disconnected.
Restart `npm run dev`."* — i.e., the UI itself tells the user there is no automatic recovery.

### Impact
Any transient disconnect (dev server restart via `tsx watch`, brief network blip, laptop sleep/wake)
permanently drops the live canvas until a manual page reload, even after the server comes back. For
a tool meant to run during a live teaching session, this converts a momentary hiccup into a
full-session interruption.

### Affected Files
- client/src/ws.ts
- client/src/App.svelte (banner copy assumes manual restart is the only recovery path)

### Recommended Fix
Add bounded exponential-backoff reconnect logic inside `connectWebSocket()` (or a thin wrapper
around it): on `close`, schedule a reconnect attempt; on successful reopen, re-dispatch
`ws:connected` and let the server's next `replace`/`clear` command repopulate state naturally (no
client-side state replay needed, since the server already treats the client as stateless on
reconnect per the existing `clear`-on-close behavior). Keep the manual-reload banner as a fallback
after N failed attempts.

### Urgency Level
MEDIUM

---

## Accessibility-critical `trapFocus` action has no dedicated unit test

### Description
`trapFocus.ts` implements the focus-trap/Escape-handling behavior every modal in the app
(`DeleteExportModal`, `HistoryPanel`) depends on for keyboard accessibility. Unlike almost every
other file in `client/src`, it has no dedicated test file. `fetchSnapshots.ts`, `download.ts`, and
`scopeCss.ts` are similarly untested in isolation (only indirectly exercised via consumers like
`modalStore.test.ts`).

### Evidence
Full `tests/unit/client/**` listing shows tests for every store, every renderer, `SnapshotRow`,
`formatTimestamp`, and `snapshotActions`, but no `trapFocus.test.ts`, `fetchSnapshots.test.ts`,
`download.test.ts`, or `scopeCss.test.ts`. A repo-wide search confirms `trapFocus`, `scopeCss`, and
`download` are referenced only from their production call sites, never from a test file directly.

### Impact
`trapFocus` is exactly the kind of logic (Tab/Shift+Tab cycling, Escape dispatch, focus restoration
on destroy) that regresses silently — a subtle bug (e.g., wrong `first`/`last` element after a DOM
update) would likely only be caught by manual keyboard testing, not by the otherwise-thorough
automated suite.

### Affected Files
- client/src/lib/trapFocus.ts
- client/src/lib/fetchSnapshots.ts
- client/src/lib/download.ts
- client/src/lib/scopeCss.ts

### Recommended Fix
Add a focused unit test for `trapFocus.ts` covering: initial focus placement, Tab wrap at the last
focusable element, Shift+Tab wrap at the first, `Escape` invoking `onEscape`, and focus restoration
to the pre-open `document.activeElement` on `destroy()`. `fetchSnapshots.ts` and `scopeCss.ts` are
lower-risk but cheap to cover given their small surface area; prioritize `trapFocus` first.

### Urgency Level
MEDIUM

---

## Renderer sub-components hardcode colors instead of using theme tokens

### Description
`theme.css` defines a full `--board-*` custom-property palette (including dark-mode overrides) that
`App.svelte`, `DeleteExportModal.svelte`, and `HistoryPanel.svelte` consistently use. The renderer
error/UI states in `Mermaid.svelte`, `Katex.svelte`, `VegaLite.svelte`, and
`NodeActionPopup.svelte` instead hardcode raw hex colors, so they don't respond to the dark-mode
toggle the rest of the app supports.

### Evidence
`client/src/renderers/Mermaid.svelte:267-292` (also present near-identically in `Katex.svelte` and
`VegaLite.svelte`):
```css
.render-error {
  color: #c0392b;
  background: #fdf2f2;
  border: 1px solid #e74c3c;
  ...
}
.zoom-hint {
  color: #666;
  ...
}
```
`client/src/renderers/mermaid/NodeActionPopup.svelte:42-65`:
```css
.node-action-popup {
  background: #fff;
  border: 1px solid #d0d0d0;
  ...
}
.popup-item {
  color: #222;
  ...
}
```
Compare with `--board-danger: #e74c3c`, `--board-danger-bg: #fdf0f0`, `--board-text: #333333` /
`#e6e6e6` (dark) already defined in `client/src/theme.css` and used by every other chrome component.

### Impact
Low severity — these elements sit over the (intentionally light) canvas background even in dark
mode, so they're not unreadable — but it's a maintenance trap: the next person touching dark-mode
support has to know to special-case four more files that look like they should already be covered by
the token system, and any future canvas background color change could suddenly make these hardcoded
error/popup colors clash.

### Affected Files
- client/src/renderers/Mermaid.svelte
- client/src/renderers/Katex.svelte
- client/src/renderers/VegaLite.svelte
- client/src/renderers/mermaid/NodeActionPopup.svelte

### Recommended Fix
Replace the hardcoded hex values in these four files with the equivalent `--board-*` custom
properties (`--board-danger`, `--board-danger-bg`, `--board-text`, `--board-bg`,
`--board-border-mid`, etc.), consistent with the rest of the app. If these elements are meant to
stay canvas-toned regardless of theme (per the `--board-canvas-bg` comment about rendered content
assuming a light backdrop), document that decision inline the same way `theme.css` already does for
`--board-canvas-bg`.

### Urgency Level
LOW

---

## Duplicated inline SVG icon markup in `App.svelte`

### Description
`App.svelte`'s controls panel defines five icon buttons (theme sun/moon, history, delete, export,
done), each with a full inline `<svg>` block with repeated `stroke-width`/`stroke-linecap`/
`stroke-linejoin`/`aria-hidden` attributes. There is no shared `Icon.svelte` component or icon set.

### Evidence
`client/src/App.svelte:140-183` — five separate `<svg width="15" height="15" viewBox="0 0 24 24"
fill="none" stroke="currentColor" stroke-width="2.2" ...>` blocks (six counting the two theme-toggle
states), each hand-written rather than parameterized.

### Impact
Purely a maintainability/consistency concern — any global icon style change (size, stroke width)
requires editing five-plus near-identical blocks by hand, and it's the main reason `App.svelte`'s
markup section reads as denser than its actual logic complexity.

### Affected Files
- client/src/App.svelte

### Recommended Fix
Extract a small `Icon.svelte` (or a `icons.ts` module of path-data constants consumed by one
generic `<Icon name={...} />` component) taking `name`/`size` props, and replace the five inline
blocks with it.

### Urgency Level
LOW

---

## Minor: Mermaid diagram ID derived from `Date.now()`

### Description
`Mermaid.svelte` generates the id mermaid needs for its `render(id, src)` call as
`` `mermaid-${Date.now()}` ``. Two renders triggered within the same millisecond (e.g. two rapid
`afterUpdate` cycles) would produce a colliding id.

### Evidence
`client/src/renderers/Mermaid.svelte:146`:
```ts
const id = `mermaid-${Date.now()}`;
```

### Impact
Very low likelihood given the async gap before this line (mermaid module load + render call), and
even a collision would likely just cause mermaid to reuse/skip an internal DOM id rather than crash
— but it's a one-line fix for a class of bug that's annoying to reproduce and debug if it ever does
fire.

### Affected Files
- client/src/renderers/Mermaid.svelte

### Recommended Fix
Combine with the existing `renderToken` counter (already unique per render) instead of `Date.now()`,
e.g. `` `mermaid-${token}` ``, guaranteeing uniqueness without a new dependency.

### Urgency Level
LOW

---

## Strengths worth preserving

- **Test coverage breadth**: nearly every store, renderer, and lib module in `client/src` has a
  corresponding file under `tests/unit/client/`, including the trickier extracted modules
  (`panZoom.ts`, `nodeInteractions.ts`, `NodeActionPopup.svelte`). This is well above what's typical
  for a discovery-phase project and should be maintained as new files are added.
- **Stale-render race guards**: `Mermaid.svelte`, `Katex.svelte`, and `VegaLite.svelte` all use the
  same `renderToken` increment-and-compare pattern to discard results from a superseded async
  render, with `VegaLite.svelte` additionally calling `result.view.finalize()` on a discarded view to
  avoid leaking Vega's internal resources.
- **Lazy-loading discipline**: mermaid, katex, vega-embed, and bootstrap's CSS are all loaded via
  `import()` only on first actual use, matching the stack's own guidance (NF13) and keeping the
  initial bundle small.
- **State centralization**: `canvasStore.ts`'s single `reduce()` function mirrors the server's
  session model and is the one place `RenderCommand` handling logic lives — no duplicated
  interpretation of the wire protocol across components.
- **Consistent theming in chrome**: `App.svelte`, `DeleteExportModal.svelte`, and
  `HistoryPanel.svelte` uniformly reference `--board-*` tokens rather than hardcoded colors, making
  the dark-mode toggle (`themeStore.ts`) work cleanly across the app's own UI.

---

## Findings Summary

| # | Title | Category | Urgency |
|---|---|---|---|
| 1 | Mermaid node-action popup has no keyboard-reachable dismiss path | Accessibility | HIGH |
| 2 | Mermaid's rendered SVG bypasses the app's DOMPurify sanitization pass | Security | MEDIUM |
| 3 | Unchecked `any`-typed JSON response in `snapshotActions.ts` | Type Safety | MEDIUM |
| 4 | Non-null assertions in `registry.ts` make renderer prop wiring fragile | Type Safety | MEDIUM |
| 5 | `scopeCss.ts` is hand-duplicated between client and server, no sync check | Maintainability | MEDIUM |
| 6 | `DeleteExportModal.svelte` exceeds the >500-line component-size threshold | Component Architecture | MEDIUM |
| 7 | No automatic WebSocket reconnection after disconnect | Async Data Handling | MEDIUM |
| 8 | `trapFocus` (and a few small utils) have no dedicated unit test | Testing | MEDIUM |
| 9 | Renderer sub-components hardcode colors instead of theme tokens | Styling & CSS | LOW |
| 10 | Duplicated inline SVG icon markup in `App.svelte` | Maintainability | LOW |
| 11 | Mermaid diagram ID derived from `Date.now()` | Rendering Performance | LOW |

**Totals: 1 HIGH, 7 MEDIUM, 3 LOW**

---

## Quick Wins (low effort, immediate value)

- Add `Escape`/Space handling to `NodeActionPopup.svelte` (finding #1) — small, self-contained change.
- Swap `Date.now()` for the existing `renderToken` in `Mermaid.svelte` (finding #11) — one line.
- Add the missing DOMPurify pass to `Mermaid.svelte`'s `innerHTML` assignment (finding #2) — one
  function call, mirrors existing `Html.svelte` code exactly.
- Type `snapshotActions.ts`'s `res.json()` calls (finding #3) — copy the pattern already in
  `fetchSnapshots.ts`.

## Longer-Term Architectural Recommendations

- Establish a shared source location (or tiny internal package) for logic that must stay identical
  across client and server builds, starting with `scopeCss()`, to remove the "keep in sync by hand"
  risk documented in the code itself.
- Split `DeleteExportModal.svelte` along its existing step boundary before it grows further; the
  confirm-arm-timer pattern is also a good candidate for a reusable action shared with any future
  destructive-action UI.
- Add bounded-retry WebSocket reconnection so transient server restarts don't require a manual page
  reload during a live session — this is the one true user-facing resilience gap found in this
  review.

## Risk Assessment / Release Readiness

No HIGH-severity findings block a discovery-phase / internal-use release; the one HIGH finding
(popup keyboard trap) is a real accessibility defect but narrow in scope (only reachable via
clickable-node mode) and should be fixed before any release that claims accessibility support or is
used by anyone relying on keyboard/switch navigation. The MEDIUM findings are collectively about
robustness and maintainability rather than active defects — none of them represent a currently
demonstrable crash, data-loss, or security bypass. Given the strength of the existing test suite and
the discipline already shown in prior sprints' bug-fix comments (B8, B11, B12, B19, NF29-32, etc.),
this codebase is in good shape to keep iterating on; the recommended fix for finding #1 should be
prioritized first, followed by the security/type-safety MEDIUM items in the same pass since they are
all small, targeted diffs.

## Technical Debt Summary

The debt in this codebase is concentrated, not diffuse: one oversized component
(`DeleteExportModal.svelte`), one duplicated-by-hand utility (`scopeCss.ts`), one missing resilience
feature (WS reconnect), and a handful of small type-safety/consistency gaps. There is no evidence of
architectural drift, dead code, or unmanaged dependency bloat — the codebase's comment trail shows
each of these trade-offs was made deliberately (e.g., the registry's dynamic-import decision,
`scopeCss`'s duplication rationale), which makes them cheap to address now before more code
accumulates around the current shape.
