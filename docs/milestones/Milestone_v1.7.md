# Milestone v1.7 — Unified Import/Export Button (Sprints 87–88)

**Status:** in progress

> New feature (FR32 in `01_input-ideas.md`, 2026-11-06). Design resolved via `/grill-me`; see `03` §9 and `04` §9.

### Sprint 87 — Icon & tooltip showcase (F43)

- [x] **F43 — Showcase page.** Create `mockup/import-export-button-options.html` (modeled on `mockup/history-icon-options.html`): 5–6 candidate icons in the real toolbar button styling (light + dark), 2–3 tooltip/`aria-label` variants per icon, and the open popover with its two entries.
  - *DoD:* page opens standalone in a browser; user reviews it and picks icon + tooltip + menu labels; the choice is recorded in `03` (F41/F43) and in this file before Sprint 88 starts.

> **Implementation note:** no app code changes in this sprint.
> **Choice recorded (2026-11-06):** icon B (opposing vertical arrows), tooltip/`aria-label` "Import / export" (B1), menu labels "Export…" / "Import…" (M1).

### Sprint 88 — Implement the unified button (F41, F42, NF56)

- [x] **F41 — Single button + popover.** Replace the Export and Import toolbar buttons in `App.svelte` with the new menu component using the chosen icon/tooltip; entries open the existing export modal and `ImportModal`; Delete and drag-and-drop untouched.
  - *DoD:* toolbar shows one button + Delete; each menu entry opens the same modal as before; drag-and-drop import still works.
- [x] **F42 — ARIA menu behaviour.** `aria-haspopup`/`aria-expanded`, `role="menuitem"`, arrow/Enter/Space/Esc handling, focus return, outside-click dismissal.
  - *DoD:* fully keyboard-operable; no focus trap left open after dismissal.
- [x] **NF56 — Unit tests** for the behaviours above.
  - *DoD:* new tests pass; existing tests that referenced the old Export/Import buttons updated.

---

## Definition of Done — v1.7
- All tasks above shipped with passing acceptance criteria from `03` §9.
- Full unit test suite green, `svelte-check`/`eslint`/`npm run build` clean.
- No server, API, MCP tool, or snapshot-format changes.
- Manual test pass: keyboard-only and mouse use of the menu, in light and dark theme; import via drag-and-drop still works.
