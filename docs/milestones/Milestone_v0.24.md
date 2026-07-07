# Milestone v0.24 — Architecture Consolidation: Client Renderer Registry (Sprint 37)

**Status:** released

> Opened 2026-07-07 via `/doc-creator-driver:intake`, slice B of the architecture consolidation promoted from `desing-analysis/` (FR22 in `01_input-ideas.md`; adoption/sequencing rationale in `02_assumptions-and-risks.md` §N; full target architecture in `04_architecture.md` §9). Isolated to the client, low risk, cheap — the analysis's second-highest-value/lowest-cost slice.

### Sprint 37 — Client Renderer Registry
- [x] **Design a `type → component` registry** (client-side) mapping each canvas type (`mermaid`, `svg`, `html`, `katex`, `vega-lite`, `step-frames-placeholder`) to its renderer component. — `client/src/renderers/registry.ts`: `rendererRegistry: Record<RendererKey, { load, props }>`.
- [x] **Replace `App.svelte`'s hardcoded `{#if canvas.type === "mermaid"} … {:else if …}` dispatch chain** with a registry lookup + dynamic component render. — `<svelte:component this={currentComponent} {...rendererProps} />`, resolved via `loadRenderer()`.
- [x] **Preserve the existing v0.21 per-type dynamic `import()` lazy-loading behavior** — the registry must not force eager loading of every renderer; each type's bundle chunk is still fetched only on first use of that type.
- [x] **Document the one-registration path** for adding a future renderer type (even though no new renderer type ships in this milestone) — this is what U6/D3 in `04` §9 is for. — see the header comment in `registry.ts`.

> **Implementation note:** this is a pure client-side refactor with no server, WebSocket contract, or MCP surface changes. The existing async-ordering guard (B8, shipped v0.18) and dynamic-import boundaries (v0.21) must be preserved unchanged inside the new registry structure, not re-implemented.

> **Amendment (found during implementation):** the registry's `load()` returns each wrapper component (`Mermaid.svelte`, `Html.svelte`, `Katex.svelte`, `VegaLite.svelte`, `StepFramesPlaceholder.svelte`) via a statically-imported reference wrapped in `Promise.resolve(...)`, not a dynamic `import("./Mermaid.svelte")` of the wrapper file itself. Dynamically importing the wrappers too was tried first and reverted: those wrapper files are tiny (~13kB combined) next to the actual v0.21 win — mermaid.js/katex/vega-embed (hundreds of kB each) — which lives *inside* each wrapper, is untouched by this milestone, and remains genuinely lazy (verified: `npm run build` still produces separate `mermaid.core-*`/`katex-*`/`embed-*` chunks, only fetched on first use of that type). Dynamically importing the wrappers shrank the main bundle just enough to shift page-load timing and made a pre-existing, razor-thin dev-server race — a REST-triggered `render()` arriving before the fresh page's own `/stream` WebSocket handshake completes — fail far more often in the Playwright e2e suite (reproduced: ~70% failure rate isolated, vs. baseline's inherent ~5%; confirmed the dynamic-import-of-wrappers was the specific variable via a controlled A/B test). User confirmed this resolution (static wrapper imports) over keeping wrappers dynamic-imported.

---

## Definition of Done — v0.24
- `App.svelte`'s hardcoded renderer `{#if}` chain is removed, replaced by the type→component registry.
- All existing renderer types render identically to before — verified by the full existing Playwright e2e suite passing unchanged.
- Per-type dynamic `import()` lazy-loading (v0.21) and the async-ordering guard (B8/v0.18) are preserved, not regressed.
- No WebSocket message shape, MCP contract, or snapshot schema change in this milestone.
