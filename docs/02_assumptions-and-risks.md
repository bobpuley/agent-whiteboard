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
