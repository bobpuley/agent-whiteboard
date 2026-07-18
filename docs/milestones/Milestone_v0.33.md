# Milestone v0.33 — Dark Theme & Theme Selector (Sprint 74)

**Status:** in progress

### Sprint 74 — Board dark theme + toolbar toggle
- [ ] Define CSS custom properties for board-chrome colors (`--bg`, `--fg`, `--panel-bg`, `--border`, etc.) for `:root[data-theme="light"]` and `:root[data-theme="dark"]`.
- [ ] Sweep board-chrome components (`App.svelte`, `HistoryPanel.svelte`, `DeleteExportModal.svelte`, and any others with hardcoded hex colors) to reference the new CSS variables instead of literals.
- [ ] Add `client/src/stores/themeStore.ts`: a Svelte writable store that reads/writes theme choice to `localStorage` (default `"light"` when unset) and sets `data-theme` on `<html>` as a side effect.
- [ ] Add a theme toggle control to the existing board toolbar in `App.svelte`, bound to `themeStore`.
- [ ] Verify isolation: confirm rendered content (`Html.svelte`/`Mermaid.svelte` on canvas, and `export-html` output in both `cdn` and `offline` modes) is visually and byte-for-byte unaffected by the board theme in either Light or Dark.
- [ ] Add/update tests: theme toggle switches `data-theme` and persists across reload; fresh profile (no localStorage entry) defaults to Light; export-html output is identical regardless of board theme.

> **Implementation note:** rendered-content isolation relies on the existing `@scope (#html-renderer-root) { ... }` wrapping in `Html.svelte` (`client/src/lib/scopeCss.ts`) — new theme variable names must not collide with any Bootstrap/rendered-content custom property names.

---

## Definition of Done — v0.33
- Board chrome renders correctly in both Light and Dark themes, with no unstyled/hardcoded-color elements left behind.
- A toolbar toggle switches themes; the choice persists in `localStorage` and is restored on reload; a fresh profile defaults to Light.
- Canvas-rendered HTML/Mermaid content and `export-html` output (both modes) are unaffected by the board theme.
- All existing tests pass; new tests cover the toggle, persistence/default behavior, and rendered-content non-interference.
