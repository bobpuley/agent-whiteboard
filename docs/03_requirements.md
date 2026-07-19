# 03 — Requirements (v1.0)

> **v0.33 complete** — all v0.33 requirements implemented; ACs green.
> Archived: [`docs/v0.33/03_requirements.md`](v0.33/03_requirements.md).

*v1.0 requirements not yet defined.*

---

## 1. 1.0 Release Readiness & npx Distribution (FR28 in `01`)

| ID   | Requirement | Priority |
|------|-------------|----------|
| NF33 | The server has a production run mode that serves the built `dist/client` as static assets directly (no Vite dev server, no `tsx watch`) and depends on nothing outside `dependencies` — no devDependency required at runtime. | v1.0 |
| NF34 | A `bin` entrypoint (e.g. `bin/cli.js`) starts the production server and opens the default browser to it, matching today's `npm run dev` UX, and is runnable via `npx agent-whiteboard`. | v1.0 |
| NF35 | `package.json` is publish-ready: `license`, `description`, `repository`, `homepage`, `bugs`, `author`, `keywords` are set; `private` is removed; a `files` allowlist restricts the published tarball to `bin/`, `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`. | v1.0 |
| NF36 | `package.json`'s `version` is `1.0.0` for this release; the package publishes under the unscoped name `agent-whiteboard`. | v1.0 |
| NF37 | A CI pipeline (GitHub Actions) runs typecheck, lint, unit tests, and build on every push and pull request to `master`. | v1.0 |
| F27  | The server refuses to bind to a non-loopback `HOST` unless an explicit opt-in is set, enforcing the accepted single-user/local-only trust model instead of relying on documentation alone. | v1.0 |
| F28  | The Mermaid node-action popup (`NodeActionPopup.svelte`) is dismissible via `Escape`, and its action items are activatable via `Space` as well as `Enter` — closing the keyboard-trap accessibility defect. | v1.0 |

**Acceptance criteria (draft, to refine in `04`/milestone task):**
- `npm pack`, install the tarball in a clean temp directory, then `npx agent-whiteboard` starts the server and renders a working whiteboard in the browser — with zero devDependencies present.
- Starting the server with `HOST=0.0.0.0` and no opt-in flag fails fast at startup with a clear error, instead of binding.
- Opening a Mermaid node-action popup and pressing `Escape` closes it without selecting an action; `Space` activates a focused action item.
- `npm publish --dry-run` succeeds and the resulting tarball contains only the allowlisted paths.
- A fresh PR shows a green CI run (typecheck, lint, test, build all pass).
