# doc-creator-driver

A set of project commands that drive an incremental, document-first development workflow. Each command covers one phase of the cycle; they are designed to be run in order when starting a project, and individually as the project evolves.

## Commands

| Command | Invoke | When to use |
|---|---|---|
| `start` | `/doc-creator-driver:start` | Opening a session — loads context and asks the next question |
| `synthesize` | `/doc-creator-driver:synthesize` | Raw input files landed in `docs/raw/` — distil them into `01_input-ideas.md` |
| `intake` | `/doc-creator-driver:intake` | A new idea, feature request, or bug report arrives |
| `next-step` | `/doc-creator-driver:next-step` | Not sure what to do next — finds the earliest unresolved gap |
| `review` | `/doc-creator-driver:review` | Audit docs 02–05 for contradictions, unresolved assumptions, and gaps |
| `implement` | `/doc-creator-driver:implement` | Execute the dev plan: branch → implement → test → merge, recursively |
| `archive` | `/doc-creator-driver:archive` | A version is fully released — snapshot docs 01–05 into `docs/vX.Y/` and reset 01–04 as seeds for the next version |

---

## Document map

The commands operate on this fixed set of files:

```
docs/
├── raw/                        ← drop raw input here before /synthesize
├── 00_north-star.md            ← core idea, target UX, MVP definition of done
├── 01_input-ideas.md           ← synthesized input (output of /synthesize)
├── 02_assumptions-and-risks.md ← bets and risks, marked ⚠️ ASSUMPTION
├── 03_requirements.md          ← clear, coherent, complete requirements
├── 04_architecture.md          ← tech decisions, system design, API contracts
├── 05_dev-plan.md              ← sprint plan, tasks, definition of done
└── vX.Y/                       ← snapshot of 01–05 (and 06_review.md) for a shipped version, written by /archive
```

Documents flow in order: a later doc must never assume something not established by an earlier one.

---

## Typical workflows

### Starting a new project

```
1. Fill docs/00_north-star.md with a rough idea (one paragraph is fine)
2. Drop raw notes / transcripts / references into docs/raw/
3. /doc-creator-driver:synthesize   ← distils raw/ into 01_input-ideas.md
4. /doc-creator-driver:start        ← loads context, asks the first question
5. Answer questions; Claude updates the docs after each answer
6. Repeat /doc-creator-driver:next-step until all docs are solid
7. /doc-creator-driver:implement    ← executes the dev plan
```

### Adding a new idea mid-project

```
/doc-creator-driver:intake
```

Select **Feature request**. The command propagates the change through 01 → 02 → 03 → 04 → 05 in order, checking each document and asking for clarification only when a decision is genuinely ambiguous.

### Reporting a bug

```
/doc-creator-driver:intake
```

Select **Bug report**. The command logs the bug, finds the violated requirement, optionally updates the architecture, adds a fix task to the dev plan, and checks whether the bug reveals a false assumption.

### Auditing the docs before a sprint

```
/doc-creator-driver:review
```

Reads docs 02–05, produces a structured list of contradictions, unresolved assumptions, and gaps in `docs/06_review.md`, creates a task per issue, fixes them one by one (asking the user for decisions), and deletes `06_review.md` when the checklist is clear.

### Archiving a shipped version

```
/doc-creator-driver:archive
```

Only runs once every milestone for a version is `released` in the Milestone Registry
(`docs/05_dev-plan.md`) and all its tasks are checked. Snapshots docs 01–05 (and
`06_review.md` if present) into `docs/vX.Y/`, resets docs 01–04 as stubs seeding the next
version, updates the Milestone Registry row and adds a `planned` row for the next version,
logs the shipped version in `.claude/memory/project-progress.md`, and commits. Runs after
the tag/CHANGELOG sprint-close protocol in the root `CLAUDE.md`, not instead of it.

---

## Rules the commands enforce

- **Propagation order is strict.** A later document is never updated without first checking the earlier ones.
- **No silent inference.** `AskUserQuestion` is used whenever a decision or trade-off is genuinely ambiguous.
- **Uncertain content is marked.** Assumptions use `> ⚠️ ASSUMPTION:` blockquotes.
- **One question at a time.** Commands never bundle more than two questions in a single turn.
- **`synthesize` never invents.** Only content grounded in the raw files survives; speculation is discarded.
- **`implement` never changes requirements or architecture.** Docs 03 and 04 are read-only during implementation.
