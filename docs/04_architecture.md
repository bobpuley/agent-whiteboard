# 04 — Architecture (v0.33)

> **v0.32 complete** — full v0.32 architecture in
> [`docs/v0.32/04_architecture.md`](v0.32/04_architecture.md).

---

## 1. Dark Theme & Theme Selector (F24–F26 in `03`)

- **Mechanism:** a `data-theme="light"|"dark"` attribute on the root `<html>` element (set in `client/index.html`/`main.ts`), driving CSS custom properties (`--bg`, `--fg`, `--panel-bg`, `--border`, etc.) defined once for `:root[data-theme="light"]` and `:root[data-theme="dark"]`. Board-chrome components (`App.svelte`, `HistoryPanel.svelte`, `DeleteExportModal.svelte`, and others with hardcoded hex colors) are swept to reference these variables instead of literals.
- **State:** new `client/src/stores/themeStore.ts` — a Svelte writable store that reads/writes the theme choice to `localStorage`, defaulting to `"light"` when no entry exists. The store sets the `data-theme` attribute as a side effect of any change (subscribe once at app init).
- **Selector UI:** a toggle button added to the existing toolbar in `App.svelte`, bound to `themeStore`.
- **Isolation guarantee (F26):** rendered content (`client/src/renderers/Html.svelte`, `Mermaid.svelte`, and server-side `server/export-html.ts` output) must **not** inherit the new `:root` CSS variables. Since `Html.svelte` already wraps injected content with `@scope (#html-renderer-root) { ... }` (rewriting Bootstrap's own `:root` rules to `:scope` — see `client/src/lib/scopeCss.ts`), the new theme variables declared on `:root` are naturally excluded from that `@scope` block's own variable resolution *as long as `#html-renderer-root`'s content doesn't itself reference `var(--bg)` etc.* Since board-theme variable names are new and won't collide with Bootstrap's own custom properties, no leakage is expected — this should be confirmed with a visual check once implemented (see risk in `02`). No change needed to `scopeCss.ts`, `export-html.ts`, or CDN/offline export modes.
- No server-side (`server/`) or MCP/REST contract changes required — this is client-only.
