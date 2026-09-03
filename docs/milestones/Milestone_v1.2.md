# Milestone v1.2 — Design Debt: Client Hardening (Sprint 81)

**Status:** planned

> Opened 2026-09-03 via `/doc-creator-driver:intake` (bug report). Promotes 9 of the findings logged in the Design Debt Log (`01_input-ideas.md`, from `docs/06_frontend_review.md`, 2026-07-18) into scheduled work — see `02`/`03`/`04` §4 (v1.2 / F32–F33, NF38–NF44). Excludes the `DeleteExportModal.svelte` size finding, which stays logged but unscheduled (see `02`).

### Sprint 81 — Client hardening: reconnect, theming, sanitization, type-safety, tests, dedup (F32–F33, NF38–NF44)

- [x] **F32 — WebSocket auto-reconnect.** Add bounded exponential-backoff reconnect logic to `connectWebSocket()` in `client/src/ws.ts`. On successful reopen, re-dispatch `ws:connected`. Update `App.svelte`'s disconnect banner copy to reflect a retry-in-progress state, falling back to "restart `npm run dev`" only after the retry budget is exhausted.
  - *Acceptance:* restarting the dev server while the client is open causes automatic recovery with no manual reload.
- [x] **F33 — Theme tokens in renderer sub-components.** Replace hardcoded hex colors in `Mermaid.svelte`, `Katex.svelte`, `VegaLite.svelte` (error/hint styling) and `NodeActionPopup.svelte` with the existing `--board-*` custom properties from `theme.css`.
  - *Acceptance:* toggling dark mode while any of these UI states is visible shows themed, not hardcoded, colors.
- [x] **NF38 — Mermaid SVG DOMPurify pass.** In `Mermaid.svelte`, run `mermaid.render()`'s output through `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })` before assigning to `container.innerHTML`, immediately after the render resolves and before the `token !== renderToken` staleness check.
  - *Acceptance:* existing Mermaid renderer tests and showcase slides render unchanged.
- [x] **NF39 — Type `snapshotActions.ts`'s JSON responses.** Add a shared `ApiResult`-shaped interface and cast/validate all three `res.json()` calls in `client/src/lib/snapshotActions.ts` against it, matching `fetchSnapshots.ts`'s existing convention.
- [x] **NF40 — Remove non-null assertions from `registry.ts`.** Retype `RendererEntry.props` to accept a context where `presentation` is non-nullable; move the null check into `App.svelte`'s single call site when constructing that narrowed context.
- [ ] **NF41 — `scopeCss` parity test.** Add a unit test asserting `client/src/lib/scopeCss.ts` and `server/export-html.ts`'s `scopeCss()` produce identical output for a shared fixture set.
- [ ] **NF42 — Missing unit tests.** Add `trapFocus.test.ts` (initial focus placement, Tab/Shift+Tab wrap, `Escape` → `onEscape`, focus restoration on `destroy()`). Add basic tests for `download.ts` and the client's `scopeCss.ts`.
- [ ] **NF43 — Extract `Icon.svelte`.** Replace `App.svelte`'s five-plus inline `<svg>` icon blocks with a shared `Icon.svelte` (or `icons.ts` + generic `<Icon name={...} />>`) component.
  - *Acceptance:* rendered icons are visually unchanged.
- [ ] **NF44 — Fix Mermaid diagram id.** In `Mermaid.svelte`, derive the id passed to `mermaid.render(id, src)` from the existing `renderToken` counter instead of `Date.now()`.

> **Implementation note:** all 9 tasks are `client/src/**`-only; no server, MCP, or persistence-format changes. Independent of each other — implementable and testable in any order or in parallel.

---

## Definition of Done — v1.2
- All 9 tasks above shipped with passing acceptance criteria.
- Full unit test suite green, including new `scopeCss` parity test and `trapFocus`/`download`/client-`scopeCss` tests.
- `tsc --noEmit` / `svelte-check` / `eslint` clean, with no new `any`/non-null-assertion suppressions introduced.
- Manual verification: dev-server restart recovers the live canvas without a reload; dark mode shows themed colors on Mermaid/Katex/VegaLite error states and the node-action popup.
- `01`/`02`/`03`/`04` entries for these 9 findings updated from "logged, unscheduled" to resolved; Design Debt Log bullet(s) removed or marked done.
