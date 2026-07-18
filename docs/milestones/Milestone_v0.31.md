# Milestone v0.31 — Bootstrap House Style for HTML Content (Sprints 69–72)

**Status:** released

> Opened 2026-07-15 via `/doc-creator-driver:intake` (feature request, FR25 in `01`). Raw request: give an agent a small, meaningful, deterministic style set for `type: "html"` payloads instead of hand-authoring CSS per snapshot — prompted by a real export (`study-coach_algorithms-20260713-201859.html`) showing a bespoke mini design system (callouts, badges, legends, a calendar-heatmap grid) reinvented from scratch. Full design resolved via `/grill-me`: Bootstrap 5, CSS-only, scoped via the same `@scope`/`scopeEmbeddedStyles()` mechanism B20 shipped in v0.30, lazy-loaded live and conditionally included on export — see F20 in `03`, L7 in `02`, and the dependency/`Html.svelte` notes in `04`.

### Sprint 69 — `bootstrap` dependency + generalized `@scope`-wrap helper
- [x] Add `bootstrap` as an npm dependency (CSS-only usage — no JS import anywhere).
- [x] Generalize the existing `scopeEmbeddedStyles()` (or extract a shared helper it can call) so it can wrap an arbitrary CSS string — not just a payload's own extracted `<style>` content — in `@scope (<selector-list>) { ... }`. The export path needs one shared Bootstrap ruleset scoped to *every* `html`-type item/frame anchor in a single export in one pass (`@scope` accepts a comma-separated scope-root list), not a fresh copy per item.
- [x] Unit tests: helper produces valid `@scope` output for both a single anchor and a multi-anchor list; existing `scopeEmbeddedStyles()` behavior (B20 regression coverage) unchanged.

> **Implementation note:** keep this a pure string-transform helper with no knowledge of *why* it's being called — export's per-payload `<style>` scoping and the new Bootstrap-stylesheet scoping are two callers of the same primitive, not two mechanisms.

### Sprint 70 — Export-side integration (`server/export-html.ts`)
- [x] Read `bootstrap/dist/css/bootstrap.min.css` at export-assembly time (same "read from `node_modules` at call time" pattern as the `mermaid.js` embedding, L1/L6 in `02`).
- [x] In `assembleHtml()`, when the export contains ≥1 `html`-type item (expanded through step-frames, same detection already used for the KaTeX-CSS conditional), append the Bootstrap stylesheet to the `<style>` block wrapped via Sprint 69's helper, scoped to the full set of `html`-type item/frame anchor ids in this export.
- [x] Confirm scoping holds: a payload's own `alert alert-info` class renders Bootstrap's alert styling; the export's own `<nav>`/`<h1>`/`<h2>`/`<h3>` chrome is visually unaffected; a non-`html` item (e.g. a lone Mermaid export) produces no Bootstrap CSS in the output at all.
- [x] Unit tests in `tests/unit/server/export-html.test.ts`: Bootstrap CSS present iff ≥1 html item; scoped correctly for a multi-item, multi-workspace export; absent for an all-Mermaid export.

### Sprint 71 — Live-view integration (`client/src/renderers/Html.svelte`)
- [x] Lazy-load Bootstrap's CSS-only bundle only when `type === "html"` actually mounts (never for `type === "svg"`, matching the `registry.ts` precedent and its documented bundle-size-regression history for Mermaid/KaTeX/Vega-Embed).
- [x] Scope the injected stylesheet to the component's own container (`.html-renderer`) via `@scope`, using a client-side `scopeCss` helper duplicated from server's (no shared client/server module in this codebase — user decision) — `client/src/lib/scopeCss.ts`.
- [x] Manual verification in the browser: an `html`-type `render()` call with Bootstrap classes (`card`, `alert`, `badge`) renders styled; an `svg`-type payload triggers no Bootstrap network/parse cost; the app's own UI (buttons, panels) is visually unchanged before and after an `html` payload is shown. **Found a real bug during this verification (not anticipated in the original plan):** `@scope` only matches elements within the scope root's own subtree — `:root` (the `<html>` element) is an ancestor of the scope root, never a descendant, so Bootstrap's `:root`-scoped CSS custom properties (its entire color system) silently never applied; only non-variable properties (e.g. padding) worked, with no error. Fixed in both this sprint and Sprint 70 (server export path, already merged) by rewriting `:root` → `:scope` in the Bootstrap CSS text before wrapping in `@scope` — `:scope` inside an `@scope` block refers to the scope root element itself, and custom properties set there inherit normally to every descendant. Re-verified visually (screenshot) after the fix: card/alert/badge/table all render with correct Bootstrap colors.
- [x] Unit test in `tests/unit/client/Html.test.ts`: Bootstrap stylesheet is injected/loaded for `type: "html"`, not for `type: "svg"`; plus a regression test confirming the `:root` → `:scope` rewrite. Matching regression test added to `tests/unit/server/export-html.test.ts` for the Sprint 70 export path.

### Sprint 72 — Agent-facing documentation (`server/mcp.ts`)
- [x] Rewrite the `render` tool's `"html"` description line: name Bootstrap 5 explicitly, give concrete class examples appropriate to static content (`alert alert-info`, `card`, `badge`, `table table-striped`), and state the CSS-only/no-JS caveat (dropdowns, modals, tooltips, popovers, collapses, carousels, offcanvas render static markup only, not interactive).
- [x] Confirm the `append_frame`/step-frames path (which validates against the same content types) needs no separate documentation change — it shares `type: "html"` semantics with `render()`. Confirmed: `append_frame`/`init_step_frames`/`slideshow` reference the same `type` enum generically, with no duplicated per-type prose to update.
- [x] Manual check: the updated description reads clearly as a tool-call preview (no truncation/formatting issues in Claude Code's tool list). Verified via a fresh MCP client connection to the live dev server.

---

## Definition of Done — v0.31
- `type: "html"` payloads can use Bootstrap 5 CSS-only component classes, in both the live canvas and HTML exports, with visually consistent results between the two.
- Bootstrap's bare-element rules never affect the export's own chrome or the live app's own UI — verified against both a payload with no custom styling and one shipping its own `<style>` tag (B20 regression).
- Exports with zero `html`-type items ship no Bootstrap CSS; the live app loads no Bootstrap CSS until an `html`-type payload is actually shown.
- The `render` MCP tool's `"html"` description documents Bootstrap 5, gives concrete examples, and states the CSS-only/no-JS-components caveat.
- `03` F20, `02` L7, and `04`'s dependency table / export pseudocode / `Html.svelte` tree note move from "planned" to resolved/shipped.
- Full unit + e2e suite green.
