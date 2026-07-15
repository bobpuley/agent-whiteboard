# Milestone v0.30 — Export HTML Layout & Navigation Fixes (Sprints 66–68)

**Status:** in progress

> Opened 2026-07-15 via `/doc-creator-driver:intake` (bug report). User tested a real export file (`study-coach_algorithms-20260713-201859.html`) on a wide desktop viewport and found three layout defects plus one navigation gap in `server/export-html.ts`'s assembled document (F17 in `03`, see B20–B22 in `01`, `5d` in `03`). All four fixes are scoped to `export-html.ts`'s `LAYOUT_CSS` constant and `assembleHtml()` — no other module touched, no architecture change (see `04`'s HTML Export data flow, updated in place).

### Sprint 66 — Widen `<main>` and contain overflow (B20)
- [x] **B20.** Fix `LAYOUT_CSS` so `<main>` makes effective use of available viewport width on wide screens instead of rendering as a narrow fixed-feeling column, and so no contained element (table, `<pre>`/code block) ever visually exceeds its enclosing `.item-section`/`.frame-section` border — wrapping or scrolling internally instead (e.g. `overflow-x: auto` on table/code containers).
  - *Root cause (found via Playwright repro, headless Chromium):* `<main>` was already correctly filling available width (`flex: 1`) — the "narrow" appearance was a symptom, not the bug. An oversized table/`<pre>` with no `overflow-x` containment overflowed `.item-section`'s border and propagated scrollable overflow all the way up to `<body>`, expanding the whole page's scroll width beyond the viewport; the visible `<main>` then looked cramped relative to that ballooned page. Confirmed: before the fix, `document.documentElement.scrollWidth` exceeded the viewport width; after adding `overflow-x: auto` to `.item-section`/`.frame-section` (plus `max-width: 100%` on `table`/`pre`/`code`), `scrollWidth` matches the viewport exactly and the oversized content scrolls within its own section instead.
  - *Acceptance:* opening the export on a wide (≥1600px) viewport shows `<main>` filling the space alongside the fixed-width `<nav>`; a table or code block wider than its section scrolls horizontally within that section instead of bleeding past its border.
  - *Regression coverage:* new test in `tests/unit/server/export-html.test.ts` asserting the relevant CSS rules are present in assembled output; manual visual check against the reported file.

### Sprint 67 — Fix table border alignment (B21)
- [ ] **B21.** Fix the table CSS so borders render as a clean, uniformly aligned grid — every row's right edge flush with the table's outer border, no per-row drift (likely a `border-collapse`/`box-sizing` interaction in the current table styling).
  - *Acceptance:* tables in the exported HTML show no visible misalignment between row borders and the table's outer border, matching `./unaligned_right_border.png`'s reported defect resolved.
  - *Regression coverage:* manual visual check against the reported file (table-border alignment is not practically assertable via DOM/CSS unit tests).

### Sprint 68 — Per-frame nav submenu for step-frames items (B22)
- [ ] **B22.** In `assembleHtml()`'s TOC-building loop, for a `stepFrames` item emit one submenu `<li><a>` per frame (frame's own label, falling back to `Frame N`) nested under that item's TOC `<li>`, with anchors matching the existing `${itemId}-frame-${i}` ids already used by `<main>`'s frame sub-sections. The item's own (parent) TOC link points at the frame-0 anchor (`${itemId}-frame-0`) instead of `${itemId}`, so it behaves identically to the first submenu entry.
  - *Acceptance:* exporting a step-frames snapshot shows one submenu entry per frame in the left nav; clicking the parent item entry and clicking the first submenu entry scroll to the same place; clicking any other submenu entry jumps to that frame's section.
  - *Regression coverage:* new test in `tests/unit/server/export-html.test.ts` asserting the TOC HTML contains one `<a href="#...">` per frame for a step-frames item, and that the parent link's `href` matches the frame-0 anchor.

---

## Definition of Done — v0.30
- `<main>` uses available viewport width on wide screens; no table/code block visually overflows its section border (B20).
- Table borders render as a uniformly aligned grid, no right-edge drift (B21).
- Step-frames items get one nav submenu entry per frame, titled with the frame's label; the parent entry points at frame 0 (B22).
- `03` §5d rows for B20–B22 updated from "Not yet implemented" to resolved; `04`'s nav data-flow gap annotation removed/resolved.
- Full unit + e2e suite green.
