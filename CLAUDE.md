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

## Document map
| File                             | Purpose                                        | Status  |
|----------------------------------|------------------------------------------------|---------|
| docs/00_north-star.md            | Core idea, target UX, MVP definition of done   | empty   |
| docs/01_input-ideas.md           | Raw collected information                      | empty   |
| docs/02_assumptions-and-risks.md | What we're betting on, where we could be wrong | empty   |
| docs/03_requirements.md          | Clear, coherent, complete requirements         | empty   |
| docs/04_architecture-and-plan.md | Tech decisions + dev plan with tasks and DoD   | empty   |

## Interaction model
Claude drives. The user responds.
- Ask focused questions to extract information
- After each answer, update the relevant document silently, then continue
- Periodically summarize what has been captured and what remains open
- Never present a full document draft unprompted — build it incrementally