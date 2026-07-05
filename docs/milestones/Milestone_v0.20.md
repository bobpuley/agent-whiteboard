# Milestone v0.20 — Design Debt: Safety Net (Sprint 33)

**Status:** released

> Promoted 2026-07-05 from the Design Debt Log (`01_input-ideas.md`) via a `/grill-me` scoping interview during intake. First of two milestones splitting the log's 8 items by regression risk: this one is additive/no-behavior-change work, and it exists partly to safety-net the behavior-risk refactors in `Milestone_v0.21.md`. See `02_assumptions-and-risks.md` §M and `03_requirements.md` NF9–NF13.

### Sprint 33 — Design Debt: Safety Net
- [x] Configure ESLint for `client/` (Svelte + TS) and `server/` (TS): `eslint-plugin-svelte` + `@typescript-eslint`, wired into an npm script (NF9)
- [x] Fix hygiene/a11y issues, linter-assisted: placeholder/zoom-hint text contrast (WCAG AA), `aria-live` on the disconnect banner + Done button, keyed `each` block in the Mermaid popup menu, ~~redundant `try/catch` around `saveSnapshot()`~~ — investigated and kept as-is (deliberate F10 caller-level backstop proven by an existing test, not dead code; now documented with a comment), silent `catch {}` blocks logged (scoped to the F11 gap in snapshot-reader.ts + viewport-cache.ts cache corruption + HistoryPanel.svelte's loadSnapshot), memoized `getMermaidBundle()`/`getKatexCss()`
- [x] Blanket unit test coverage (NF10): server — new test files for `session.ts`, `events.ts`, `ws.ts`, `slideshow.ts`, `channel.ts` (`export-html.ts` already had coverage from v0.18); `mcp.ts` deepened from 15 to 39 tests (render/step/seek/clear/slideshow/wait_click/wait_done/step-frames-builder/export, previously only list_snapshots/export_html/per-frame validation). Client — all 7 previously-untested Svelte components now covered (App, HistoryPanel, DeleteExportModal, Mermaid, Html, Katex, VegaLite), including a real DOMPurify-sanitization test (F6) and the U7i single/multi-workspace modal-step behavior. `npm test`: 331/331 passing.
- [x] Add `Content-Security-Policy` header + explicit Mermaid `securityLevel` (NF11) — CSP header via Hono middleware on all `server/app.ts` responses, plus a `<meta http-equiv>` CSP tag in the exported HTML document itself (the actual offline-file-open scenario, where an HTTP response header has no effect); `securityLevel: "strict"` set explicitly at all 3 `mermaid.initialize()` call sites (matches mermaid's existing default — no behavior change). Verified against the full 38-test Playwright e2e suite (one real regression found and fixed: `role="status"` on the Done button overrode its native button role, breaking 2 tests — removed the role, kept `aria-live`).
- [x] ~~Bump `@types/katex` to match installed `katex@0.17.0`~~ — no `0.17.x` release of `@types/katex` exists; `katex@0.17.0` now ships its own native types, so `@types/katex` was removed entirely instead (see updated M7 in `02`)

> **Implementation note:** task order matters — linter first (so hygiene fixes are linter-assisted, not fixed by hand and immediately re-flagged), then test coverage, then CSP, then the `@types/katex` bump last. CSP and the version bump don't depend on the (larger) test-coverage effort and can proceed once the linter lands. The Vite/tsx/vitest major-version migration and the client/server `package.json` → npm-workspaces split are explicitly **not** part of this milestone — both carry real migration/restructuring risk beyond "safety net" scope and remain logged, unscheduled, in `01_input-ideas.md`.

---

## Definition of Done — v0.20
- `npm run lint` exists and runs clean (or with only pre-existing, intentionally-deferred exceptions) against both `client/` and `server/`
- Every server module and every client component has at least one unit test; `npm test` count reflects the added coverage
- CSP header present on all server responses; Mermaid `securityLevel` explicitly set; full Playwright e2e suite (31 tests) passes unchanged
- `@types/katex` matches the installed `katex` minor version
- Hygiene fixes (contrast, `aria-live`, keyed `each`, `try/catch`/`catch {}` cleanup, memoization) verified by the new/existing test coverage
