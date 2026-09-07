# 02 — Assumptions & Risks (v1.0)

> **All prior versions complete** — full bet/risk history in their respective archives.
> **v0.33 complete** — all v0.33 bets held; risks resolved or managed.
> Archived: [`docs/v0.33/02_assumptions-and-risks.md`](v0.33/02_assumptions-and-risks.md).

*v1.0 bets and risks to be defined during planning.*

## v1.0 — 1.0 release readiness + npx distribution

> ⚠️ ASSUMPTION (**resolved/enforced** — v1.0 released): The whiteboard stays a single-user, local-only tool for 1.0 — no auth/multi-tenant model is in scope. User-confirmed: "it's fine until the app is mono user, local only." Previously the only safeguard was `HOST` defaulting to `localhost`, trivially overridden by an env var with no gate. F27 (`server/index.ts`'s `assertLoopbackHost`) shipped this as an **enforced** guardrail — refusing to bind a non-loopback host without the explicit `ALLOW_NON_LOOPBACK=1` opt-in — so the "local-only" assumption now holds by construction, not just by documentation.

> ⚠️ ASSUMPTION (**confirmed** — v1.0 released): npm publish target is the public npm registry under an unscoped package name. Confirmed as `agent-whiteboard` in `package.json`'s `name` field; published under that name (NF36).

- **Risk (resolved — NF33 shipped).** ~~devDependency leakage into the runtime path~~ — the v1.0 production entrypoint (`bin/cli.js` + `server/index.ts`'s production static-serving mode) is self-contained against a built `dist/` and shells out to no dev-only tool at runtime.
- **Risk — version numbering discontinuity.** `package.json` has been frozen at `0.1.0` since the start while `CHANGELOG.md` has independently tracked 33 shipped milestones up to `0.28.0`. A decision is needed on what "1.0.0" means here (continue the existing numbering vs. a deliberate reset) before the first tagged publish — see `03_requirements.md`. **Resolved:** `package.json`'s `version` was reset to `1.0.0` for the v1.0 publish (NF36); see `05_dev-plan.md`'s versioning note for how the milestone label and `package.json`'s version relate going forward (they're independent — the package stays on a `1.0.x` patch train).
- **Risk (resolved — F28 shipped).** ~~known HIGH-severity accessibility defect~~ — the Mermaid node-action popup keyboard trap documented in `docs/06_frontend_review.md` was closed (`Escape`-to-dismiss via `trapFocus`, `Space` added to action activation).
- **Risk (resolved — NF35 shipped).** ~~package tarball bloat~~ — `package.json`'s `files` allowlist (`bin`, `dist`, `README.md`, `LICENSE`, `CHANGELOG.md`) is in place; `npm pack --dry-run` ships 163 files (down from 213 unfiltered, per `CHANGELOG.md`'s Sprint 77 entry).

## v1.1 (planning)

> ⚠️ ASSUMPTION (**resolved** — 2026-07-25): The social preview redesign (FR30 in `01`) delivers SVG mockups + written briefs, not a finished production PNG. Selecting one concept/style and producing the final `docs/social-preview.png` is a separate, later step — not automatically in scope of this milestone's DoD unless the user picks a winner and asks for it. The "terminal/canvas duo" concept (handmade style, with the node-action popup merged in) was selected and `docs/social-preview.png` was finalized the same day (commit `f1f5382`).

## v1.1.1 — revealed gap

> ⚠️ ASSUMPTION (now known false, being corrected in v1.1.1): the v0.20 "CSP hardening" pass (Sprint 33) assumed `script-src 'self' 'unsafe-inline'` was sufficient for every renderer type. It never accounted for Vega-Lite's client-side expression compiler, which needs `'unsafe-eval'` to run `new Function(...)`-based expressions at render time — the gap sat dormant because the live client-managed Vega-Lite slide (showcase "7b") didn't exist yet at the time. See B23 in `01`, F31 in `03`.

## v1.2 — Design Debt: Client Hardening

> Promotes 9 of the MEDIUM/LOW findings logged in the Design Debt Log (`01_input-ideas.md`, from `docs/06_frontend_review.md`, 2026-07-18) into scheduled work. Excludes the `DeleteExportModal.svelte` size finding, which stays logged but unscheduled — the separate `docs/06_frontend-desing-review.md` design-responsibility audit already concluded its size reflects a parameterized shared shell, not extractable duplication, so there's no concrete refactor to schedule from it.

> ⚠️ ASSUMPTION (**resolved/mitigated** — v1.2 released): Mermaid diagram source is driven by an AI teacher agent, not fully controlled by the end user viewing the board. This project treats that as untrusted-enough to warrant the same DOMPurify pass every other `svg`/`html` payload already gets (`Html.svelte`), even though no bypass of mermaid's own `securityLevel: "strict"` has been demonstrated. NF38 shipped the matching `DOMPurify.sanitize()` pass in `Mermaid.svelte`, closing the inconsistency.

