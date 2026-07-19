# Project Progress

Running log of shipped versions, appended by `/doc-creator-driver:archive` (Step 5) directly
before the planning anchor line. Read this for a quick history of what's been delivered
without re-reading every archived `docs/vX.Y/`.

**v0.31 shipped** (0.27.4, sprints 69–72, all ACs green): `bootstrap` npm dependency + generalized `@scope`-wrap helper (`scopeCss`), scoped Bootstrap 5 CSS in both HTML exports and the live canvas for `type: "html"` payloads, fixed a `:root`/`@scope` CSS-custom-property bug found via manual browser verification (Bootstrap colors silently failed to apply), updated the `render` tool's `"html"` description, added a Bootstrap showcase slide. Archived docs: `docs/v0.31/`.

**v0.32 shipped** (0.27.5, sprint 73, all ACs green): HTML export defaults to CDN-linked dependencies (Mermaid/Bootstrap/KaTeX via pinned-version, SRI-hashed jsdelivr links, hash computed at runtime from the installed dist file so it never drifts on a version bump), `offline` mode kept as an opt-in via a new `mode` field on `POST /export-html`, MCP `export_html` tool drops its `output_path` parameter entirely and returns HTML inline instead of writing to disk (closes a way for the agent to bypass a write-only-within-project-folders guardrail), accepted trade-off reopening bug B20's Bootstrap scoping leak risk in `cdn` mode (a CDN `<link>` can't be `@scope`-wrapped like an inlined `<style>` block). Archived docs: `docs/v0.32/`.

**v0.33 shipped** (0.28.0, sprint 74, all ACs green): board chrome (toolbar, history panel, delete/export modal) gained a Light/Dark theme via `--board-*` CSS custom properties, a `themeStore` persisting the choice to `localStorage` (defaults to Light), and a sun/moon toggle in the toolbar; hardcoded hex colors swept out of `App.svelte`/`HistoryPanel.svelte`/`DeleteExportModal.svelte`/`SnapshotRow.svelte`; a dedicated `--board-canvas-bg` token keeps the canvas light grey in dark mode since rendered content isn't themed; a static test asserts no renderer source ever references a `--board-*` variable, guarding the F26 isolation guarantee — no server/export-pipeline changes. Archived docs: `docs/v0.33/`.

**v1.0 planning**
