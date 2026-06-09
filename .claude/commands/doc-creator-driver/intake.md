# Intake — integrate a new idea into the project documents

Use this command when something new arrives: a raw input file, a feature request, or a bug report.
It walks you through the correct file-sync protocol for that type, ensuring every affected document is updated in order.

---

## Step 1 — Identify intake type

Use AskUserQuestion to ask:

> "What type of intake is this?
> 1. Raw input — a new file has been dropped into docs/raw/
> 2. Feature request — a new idea or capability the user wants to add
> 3. Bug report — something that is broken or behaving incorrectly"

---

## Step 2 — Execute the protocol for the chosen type

### Type 1 — Raw input

1. Read all unprocessed files in `docs/raw/` (files not yet referenced in `01_input-ideas.md`)
2. Run the synthesize protocol: extract ideas, decisions, constraints, open questions
3. Append synthesized content to `docs/01_input-ideas.md`
4. Continue with **Propagation** below (treat as a feature request from that point)

### Type 2 — Feature request

**Propagation order (never skip a step, never go backwards):**

1. **`01_input-ideas.md`** — Log the raw idea as received. One bullet, no interpretation yet.
2. **`02_assumptions-and-risks.md`** — Ask: does this idea introduce new assumptions or risks?
   - If yes: add them with `> ⚠️ ASSUMPTION:` markers
   - Use AskUserQuestion if a risk is ambiguous
3. **`03_requirements.md`** — Translate the idea into one or more requirements.
   - Ask: which milestone does this belong to? Read the Milestone Registry in `05_dev-plan.md` and present the open (unreleased) milestones as options, plus "new milestone". If exactly one open milestone exists, suggest it as the default.
   - Use AskUserQuestion to clarify scope, priority, or acceptance criteria if unclear
   - Update existing requirements if the idea changes them
4. **`04_architecture.md`** — Ask: does this require an architecture change?
   - If yes: update stack decisions, system diagram, tool contracts, data flows, or project structure as needed
   - Use AskUserQuestion for any trade-off that needs a decision
   - If no change needed: explicitly note "no architecture impact" and move on
5. **Milestone file** — Add one or more sprint tasks for this feature.
   - Find the in-progress milestone from the registry in `05_dev-plan.md` and append the tasks to its file.
   - If this belongs to a future milestone: add the milestone to the registry in `05_dev-plan.md` (status: **planned**), create `docs/milestones/Milestone_vX.Y.md` with a header and status stub, and add the task there. Update the File column in the registry row.
   - Write a clear DoD for each new task.
   - Create a task list entry (TaskCreate) for each new sprint item.
6. State what changed across all files in one concise summary line per file.

### Type 3 — Bug report

**Propagation order:**

1. **`01_input-ideas.md`** — Log the bug as received. Include: observed behaviour, expected behaviour.
2. **`03_requirements.md`** — Find the requirement this bug violates.
   - If the requirement is missing or ambiguous: add/clarify it now (this is a doc gap, fix it)
   - If the requirement is correct but not implemented: mark it as a known gap
   - Use AskUserQuestion if the correct behaviour is unclear
3. **`04_architecture.md`** — Ask: does the fix require an architecture change?
   - If yes: update the relevant section
   - If no: skip
4. **In-progress milestone file** — Add a bug-fix task to the appropriate sprint.
   - Find the in-progress milestone from the registry in `05_dev-plan.md` and append the fix there.
   - Label it clearly as a fix (e.g. `fix: <short description>`)
   - Write a DoD that describes the corrected behaviour
   - Create a task list entry (TaskCreate) for the fix
5. **`02_assumptions-and-risks.md`** — Ask: does this bug reveal a false assumption?
   - If yes: update or remove the relevant assumption
6. State what changed across all files in one concise summary line per file.

---

## Rules

- Never skip a propagation step — even a "no change" is a deliberate check
- Never update a later document without first checking the earlier ones
- Use AskUserQuestion for any decision, trade-off, or ambiguity — do not guess
- Use TaskCreate for every new sprint item added to a milestone file
- After all files are updated, ask the user: "Anything else to add, or shall we continue?"
