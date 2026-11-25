Implement the dev plan recursively

Read in order:
1. docs/03_requirements.md
2. docs/04_architecture.md
3. docs/05_dev-plan.md

Then find the active milestone:
- From the Milestone Registry in `05_dev-plan.md`, find the single milestone with status **in progress** and follow its link to read the milestone file.
- If no milestone is **in progress**: halt — "No in-progress milestone found. Mark one as **in progress** in docs/05_dev-plan.md to begin."
- If multiple milestones are **in progress**: halt — "Multiple in-progress milestones found. Exactly one must be **in progress** at a time."

Generate executable code
Generate unit tests

Do not change requirements or architecture.

# Workflow

1. Analyze the documents
2. In the in-progress milestone file, check for the next pending implementations (`- [ ]` items)
3. If no pending implementations:
   - Update the Milestone Registry in `05_dev-plan.md`: change this milestone's status from **in progress** to **released**
   - Stop — "Milestone complete and marked released. Promote the next planned milestone to **in progress** when ready."
4. Otherwise:
   1. Pick the next implementation
   2. Create a git branch (name rules: between ~5 and ~30 chars, common naming best practices)
   3. Think about how to properly integrate it in the existing codebase
   4. Split it into atomic tasks (TaskCreate for each)
   5. For each task:
      * (TaskUpdate in_progress)
      * Use AskUserQuestion for any decision or clarification needed
      * Implement the test
      * Implement the code
      * Run the tests
      * Iterate implementation until tests pass
      * Update the sprint task in the in-progress milestone file (mark `- [x]`)
      * commit
      * (TaskUpdate completed)
   6. Sprint completion gate (runs once, after ALL tasks pass):
      * AskUserQuestion: "Please run your manual / human-driven tests and report the results. All green?"
        - If issues found → stay on branch, fix them, go back to step 5 for the affected tasks
        - If all green → continue
      * Run: `git tag --list --sort=v:refname` to inspect existing tags
        - No tags exist → propose `0.1.0`
        - Tags exist → increment the patch segment of the highest tag (e.g. `0.1.3` → `0.1.4`) → increment the minor segment of the highest tag-minor (e.g. `0.1.3` → `0.2.0`)
      * AskUserQuestion: "Proposed tags are <tag>, <tag-minor>. Confirm or provide an override."
      * Update/create CHANGELOG.md **on the sprint branch** (master is protected — never commit or push directly to it):
        - Prepend a new section header `## <tag> — <YYYY-MM-DD>` followed by bullet points summarising the sprint changes (derive from branch commits via `git log`)
        - `git add CHANGELOG.md && git commit -m "chore: update changelog for <tag>"`
      * Land the branch via pull request (see "Landing a branch" below)
      * Create annotated tag on the merge commit: `git checkout master && git pull && git tag -a <tag> -m "<tag>"`
      * Push the tag only: `git push origin <tag>` (never `git push --tags`)
   7. Go to "1. Analyze the documents"

# Required skills
typescript-expert/SKILL.md

# Landing a branch (master is protected by a ruleset)

Direct pushes to master are rejected. Every branch — per-sprint merges and the release/CHANGELOG commit alike — lands through a PR:
1. `git push -u origin <branch>`
2. `gh pr create --base master` (title/body summarising the sprint)
3. Wait for the required check `ci-gate`: `gh pr checks <pr> --watch --required`. `e2e` is informational for now, not required.
4. The ruleset enforces "branch up to date": if the PR is behind master, run `gh pr update-branch <pr>` (or merge master into the branch and push), then wait for CI again.
5. Merge with a merge commit: `gh pr merge <pr> --merge`. Merging is outward-facing — only when the user has authorised it (the sprint gate answer counts for the final PR; for per-sprint PRs inside a batched milestone, the earlier user instruction to continue without asking counts).
6. `git checkout master && git pull`, delete the local branch.
If `ci-gate` fails, stay on the branch, fix, push, wait again — never bypass the ruleset.
