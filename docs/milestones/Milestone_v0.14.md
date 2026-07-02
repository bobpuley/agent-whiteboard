# Milestone v0.14 — Mermaid Export Fix (Sprint 27)

**Status:** released

> Objective: fix bug B4 — Mermaid diagrams in `POST /export-html` output (v0.13) render with invisible labels, an incorrect/too-tight viewBox, or throw outright, because `happy-dom` cannot supply the real text-layout/font-metrics APIs Mermaid's layout engine depends on. Replace server-side Mermaid pre-rendering with client-side rendering: embed the Mermaid source and the `mermaid.js` library inline in the exported HTML so it renders in a real browser when the file is opened.

---

## Context

Confirmed via `test-results/export-failures/` artifacts (7c-step-frames, 8-seek, click):
- `7c-step-frames.html` / `8-seek.html`: node/edge `<foreignObject>` labels have `width="0" height="0"` — text exists in the DOM but is invisible; the SVG's computed viewBox shrinks to the collapsed layout ("too zoomed in").
- `click.html`: same root cause, but this diagram's edge labels (`|HTTP|`, `|Query|`) plus a cylinder node shape hit a mermaid code path that throws (`"Could not find a suitable point for the given distance"`) instead of degrading silently.
- All three payloads render correctly in the live whiteboard (real browser) — confirming the payload/data is fine and the failure is specific to server-side rendering via `happy-dom`.

This was a flagged residual risk (see L1 in `02_assumptions-and-risks.md`), now invalidated/confirmed in practice.

**Decision (see AskUserQuestion during intake):** embed the full `mermaid.js` library inline in the exported HTML rather than referencing it from a CDN, preserving the existing "opens correctly offline" requirement (F17).

---

## Requirements Addressed

- **B4** (`01`) → F17 update (`03`) — Mermaid rendering strategy changed from server-side `happy-dom` pre-render to embedded client-side rendering
- **L1** (`02`) — assumption invalidated, corrected with the v0.14 decision

---

### Sprint 27 — Mermaid Export Fix

- [x] **T1 — `package.json`:** confirm `mermaid` package version available for bundling its browser-runnable source into the export output (reuse existing `^11.x` dependency; no new package needed unless bundling requires one, e.g. a way to read the pre-built UMD/browser bundle file).
- [x] **T2 — `server/export-html.ts`:** remove the `renderMermaid()` happy-dom code path (and `fixSvgViewBox()`, which was a workaround for its degenerate output). For `type: "mermaid"` (including step-frames frames with `frame_type: "mermaid"`), emit a container element (e.g. `<pre class="mermaid">…</pre>`) holding the raw Mermaid source (HTML-escaped) instead of a pre-rendered SVG.
- [x] **T3 — `server/export-html.ts`:** when assembling the final document, if ≥1 mermaid item is present, read the `mermaid.js` browser-bundle source (from the installed `mermaid` package's dist output) and embed it inline as a `<script>` block, followed by a small bootstrap script calling `mermaid.initialize({ startOnLoad: false })` and `mermaid.run()` against all `.mermaid` containers on `DOMContentLoaded`.
- [x] **T4 — `tests/unit/server/app.test.ts`:** update/add tests for `POST /export-html` mermaid cases — assert the output contains the raw mermaid source in a container and the embedded mermaid.js bootstrap script, not a pre-rendered SVG. Add regression cases for the three failing scenarios (step-frames with plain flowchart, seek demo, diagram with edge labels + cylinder node) — at minimum assert no `export-error` is emitted for mermaid items.
- [x] **T5 — Manual verification:** re-run the exports for `7c-step-frames`, `8-seek`, and `click` (or equivalent showcase scenarios) and open the resulting HTML in a real browser; confirm labels are visible, zoom/viewBox looks correct, and no inline error appears.

> **Implementation note (T3):** the exported HTML must remain fully self-contained — no `<script src="https://...">` CDN reference. Read the mermaid UMD/browser build from `node_modules/mermaid/dist/...` (or equivalent resolvable path) at export time and inline its full source.

---

## Definition of Done — v0.14

- `POST /export-html` no longer attempts server-side Mermaid rendering via `happy-dom`.
- Exported HTML embeds the Mermaid source and a self-contained `mermaid.js` bundle; diagrams render correctly (visible labels, correct viewBox) when the file is opened in a real browser, with no network access required.
- The three previously-failing scenarios (7c-step-frames, 8-seek, click) all render correctly when re-exported and opened.
- KaTeX, Vega-Lite, SVG, and HTML export paths are unaffected (still server-side via `happy-dom`).
- All existing tests pass; new/updated tests cover the fixed Mermaid export path.