- **Risk — session-ending WS disconnects.** `connectWebSocket()` never retries after `close`; today, recovery requires a manual page reload. For a tool meant to run during a live teaching session, a transient blip (dev server restart, laptop sleep/wake) currently converts into a full-session interruption rather than a momentary hiccup.
- **Risk — silent client/server styling drift.** `scopeCss.ts` is hand-duplicated between `client/src/lib` and `server/export-html.ts` with no test enforcing parity; an edit to one copy without the other would silently diverge live-rendered vs. exported HTML styling, likely only caught by visual inspection.

## v1.3 — Data Integrity & Export Isolation

> Promotes 3 of the findings logged in the Design Debt Log (`01_input-ideas.md`) into scheduled work: 2 from `docs/06_nodejs_review.md` (2026-07-18) plus the dev-mode port/proxy bug (found 2026-07-19, post-v1.0).

- **Risk — corrupted/hand-edited snapshot files silently produce bad frame-index lookups.** `nodeToFrame` is validated with `nodeToFrameSchema.safeParse()` on the MCP/REST write path, but read back from a snapshot JSON file with a bare, unchecked type assertion (`server/app.ts`, `server/snapshot-reader.ts`). A non-numeric value in a hand-edited or older-format snapshot reaches the browser unvalidated.
- **Risk — export pipeline's global-state workaround has no reentrancy guard.** `generateExportHtmlInner()` patches `global.document`/`window` for the duration of each export; the existing hand-rolled promise queue (`exportQueue`) only serializes the export pipeline's own callers, not any other code path that might touch the same globals mid-`await` (a future feature, or a test in the same process). This is a correctness landmine, not a demonstrated bug today.
- **Risk (low, dev-only) — dev-mode API calls silently break if `PORT` is overridden.** `client/vite.config.ts`'s `server.port` and every proxy target are hardcoded (`5173` / `http://localhost:3000`), not read from `CLIENT_PORT`/`PORT` env vars. Only affects `npm run dev`; the published `npx agent-whiteboard` path is single-port and unaffected.

## v1.4 — Server Hardening & Performance

> Promotes 2 findings from `docs/06_nodejs_review.md` (2026-07-18) into scheduled work.

- **Risk — no upper bound on request body size.** Every JSON route calls `c.req.json()` directly with no `bodyLimit` middleware; an oversized payload (multi-MB `vega-lite`/`html` string) is run through synchronous CPU-heavy rendering with no cap, which can spike memory or block the event loop for every connected client.
- **Risk — synchronous fs I/O scales badly with snapshot count.** Snapshot/viewport-cache persistence (`viewport-cache.ts`, `snapshot-reader.ts`, `snapshot-writer.ts`) uses `readFileSync`/`writeFileSync`/`readdirSync` in loops over every file in a directory; this blocks the single Node.js event loop, including WebSocket broadcasts to other clients, for the duration of large `GET /snapshots/all` or delete calls. Low impact for a single-user tool with few snapshots today, but grows linearly (or worse) with snapshot count.

## v1.5 — Server Hygiene & Tooling

> Promotes the remaining LOW-severity findings from `docs/06_nodejs_review.md` (2026-07-18) into scheduled work — no user-facing behavior change, pure hardening/maintainability.

- **Risk — bare global `crypto.randomUUID()` reliance.** `snapshot-writer.ts` calls `crypto.randomUUID()` via the implicit Node global rather than an explicit `node:crypto` import, unlike the sibling `export-html.ts`. `globalThis.crypto` wasn't unflagged-stable across all Node 18.x early patches, inconsistent with the package's stated `>=18` minimum engine.
- **Risk — unchecked `as any` cast in `channel.ts`.** The MCP `Server` instance is cast to `any` to call a proprietary `notification()` method, with failures silently swallowed (`.catch(() => {})`). Low risk (deliberate, documented SDK-gap workaround) but an unchecked escape hatch with no call-site type safety and no visibility into failures.
- **Risk — unvalidated numeric env vars.** `PORT`/`CHANNEL_PORT` are parsed with `parseInt`/`Number` and used without range/`NaN` validation; an invalid value produces a confusing low-level bind error instead of a clear startup message.
- **Risk — `app.ts` is a growing single-file route surface.** All 20+ REST endpoints live in one 530-line `createApp()` function; not a correctness issue today (shared logic is already factored into `render-core.ts`/`persist.ts`/`validate.ts`), but it grows less navigable with every new endpoint.
- **Risk — outdated core build/test tooling majors.** `vite` (`^4.5.10`) and `vitest` (`^0.34.6`) are multiple majors behind current, missing several years of fixes/perf/security patches at increasing migration cost the longer the gap grows.
