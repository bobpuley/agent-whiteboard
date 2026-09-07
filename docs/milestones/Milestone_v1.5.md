# Milestone v1.5 — Design Debt: Server Hygiene & Tooling (Sprint 84)

**Status:** planned

> Opened 2026-09-06 via `/doc-creator-driver:intake` (bug report batch). Promotes the remaining LOW-severity findings logged in the Design Debt Log (`01_input-ideas.md`, from `docs/06_nodejs_review.md`, 2026-07-18) into scheduled work — see `02`/`03`/`04` §7 (v1.5 / NF50–NF54). No user-facing behavior change; pure hardening/maintainability.

### Sprint 84 — crypto import, typed channel cast, port validation, app.ts split, tooling bump (NF50–NF54)

- [ ] **NF50 — Explicit `crypto` import.** `server/snapshot-writer.ts` imports `randomUUID` explicitly from `node:crypto` instead of relying on the bare global `crypto`, matching `server/export-html.ts`'s existing pattern.
- [ ] **NF51 — Type the `channel.ts` notification cast.** Define a minimal local interface for the one extra `notification()` method needed and cast the MCP `Server` instance to that instead of `any`; log (don't silently swallow) failures from the `.catch()`.
- [ ] **NF52 — Validate `PORT`/`CHANNEL_PORT` env vars.** Add a shared port-parsing helper used by `server/index.ts` and `server/channel.ts`/`server/app.ts`, failing fast with a clear error before bind/listen/fetch if the value isn't a valid port number.
  - *Acceptance:* starting the server with `PORT=abc` fails fast with a clear error instead of a low-level bind error.
- [ ] **NF53 — Split `app.ts` into per-feature route modules.** Move route registrations into `server/routes/{render,slideshow,snapshots,export}.ts`, each invoked from `createApp()`, with no behavior change.
  - *Acceptance:* full REST/MCP test suite stays green; `createApp()`'s behavior is unchanged.
- [ ] **NF54 — Upgrade `vite`/`vitest` majors.** Bump both to current majors, verify `@sveltejs/vite-plugin-svelte` compatibility, re-run the full client test suite and `client/vite.config.ts`'s proxy setup (including the WS proxy).
  - *Acceptance:* `npm run dev`, `npm test`, and `npm run build` all succeed post-upgrade with no regressions.

> **Implementation note:** all 5 tasks are independent and implementable in any order. NF54 (tooling upgrade) carries the most open-ended risk/effort — budget extra time if breaking config changes surface; do it last so a mid-milestone rollback doesn't block the other 4 items.

---

## Definition of Done — v1.5
- All 5 tasks above shipped with passing acceptance criteria.
- `tsc --noEmit` clean, with no new `any` in `channel.ts`'s notification call.
- Full unit test suite green post vite/vitest upgrade.
- No MCP/REST contract changes, no snapshot/persistence format changes.
- `01`/`02`/`03`/`04` entries for these 5 findings updated from "logged, unscheduled" to resolved; Design Debt Log bullet(s) removed or marked done.
