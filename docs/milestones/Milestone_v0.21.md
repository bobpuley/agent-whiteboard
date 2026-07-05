# Milestone v0.21 — Design Debt: Core Consolidation (Sprint 34)

**Status:** in progress

> Promoted 2026-07-05 from the Design Debt Log (`01_input-ideas.md`) via a `/grill-me` scoping interview during intake. Second of two milestones splitting the log's 8 items by regression risk: this one is the behavior-risk refactor work, deliberately sequenced after `Milestone_v0.20.md`'s safety net (linter + blanket test coverage) lands. See `02_assumptions-and-risks.md` §M and `03_requirements.md` NF12–NF13.

### Sprint 34 — Design Debt: Core Consolidation
- [x] Decompose `App.svelte` (449 lines) into stores/reducers: WebSocket routing, canvas state, step-frame nav, modal orchestration, Done-button lifecycle (NF12)
- [ ] Switch Mermaid/KaTeX/Vega-Embed from eager bundling to per-canvas-type dynamic `import()`, placed at the new component/store boundaries from the task above (NF13)
- [ ] Extract the duplicated render/step-frames-create/append/commit/workspace-validation logic in `server/app.ts` and `server/mcp.ts` into a shared core module (NF12)

> **Implementation note:** App.svelte decomposition must land before the dynamic-import task — lazy-load boundaries are cleanest to place once component/store boundaries are settled, not retrofitted into the current god component (see M5/M6 in `02`). The shared-core server extraction is a different layer (backend vs. frontend) with no code dependency on the other two tasks and can proceed independently/in parallel — it's the highest blast-radius item in this remediation pass (see M4 in `02`), since a bug introduced during extraction would affect both the HTTP and MCP paths at once.

---

## Definition of Done — v0.21
- Full Playwright e2e suite (31 tests) passes unchanged after the App.svelte decomposition
- Each canvas type's heavy rendering library loads on first use of that type, not eagerly on initial page load (verified via network panel / bundle analysis)
- `server/app.ts` and `server/mcp.ts` both route through one shared implementation for render/step-frames/workspace-validation; full existing integration suite (223+ Vitest cases) passes unchanged
- No external behavior, API contract, or WebSocket message shape changes as a result of either refactor (NF12)
