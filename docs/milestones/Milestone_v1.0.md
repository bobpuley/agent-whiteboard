# Milestone v1.0 — 1.0 Release Readiness & npx Distribution (Sprints 75–78)

**Status:** in progress

### Sprint 75 — Production entrypoint & static serving ✅
- [x] Add `bin/cli.js` (`#!/usr/bin/env node`) that starts the compiled server (`dist/server/index.js`) and opens the default browser, matching today's `npm run dev` UX. Must not import `tsx`, `vite`, `concurrently`, or `wait-on`.
- [x] Add a static-file middleware to `createApp()` (`server/app.ts`) serving `dist/client` in production mode, leaving dev mode (`npm run dev`, Vite dev server + proxy) unchanged.
- [x] Verify: `npm run build`, then run `bin/cli.js` directly (no dev script) and confirm the whiteboard loads and MCP/REST/WS all work against the static build.

> **Implementation note:** see `04_architecture.md` §1 for the mode-detection approach (presence of `dist/client/index.html` vs. an explicit flag/env var) — pick one during implementation, not a product-level decision.

### Sprint 76 — Loopback guardrail & Mermaid popup accessibility fix ✅
- [x] In `server/index.ts`, validate `HOST` against a loopback allowlist (`localhost`, `127.0.0.1`, `::1`) before calling `serve()`; fail fast with a clear error if it doesn't match and no explicit opt-in env var (e.g. `ALLOW_NON_LOOPBACK=1`) is set.
- [x] Add tests covering: default `HOST` binds fine, an invalid `HOST` without opt-in fails fast with a clear message, opt-in env var allows a non-loopback `HOST`.
- [x] Fix `NodeActionPopup.svelte`: add `Escape`-to-dismiss (reuse `client/src/lib/trapFocus.ts`'s existing `Escape` handling rather than a bespoke handler), and extend `popup-item`'s `keydown` handler to also fire on `" "` (Space).
- [x] Add/update tests confirming `Escape` dismisses the popup without selecting an action, and `Space` activates a focused action item.

### Sprint 77 — package.json publish readiness ✅
- [x] Add `license: "MIT"`, `description`, `repository`, `homepage`, `bugs`, `author`, `keywords` to `package.json`.
- [x] Remove `private: true`; add a `bin` field (`"agent-whiteboard": "bin/cli.js"`); add a `files` allowlist (`["bin", "dist", "README.md", "LICENSE", "CHANGELOG.md"]`).
- [x] Bump `version` to `1.0.0`.
- [x] Verify: `npm pack --dry-run` produces a tarball containing only the allowlisted paths; `npm publish --dry-run` succeeds locally.
- [x] Update `README.md` with an `npx agent-whiteboard` quickstart section and an explicit statement of the local-only/single-user trust model (per `02_assumptions-and-risks.md`).

### Sprint 78 — CI pipeline
- [ ] Add `.github/workflows/ci.yml`: on `push`/`pull_request` to `master`, run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] Verify green run on a real PR against `master`.

> **Implementation note:** no deploy/publish automation in this milestone — publishing stays a manual, deliberate step per `CLAUDE.md` rule 7 (sprint-close protocol).

---

## Definition of Done — v1.0
- `npx agent-whiteboard` (tested via a locally packed-and-installed tarball in a clean temp directory, with only `dependencies` installed — no devDependencies present) starts the server, serves the built client, and opens a working whiteboard in the browser.
- Starting the server with a non-loopback `HOST` and no opt-in fails fast with a clear error instead of binding.
- The Mermaid node-action popup is dismissible via `Escape`; action items activate via `Space` as well as `Enter`.
- `package.json` is publish-ready: metadata fields set, `private` removed, `files` allowlist in place, `version` is `1.0.0`.
- `npm pack --dry-run` / `npm publish --dry-run` confirm only the allowlisted paths are shipped.
- CI runs typecheck, lint, test, and build on every push/PR to `master` and is green.
- All existing tests pass; new tests cover the loopback guardrail and the popup keyboard fix.
