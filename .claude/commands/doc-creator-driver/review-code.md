---
description: Orchestrator that runs both code reviews (Node.js/TypeScript, Frontend) in parallel as sub-agents and summarizes their findings.
triggered_by: User requests all code reviews, User requests a full release-readiness review, User wants to run all reviews in parallel
---

# All Reviews — Parallel Orchestrator

## Mission

Run the two specialized code reviews **in parallel** to produce all two review reports simultaneously, then summarize the findings.

## Steps

### 1. Read the two review command files

Read all two in parallel:

- `.claude/commands/doc-creator-driver/review-frontend.md`
- `.claude/commands/doc-creator-driver/review-node-ts.md`

Also read the output template: `.claude/templates/review.template.md`

### 2. Spawn two sub-agents in parallel

In a **single response**, make two Agent tool calls simultaneously (one per review). For each call:

- `subagent_type: "claude"`
- `description`: short label (e.g. `"Backend Node Reviewer"`)
- `prompt`: compose from the corresponding command file content you just read, plus this preamble:

  ```
  Working directory: /Users/marcopugliese/workspaces/agent-whiteboard

  You are running as a sub-agent. Follow the instructions below exactly.
  Use the Read tool to explore source files. Write your output to the target file specified in the instructions.

  <content of the command file>
  ```

Do NOT run the agents sequentially. All two Agent calls must appear in the same response turn.

### 3. Wait for all two to complete

When all two sub-agents return, collect their result summaries.

### 4. Print a summary table

Report to the user:

```
## Review Summary

| Review          | HIGH | MEDIUM | LOW | Output file                  |
|-----------------|------|--------|-----|------------------------------|
| Node.js / TS    |  N   |   N    |  N  | docs/06_nodejs_review.md     |
| Frontend        |  N   |   N    |  N  | docs/06_frontend_review.md   |
```

List any HIGH-urgency findings by title so the user can triage immediately.
