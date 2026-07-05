# Milestone v0.20 — Design Debt: Safety Net (Sprint 33)

**Status:** planned

> Promoted 2026-07-05 from the Design Debt Log (`01_input-ideas.md`) via a `/grill-me` scoping interview during intake. First of two milestones splitting the log's 8 items by regression risk: this one is additive/no-behavior-change work, and it exists partly to safety-net the behavior-risk refactors in `Milestone_v0.21.md`. See `02_assumptions-and-risks.md` §M and `03_requirements.md` NF9–NF13.

### Sprint 33 — Design Debt: Safety Net
- [ ] Configure ESLint for `client/` (Svelte + TS) and `server/` (TS): `eslint-plugin-svelte` + `@typescript-eslint`, wired into an npm script (NF9)
- [ ] Fix hygiene/a11y issues, linter-assisted: placeholder/zoom-hint text contrast (WCAG AA), `aria-live` on the disconnect banner + Done button, keyed `each` block in the Mermaid popup menu, redundant `try/catch` around `saveSnapshot()`, silent `catch {}` blocks now logged, memoize `getMermaidBundle()`/`getKatexCss()`
- [ ] Blanket unit test coverage: client (currently zero unit tests), `export-html.ts`, `slideshow.ts`, `events.ts`, `ws.ts`, `channel.ts`, `session.ts` (currently none), and deeper `mcp.ts` coverage (NF10)
- [ ] Add `Content-Security-Policy` header + explicit Mermaid `securityLevel` (NF11)
- [ ] Bump `@types/katex` to match installed `katex@0.17.0` (trivial, types-only — see M7 in `02`)

> **Implementation note:** task order matters — linter first (so hygiene fixes are linter-assisted, not fixed by hand and immediately re-flagged), then test coverage, then CSP, then the `@types/katex` bump last. CSP and the version bump don't depend on the (larger) test-coverage effort and can proceed once the linter lands. The Vite/tsx/vitest major-version migration and the client/server `package.json` → npm-workspaces split are explicitly **not** part of this milestone — both carry real migration/restructuring risk beyond "safety net" scope and remain logged, unscheduled, in `01_input-ideas.md`.

---

## Definition of Done — v0.20
- `npm run lint` exists and runs clean (or with only pre-existing, intentionally-deferred exceptions) against both `client/` and `server/`
- Every server module and every client component has at least one unit test; `npm test` count reflects the added coverage
- CSP header present on all server responses; Mermaid `securityLevel` explicitly set; full Playwright e2e suite (31 tests) passes unchanged
- `@types/katex` matches the installed `katex` minor version
- Hygiene fixes (contrast, `aria-live`, keyed `each`, `try/catch`/`catch {}` cleanup, memoization) verified by the new/existing test coverage
