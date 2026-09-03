# 02 — Assumptions & Risks (v1.0)

> **All prior versions complete** — full bet/risk history in their respective archives.
> **v0.33 complete** — all v0.33 bets held; risks resolved or managed.
> Archived: [`docs/v0.33/02_assumptions-and-risks.md`](v0.33/02_assumptions-and-risks.md).

*v1.0 bets and risks to be defined during planning.*

## v1.0 — 1.0 release readiness + npx distribution

> ⚠️ ASSUMPTION: The whiteboard stays a single-user, local-only tool for 1.0 — no auth/multi-tenant model is in scope. User-confirmed: "it's fine until the app is mono user, local only." Today the only safeguard is `HOST` defaulting to `localhost`, trivially overridden by an env var with no gate. This milestone turns that into an **enforced** guardrail (refuse to bind a non-loopback host without an explicit opt-in) rather than relying on documentation alone, so the "local-only" assumption actually holds instead of just being claimed in the README.

> ⚠️ ASSUMPTION: npm publish target is the public npm registry under an unscoped package name (`agent-whiteboard` confirmed available as of this planning session). To be confirmed during requirements scoping.

- **Risk — devDependency leakage into the runtime path.** `npx`/a consumer `npm install` only pulls `dependencies`, not `devDependencies`. Today's only run path (`npm run dev`) needs `tsx`, `vite`, `concurrently`, `wait-on` — all devDependencies. The 1.0 production entrypoint must be fully self-contained against a built `dist/` and must not shell out to any dev-only tool at runtime.
- **Risk — version numbering discontinuity.** `package.json` has been frozen at `0.1.0` since the start while `CHANGELOG.md` has independently tracked 33 shipped milestones up to `0.28.0`. A decision is needed on what "1.0.0" means here (continue the existing numbering vs. a deliberate reset) before the first tagged publish — see `03_requirements.md`.
- **Risk — known HIGH-severity accessibility defect.** `docs/06_frontend_review.md` documents a keyboard trap in the Mermaid node-action popup (no `Escape`/keyboard dismiss path). Shipping a public 1.0 with a known HIGH a11y defect undermines any claim of broad usability; treated as a release blocker for this milestone.
- **Risk — package tarball bloat.** No `files` allowlist/`.npmignore` exists; `npm pack --dry-run` currently ships 213 files / 2.6MB (full test suite, docs, mockup, raw TS source) to every installer. Needs an explicit allowlist before first publish.

## v1.1 (planning)

> ⚠️ ASSUMPTION: The social preview redesign (FR30 in `01`) delivers SVG mockups + written briefs, not a finished production PNG. Selecting one concept/style and producing the final `docs/social-preview.png` (and updating any GitHub social-preview settings) is a separate, later step — not automatically in scope of this milestone's DoD unless the user picks a winner and asks for it.

## v1.1.1 — revealed gap

> ⚠️ ASSUMPTION (now known false, being corrected in v1.1.1): the v0.20 "CSP hardening" pass (Sprint 33) assumed `script-src 'self' 'unsafe-inline'` was sufficient for every renderer type. It never accounted for Vega-Lite's client-side expression compiler, which needs `'unsafe-eval'` to run `new Function(...)`-based expressions at render time — the gap sat dormant because the live client-managed Vega-Lite slide (showcase "7b") didn't exist yet at the time. See B23 in `01`, F31 in `03`.

## v1.2 — Design Debt: Client Hardening

> Promotes 9 of the MEDIUM/LOW findings logged in the Design Debt Log (`01_input-ideas.md`, from `docs/06_frontend_review.md`, 2026-07-18) into scheduled work. Excludes the `DeleteExportModal.svelte` size finding, which stays logged but unscheduled — the separate `docs/06_frontend-desing-review.md` design-responsibility audit already concluded its size reflects a parameterized shared shell, not extractable duplication, so there's no concrete refactor to schedule from it.

> ⚠️ ASSUMPTION: Mermaid diagram source is driven by an AI teacher agent, not fully controlled by the end user viewing the board. This project treats that as untrusted-enough to warrant the same DOMPurify pass every other `svg`/`html` payload already gets (`Html.svelte`), even though no bypass of mermaid's own `securityLevel: "strict"` has been demonstrated — closing the inconsistency now is cheaper than waiting for a less-trusted agent/prompt source to make it load-bearing.

- **Risk — session-ending WS disconnects.** `connectWebSocket()` never retries after `close`; today, recovery requires a manual page reload. For a tool meant to run during a live teaching session, a transient blip (dev server restart, laptop sleep/wake) currently converts into a full-session interruption rather than a momentary hiccup.
- **Risk — silent client/server styling drift.** `scopeCss.ts` is hand-duplicated between `client/src/lib` and `server/export-html.ts` with no test enforcing parity; an edit to one copy without the other would silently diverge live-rendered vs. exported HTML styling, likely only caught by visual inspection.
