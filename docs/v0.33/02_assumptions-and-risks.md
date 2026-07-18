# 02 — Assumptions & Risks (v0.33)

> **All prior versions complete** — full bet/risk history in their respective archives.
> **v0.32 complete** — all v0.32 bets held; risks resolved or managed.
> Archived: [`docs/v0.32/02_assumptions-and-risks.md`](v0.32/02_assumptions-and-risks.md).

## Dark theme / theme selector (2026-07-18)

> ⚠️ ASSUMPTION: Board chrome and rendered content are already CSS-isolated (Svelte scoped styles for chrome vs. `@scope`-wrapped Bootstrap for `#html-renderer-root`). New theme CSS variables must live only in the board-chrome scope and must not leak into or be inherited by the rendered-content scope. This should be explicitly verified once implemented, since CDN-mode exports leave Bootstrap unscoped (per v0.32) — the risk is one-directional (board→content), not content→board.

> ⚠️ ASSUMPTION: No CSS custom properties exist yet anywhere in the client; all board-chrome colors are currently hardcoded hex values scattered across multiple components (`App.svelte`, `HistoryPanel.svelte`, `DeleteExportModal.svelte`, others). Introducing a theme requires a sweep to convert these to CSS variables — risk of missed/inconsistent colors if any chrome component is overlooked.

- Decision: theme selection persists across sessions via localStorage.
- Decision: default theme for first-time users is light (current look); dark is opt-in.
