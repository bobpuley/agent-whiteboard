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

---

## 2. Delete/Export Modal Default Workspace & Social Preview Refresh (FR29–FR30 in `01`)

| ID  | Requirement | Priority |
|-----|-------------|----------|
| F29 | When the delete/export modal (`DeleteExportModal.svelte`) opens with more than one workspace, the workspace flagged `isCurrent` is selected automatically and the modal opens directly on step 2 (snapshot list) for that workspace — matching the existing single-workspace auto-select behavior. The user can still reach the picker via the existing "back" control (`goBack()`) to choose a different workspace. | v1.1 |
| F30 | `docs/social-preview.png` is replaced with a redesigned image that better conveys user/agent interactivity (the agent driving a rendered graph, the user acting on it) rather than the bare app icon mark. A design-selection step precedes the final asset: 3 concepts × 3 styles (stylized, handmade, pro) are produced as SVG mockups with a written brief each; the user picks one to finalize. | v1.1 |

**Acceptance criteria (draft):**
- With 2+ workspaces present, opening the delete modal or the export modal lands on the current workspace's snapshot list (step 2), not the step-1 picker.
- With exactly 1 workspace, behavior is unchanged (already auto-selects).
- The step-1 picker and `goBack()` still work for switching to a non-current workspace.
- 9 SVG mockups (3 concepts × 3 styles) plus 9 short written briefs are delivered for review; final `docs/social-preview.png` is produced only after the user selects a concept — final-image production is a follow-up task, not blocking this milestone's SVG/brief deliverable (see `02_assumptions-and-risks.md`, v1.1 section).
