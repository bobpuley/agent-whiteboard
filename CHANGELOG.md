## 0.1.0 — 2026-06-08

- Consolidated all test-related files under a single `tests/` root: `tests/e2e/` (Playwright), `tests/human_driven/` (manual scripts), `tests/unit/server/` (Vitest integration tests), `tests/unit/client/` (placeholder for future Svelte unit tests)
- Updated `playwright.config.ts` (`testDir`) and `vitest.config.ts` (`include` pattern) to point to new locations
- Updated import paths in `tests/unit/server/app.test.ts` (`../../../server/*.js`)
- All 64 Vitest + 16 Playwright tests pass; human-driven showcase and click-demo scripts confirmed working from new paths
- Added §9 test-restructure proposal to `01_input-ideas.md`, risks to `02_assumptions-and-risks.md`, updated project structure in `04_architecture.md`
