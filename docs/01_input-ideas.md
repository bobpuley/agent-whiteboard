# 01 — Input Ideas (v1.0)

> **v0.31 complete** — archived to `docs/v0.31/` on 2026-07-18. This file now seeds v0.32 planning.
> **v0.32 complete** — archived to `docs/v0.32/` on 2026-07-18. This file now seeds v0.33 planning.
> **v0.33 complete** — archived to `docs/v0.33/` on 2026-07-18. This file now seeds v1.0 planning.

*v1.0 planning not yet started. Use `/doc-creator-driver:intake` or `/doc-creator-driver:start` to begin.*

**FR28 — 1.0 Release Readiness & npx Distribution (2026-07-19)**

- Feature request: prep the project for a public 1.0 release, installable/runnable via `npx`. A codebase audit found: `package.json` missing `license`/`description`/`repository`/`homepage`/`bugs`/`author`/`keywords` and has `private: true` (blocks publish); no `bin` entry and no production static-file-serving path in `server/app.ts` (server only runs via dev-mode vite+tsx, never serves `dist/client`), so `npx` has nothing self-contained to execute; devDependencies (`tsx`, `vite`, `concurrently`, `wait-on`) are required by the only existing run path (`npm run dev`) but won't be present in a consumer `npx`/`npm install`; no `files` allowlist/`.npmignore` (`npm pack --dry-run` ships 213 files / 2.6MB including tests, docs, mockup, raw source); version frozen at `0.1.0` while `CHANGELOG.md` independently tracks 33 shipped milestones up to `0.28.0`; no CI/CD (`.github/workflows`) for build/lint/test on push/PR or release automation.
- User decisions: publish as **`agent-whiteboard`** (unscoped) at version **`1.0.0`**. No-auth trust model stays as-is, accepted as fine as long as the tool remains single-user/local-only — this milestone adds an *enforced* loopback-only guardrail rather than relying on documentation alone (see `02_assumptions-and-risks.md`).
- Also includes: fixing the one HIGH-severity finding from `docs/06_frontend_review.md` (keyboard trap in the Mermaid node-action popup) as a release blocker, since it's a known accessibility defect ahead of a public release.
- Explicitly out of scope for v1.0 (deferred to Design Debt Log below): all MEDIUM-severity findings from `docs/06_nodejs_review.md` and `docs/06_frontend_review.md`.
- Milestone: **v1.0**.

## Design Debt Log

> MEDIUM-severity findings from the Node.js/TS (`docs/06_nodejs_review.md`) and Svelte/TS frontend (`docs/06_frontend_review.md`) review passes (2026-07-18), deliberately deferred out of v1.0 scope per user decision. These don't block the 1.0/npx release — logged here as candidates for a future milestone (see pointer in `05_dev-plan.md`). No propagation to `02`–`05` is forced by this log; promote an item explicitly if/when it's scheduled.

- **No request body size limit on JSON endpoints** — `createApp()` never installs a body-size-limiting middleware; oversized payloads can spike memory/block the event loop during synchronous rendering. (`server/app.ts`)
- **Fragile global-state serialization in HTML export pipeline** — `generateExportHtmlInner()` patches `global.document`/`window` for the duration of each export, worked around with a hand-rolled promise queue rather than isolation. (`server/export-html.ts`)
- **Inconsistent validation of `nodeToFrame` loaded from disk** — validated via `nodeToFrameSchema` on the MCP/REST write path, but read back from snapshot files with a bare unchecked type assertion. (`server/app.ts`, `server/snapshot-reader.ts`)
- **Widespread synchronous filesystem I/O on hot paths** — snapshot/viewport-cache persistence uses `readFileSync`/`writeFileSync`/`readdirSync` in loops, blocking the event loop; scales with snapshot count. (`server/viewport-cache.ts`, `server/snapshot-reader.ts`, `server/snapshot-writer.ts`)
- **Outdated core build/test tooling majors** — `vite` (`^4.5.10`) and `vitest` (`^0.34.6`) are multiple majors behind current.
- **Mermaid's rendered SVG bypasses the app's DOMPurify sanitization pass** — `Html.svelte` sanitizes `svg`/`html` payloads via DOMPurify; `Mermaid.svelte` assigns `mermaid.render()`'s output straight to `innerHTML`, relying solely on mermaid's own `securityLevel: "strict"`. (`client/src/renderers/Mermaid.svelte`)
- **Unchecked `any`-typed JSON response in `snapshotActions.ts`** — `fetchSnapshots.ts` types/validates `res.json()`; `snapshotActions.ts` doesn't, three times over. (`client/src/lib/snapshotActions.ts`)
- **Non-null assertions in `registry.ts` make renderer prop wiring fragile** — every `props()` function dereferences `presentation!`; the only guard against the resulting crash lives in the caller (`App.svelte`), not the type system. (`client/src/renderers/registry.ts`)
- **`scopeCss.ts` is hand-duplicated between client and server with no sync check** — byte-for-byte duplicate function, kept in sync manually, no test asserting they match. (`client/src/lib/scopeCss.ts`, `server/export-html.ts`)
- **`DeleteExportModal.svelte` exceeds the codebase's own >500-line component-size threshold** — 608 lines, 9 local `let` bindings, two modes and a two-step wizard in one file.
- **No automatic WebSocket reconnection after disconnect** — `connectWebSocket()` opens one socket and never retries; recovery requires a manual page reload. (`client/src/ws.ts`)
- **Accessibility-critical `trapFocus` action has no dedicated unit test** — every modal depends on it for keyboard accessibility, but it (and `fetchSnapshots.ts`, `download.ts`, `scopeCss.ts`) have no direct test file. (`client/src/lib/trapFocus.ts`)
- Several LOW-severity items (hardcoded colors instead of theme tokens in renderer sub-components, duplicated inline SVG icon markup in `App.svelte`, `Date.now()`-derived Mermaid diagram IDs, bare global `crypto.randomUUID()` reliance, explicit `any` cast in `channel.ts`, unvalidated numeric env vars, oversized `app.ts` route file) — see the full review docs for detail if/when promoted.
