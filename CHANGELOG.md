## 0.1.1 — 2026-06-08

- Extended `POST /wait-click` to accept an optional `node_actions` body (`Record<string, string[]>`), enabling popup menus from REST callers (previously MCP-only)
- Added `isNodeActionsValid()` guard in `server/app.ts`; invalid payloads return HTTP 400
- Showcase Section 10 rewritten as a real end-to-end interactive popup demo (Client/Server/DB nodes with per-node action menus)
- Added Section 11 — edge click demo (`--edge` flag)
- Composable showcase flags: `-s` (standard 1–8), `-i` (interactive), `-u` (popup), `-e` (edge), `-a` (all); combinable, deduplicated
- Fixed Section 9 edge-click guard to skip drill-down lookup for edge types
- 2 new unit tests (66 total, all passing); docs updated to remove MCP-exclusive restriction on popup menus

## 0.1.0 — 2026-06-08

- Consolidated all test-related files under a single `tests/` root: `tests/e2e/` (Playwright), `tests/human_driven/` (manual scripts), `tests/unit/server/` (Vitest integration tests), `tests/unit/client/` (placeholder for future Svelte unit tests)
- Updated `playwright.config.ts` (`testDir`) and `vitest.config.ts` (`include` pattern) to point to new locations
- Updated import paths in `tests/unit/server/app.test.ts` (`../../../server/*.js`)
- All 64 Vitest + 16 Playwright tests pass; human-driven showcase and click-demo scripts confirmed working from new paths
- Added §9 test-restructure proposal to `01_input-ideas.md`, risks to `02_assumptions-and-risks.md`, updated project structure in `04_architecture.md`
