# 04 — Architecture (v1.0)

> **v0.33 complete** — full v0.33 architecture in
> [`docs/v0.33/04_architecture.md`](v0.33/04_architecture.md).

*v1.0 architecture not yet defined.*

---

## 1. 1.0 Release Readiness & npx Distribution (F27–F28, NF33–NF37 in `03`)

- **Production entrypoint (`bin/cli.js`):** new `bin/` script, referenced by `package.json`'s `bin` field (`"agent-whiteboard": "bin/cli.js"`), with a `#!/usr/bin/env node` shebang. It imports and runs the compiled `dist/server/index.js` (today's `server/index.ts` entry, already dependency-only — no dev tooling in its own import graph), then opens the browser via the existing `open` dependency. This is the thing `npx agent-whiteboard` actually executes; it must never `require`/`import` `tsx`, `vite`, `concurrently`, or `wait-on`.
- **Static file serving (`server/app.ts`):** `createApp()` gains a static-file middleware (`@hono/node-server/serve-static` or equivalent) that serves `dist/client` when running in production mode, so the compiled server is self-sufficient without the Vite dev server. Dev mode (`npm run dev`) is unaffected — it keeps using Vite's dev server + proxy, as today. Mode selection: presence of `dist/client/index.html` relative to the running entrypoint, or an explicit `NODE_ENV`/flag check — exact mechanism to be settled during implementation, not a product-level decision.
- **Loopback guardrail (F27):** at startup in `server/index.ts`, before `serve()` is called, validate `HOST` against a loopback allowlist (`localhost`, `127.0.0.1`, `::1`). If it doesn't match and no explicit opt-in env var (e.g. `ALLOW_NON_LOOPBACK=1`) is set, fail fast with a clear error instead of binding. This replaces "HOST defaults to localhost" (a soft convention) with an enforced guarantee, matching the accepted single-user/local-only trust model in `02`.
- **Accessibility fix (F28):** `NodeActionPopup.svelte` gains a `keydown` handler — reuse the existing `trapFocus` action's `Escape`-to-close behavior (`client/src/lib/trapFocus.ts`) rather than a bespoke handler, and extend `popup-item`'s handler to also fire on `" "` (Space), matching native `<button>` semantics. No new dependency.
- **Package/publish shape (NF33–NF36):** `package.json` gains `license: "MIT"`, `description`, `repository`/`homepage`/`bugs` pointing at `github.com/bobpuley/agent-whiteboard`, `author`, `keywords`, and a `files: ["bin", "dist", "README.md", "LICENSE", "CHANGELOG.md"]` allowlist; `private: true` is removed; `version` becomes `1.0.0`. The `build` script (already `tsc -p tsconfig.json && ... && vite build`) is the one producing everything `files` references — no new build step, just ensuring `bin/cli.js` is either plain JS (no compile step needed) or included in the `tsc` project's output.
- **CI (NF37):** new `.github/workflows/ci.yml` running on `push`/`pull_request` to `master`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. No deploy/publish automation in this milestone — publishing stays a manual, deliberate step per the project's existing sprint-close protocol (`CLAUDE.md` rule 7).
- No MCP tool contract changes, no snapshot/persistence format changes — this milestone is packaging/runtime/CI/one a11y fix only, isolated from the render pipeline.
