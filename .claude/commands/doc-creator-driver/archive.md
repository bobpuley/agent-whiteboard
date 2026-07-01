---
description: Archive a completed version — snapshot docs 01–05 and docs/06_review.md (if present), stamp docs 01–04, update the Milestone Registry row + add the next row, update ./.claude/memory/project-progress.md, commit
arguments: version
---

Archive the docs for a completed version of agent-whiteboard.

`$version` must be provided (e.g. `v0.13`). The version being archived is the one whose row
in the Milestone Registry (`docs/05_dev-plan.md`) has Status `released`.

Compute `$nextVersion` by incrementing the minor number after the dot (e.g. v0.9 → v0.10,
v0.13 → v0.14). The scripts do this by string-splitting on `.`, not arithmetic on the whole
number — `$version` is not a float.

# Step 1 — Pre-flight

Run `.claude/scripts/archive-preflight.sh $version`. If it exits non-zero, halt — print the
script's stderr output as the failure reason.

The script checks the Milestone Registry table in `docs/05_dev-plan.md` for a row whose
Milestone column is `$version` with Status `released`, then checks that row's linked
milestone file (`docs/milestones/Milestone_$version.md`) has no unchecked (`- [ ]`) tasks.

# Step 2 — Confirm

AskUserQuestion: "$version is released and all its tasks are checked.
Archive $version now? This will snapshot docs/01–05 (and docs/06_review.md if present)
into docs/$version/ and is not reversible without git."

If not confirmed: halt — "Archive cancelled."

# Step 3 — Snapshot + stamp + registry update

Run `.claude/scripts/archive-snapshot.sh $version`. If it exits non-zero, halt — print the
script's stderr output as the failure reason.

The script covers:
- Copying docs/01–05 (and docs/06_review.md if present) verbatim into `docs/$version/`
- Moving any unversioned `docs/raw/` files to `docs/raw/$version/`
- Prepending the completion banner to each of docs/01–04 (docs/05_dev-plan.md is NOT
  stubbed — the Milestone Registry is a permanent, cumulative index, not version-scoped
  content — see Step 4)
- Appending `— archived in \`docs/$version/\`` to the `$version` row's Status cell in the
  Milestone Registry
- Appending a new `$nextVersion` row to the Milestone Registry with Status `planned` and
  Name/Sprints/File columns as `TBD` (filled in by `/doc-creator-driver:intake` when
  planning starts)

# Step 4 — Rewrite root docs 01–04 as next-version seeds

Read each of docs/01–04 (they now contain the completion banner prepended in Step 3).
Rewrite each file as a clean `$nextVersion` seed: preserve **all** prior completion
banners in order (most recent last), replace the body with a minimal stub, and update
the `#` heading from `$version` to `$nextVersion`.

`docs/05_dev-plan.md` is left as-is (banner + full Milestone Registry, already updated
by the script in Step 3) — do not touch it in this step.

Target structure per file:

### `docs/01_input-ideas.md`

```markdown
# 01 — Input Ideas ($nextVersion)

> **v0.1 complete** — ... archived in [`docs/v0.1/`](v0.1/01_input-ideas.md).
> (one banner per prior completed version, most recent last)
> **$version complete** — ... archived in [`docs/$version/`]($version/01_input-ideas.md).

*$nextVersion planning not yet started. Use `/doc-creator-driver:intake` or `/doc-creator-driver:start` to begin.*
```

### `docs/02_assumptions-and-risks.md`

```markdown
# 02 — Assumptions & Risks ($nextVersion)

> **All prior versions complete** — full bet/risk history in their respective archives.
> **$version complete** — all $version bets held; risks resolved or managed.
> Archived: [`docs/$version/02_assumptions-and-risks.md`]($version/02_assumptions-and-risks.md).

*$nextVersion bets and risks to be defined during planning.*
```

### `docs/03_requirements.md`

```markdown
# 03 — Requirements ($nextVersion)

> **$version complete** — all $version requirements implemented; ACs green.
> Archived: [`docs/$version/03_requirements.md`]($version/03_requirements.md).

*$nextVersion requirements not yet defined.*
```

### `docs/04_architecture.md`

```markdown
# 04 — Architecture ($nextVersion)

> **$version complete** — full $version architecture in
> [`docs/$version/04_architecture.md`]($version/04_architecture.md).

*$nextVersion architecture not yet defined.*
```

### `docs/06_review.md`

If `docs/06_review.md` was archived in Step 3 (rare — `/doc-creator-driver:review` normally
deletes it once its checklist clears), reset the root copy to a stub:

```markdown
# 06 — Review ($nextVersion)

> **$version review archived** — [`docs/$version/06_review.md`]($version/06_review.md).

*$nextVersion review not yet generated. Run `/doc-creator-driver:review` to produce it.*
```

If `docs/06_review.md` was not present (the common case), do nothing here.

### Rules
- Preserve **all** prior completion banners — do not remove any.
- Write each doc via the Write tool (full rewrite), not piecemeal edits.
- Do not invent next-version content — stubs only.
- Do not edit `CLAUDE.md` — the `docs/v[x.y]/` pattern is version-agnostic.

# Step 5 — Update project-progress.md

`.claude/memory/project-progress.md` is a running shipped-version log, tracked in git like
the rest of `.claude/`. It ends with a `**$nextVersion planning**` anchor line. Append a
shipped-version summary line directly before that anchor. Compose it from the Milestone
Registry row and the milestone file:

```
**$version shipped** ($semverRange, sprints $sprintRange, all ACs green): <comma-separated feature summary>. Archived docs: `docs/$version/`.
```

If the anchor line is missing (e.g. the file was hand-edited), append the shipped line at
the end of the file and add a fresh `**$nextVersion planning**` line after it.

# Step 6 — Commit

Run `.claude/scripts/archive-commit.sh $version`. If it exits non-zero, halt — print the
script's stderr output as the failure reason.

# What this command does NOT do

- Does not create the next version's milestone file (`/doc-creator-driver:intake` does that
  when planning starts, filling in the `TBD` row added in Step 3).
- Does not touch source code, tests, or CHANGELOG.md.
- Does not create a git tag or push to remote — that's the sprint-close protocol in
  `CLAUDE.md`, which runs before this command, not as part of it.
