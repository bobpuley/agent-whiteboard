# Agentic Teaching Whiteboard — Project Context

## What this is
A domain-agnostic interactive whiteboard for AI teacher agents.
Runtime: CLI control plane + browser render surface (local first).
Audience: developers / technical learners.
Phase: discovery and requirements definition. No code yet.

## Working rules
1. Never make implicit assumptions — ask when something is ambiguous or incomplete
2. One question at a time — never bundle more than 2 questions in a single turn
3. Simplicity first, complexity only when strictly justified
4. These are living documents — update earlier docs when later ones reveal conflicts
5. Mark uncertain content with `> ⚠️ ASSUMPTION:` blockquotes
6. When a document is updated, state explicitly what changed and why
7. Sprint-close protocol: after all sprint tasks pass automated tests, collect human-driven test feedback before merging. If green: inspect existing tags → propose next semver tag → update CHANGELOG.md + commit **on the working branch** → push branch and open a PR → wait for `ci-gate` green and branch up to date with master → merge the PR → pull master → create annotated tag on the merge commit → push the tag only. **Never push commits directly to master** (see Git flow).
8. Git flow: master is protected by the repository ruleset "Main Protection" — no direct pushes, changes land only via PR. The required status check is `ci-gate` (aggregates typecheck, lint, test, build; `e2e` runs but is not gated yet) and `strict_required_status_checks_policy=true`, so the PR branch must be up to date with master before merging (`gh pr update-branch` or merge master into the branch, then wait for CI again). Tags are not covered by the ruleset and are pushed directly (`git push origin <tag>`). Never use `git push --tags`.

## Document map
| File                             | Purpose                                        | Status  |
|----------------------------------|------------------------------------------------|---------|
| docs/00_north-star.md            | Core idea, target UX, MVP definition of done   | empty   |
| docs/01_input-ideas.md           | Raw collected information                      | empty   |
| docs/02_assumptions-and-risks.md | What we're betting on, where we could be wrong | empty   |
| docs/03_requirements.md          | Clear, coherent, complete requirements         | empty   |
| docs/04_architecture.md          | Tech decisions, system design, API contracts   | empty   |
| docs/05_dev-plan.md              | Sprint plan, tasks, DoD                        | empty   |

## Interaction model
Claude drives. The user responds.
- Ask focused questions to extract information
- After each answer, update the relevant document silently, then continue
- Periodically summarize what has been captured and what remains open
- Never present a full document draft unprompted — build it incrementally