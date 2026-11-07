# Milestone v1.9 — Agent Skills & `install-skills` CLI (Sprint 92)

**Status:** released

> New feature (FR34 in `01`, 2026-11-07). Requirements `03` §11, architecture `04` §11. Ships as package version 1.3.0.

### Sprint 92 — Skills, installer, docs (F51–F54, NF58)

- [x] **F51 — Five skills.** `agent-whiteboard` (core), `whiteboard-teaching`, `whiteboard-assessment`, `whiteboard-analysis`, `whiteboard-design` under `skills/`.
  - *DoD:* each has valid `name`/`description` frontmatter; together they cover the use cases listed in the README.
- [x] **F52 — `install-skills` subcommand.** `bin/install-skills.js` + dispatch in `bin/cli.js`.
  - *DoD:* default/`--project`/`--dir` destinations, `--only`, `--force`, `--list`, `--help`, exit codes 0/1/2; plain `npx agent-whiteboard` still starts the server.
- [x] **F53 — README.** Use cases section and Agent skills section with install commands.
- [x] **F54 — Packaging.** `skills` added to `files`; `npm pack --dry-run` lists the five SKILL.md files.
- [x] **NF58 — Unit tests.** `tests/unit/server/installSkills.test.ts` (10 tests).
- [x] **Dev tooling.** `npm run check` mirrors CI locally; `video/**` ignored by ESLint.

---

## Definition of Done — v1.9
- All tasks above shipped with passing acceptance criteria from `03` §11.
- Full unit test suite green, `svelte-check`/`eslint`/`npm run build` clean.
- Manual test pass per `test_skills.md`.
