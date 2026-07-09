# Dev Plan

## Milestone Registry

| Milestone  | Name                                                             | Sprints  | Status      | File                                                  |
|------------|------------------------------------------------------------------|----------|-------------|-------------------------------------------------------|
| v0.1       | Core Whiteboard                                                  | 0–8      | released    | [Milestone_v0.1.md](./milestones/Milestone_v0.1.md)   |
| v0.2       | Bidirectionality                                                 | 9–14     | released    | [Milestone_v0.2.md](./milestones/Milestone_v0.2.md)   |
| v0.3       | Observability & Infrastructure                                   | 15–16    | released    | [Milestone_v0.3.md](./milestones/Milestone_v0.3.md)   |
| v0.4       | History Navigator                                                | 17       | released    | [Milestone_v0.4.md](./milestones/Milestone_v0.4.md)   |
| v0.5       | History — Workspace Groups                                       | 18       | released    | [Milestone_v0.5.md](./milestones/Milestone_v0.5.md)   |
| v0.6       | Dynamic Workspace Routing                                        | 19       | released    | [Milestone_v0.6.md](./milestones/Milestone_v0.6.md)   |
| v0.7       | Mandatory Workspace Parameter                                    | 20       | released    | [Milestone_v0.7.md](./milestones/Milestone_v0.7.md)   |
| v0.8       | Incremental Step-Frames Creation                                 | 21       | released    | [Milestone_v0.8.md](./milestones/Milestone_v0.8.md)   |
| v0.9       | Live Step-Frames Preview                                         | 22       | released    | [Milestone_v0.9.md](./milestones/Milestone_v0.9.md)   |
| v0.10      | UI Controls Panel + History UX                                   | 23       | released    | [Milestone_v0.10.md](./milestones/Milestone_v0.10.md) |
| v0.11      | Export by Graph ID                                               | 24       | released    | [Milestone_v0.11.md](./milestones/Milestone_v0.11.md) |
| v0.12      | Done Button & History Delete                                     | 25       | released    | [Milestone_v0.12.md](./milestones/Milestone_v0.12.md) |
| v0.13      | HTML Export & Clear Workspace Removal                            | 26       | released    | [Milestone_v0.13.md](./milestones/Milestone_v0.13.md) |
| v0.14      | Mermaid Export Fix                                               | 27       | released    | [Milestone_v0.14.md](./milestones/Milestone_v0.14.md) |
| v0.15      | Agent-Facing HTML Export                                         | 28       | released    | [Milestone_v0.15.md](./milestones/Milestone_v0.15.md) |
| v0.16      | Delete/Export Modal Redesign                                     | 29       | released    | [Milestone_v0.16.md](./milestones/Milestone_v0.16.md) |
| v0.17      | Step-Frames Per-Frame Type & Validation Parity                   | 30       | released    | [Milestone_v0.17.md](./milestones/Milestone_v0.17.md) |
| v0.18      | Stability & Correctness Fixes                                    | 31       | released    | [Milestone_v0.18.md](./milestones/Milestone_v0.18.md) |
| v0.19      | Mermaid Zoom/Pan Fit & Persistence                               | 32       | released    | [Milestone_v0.19.md](./milestones/Milestone_v0.19.md) |
| v0.20      | Design Debt — Safety Net                                         | 33       | released    | [Milestone_v0.20.md](./milestones/Milestone_v0.20.md) |
| v0.21      | Design Debt — Core Consolidation                                 | 34       | released    | [Milestone_v0.21.md](./milestones/Milestone_v0.21.md) |
| v0.22      | Showcase Coverage, Step-Frames Fit Fix & Slideshow Persistence   | 35       | released    | [Milestone_v0.22.md](./milestones/Milestone_v0.22.md) |
| v0.23      | Architecture Consolidation — Unified Projector                   | 36       | released    | [Milestone_v0.23.md](./milestones/Milestone_v0.23.md) |
| v0.24      | Architecture Consolidation — Client Renderer Registry            | 37       | released    | [Milestone_v0.24.md](./milestones/Milestone_v0.24.md) |
| v0.25      | Architecture Consolidation — Persistence Policy & Finalize Dedup | 38       | released    | [Milestone_v0.25.md](./milestones/Milestone_v0.25.md) |
| v0.26      | Architecture Consolidation — Unified Presentation Model          | 39–48    | released    | [Milestone_v0.26.md](./milestones/Milestone_v0.26.md) |
| v0.26.1    | Node-to-Frame Broadcast Fix (patch)                              | 49–50    | released    | [Milestone_v0.26.1.md](./milestones/Milestone_v0.26.1.md) |
| v0.27      | REST/MCP Parity Remediation                                      | 51–57    | in progress | [Milestone_v0.27.md](./milestones/Milestone_v0.27.md) |

> Milestone status: **released** = shipped and tagged in git, **in progress** = current sprint, **planned** = future scope.
> v0.23–v0.26 implement the architecture consolidation from `desing-analysis/` (FR22 in `01`, `02` §N, `04` §9) — sequenced one slice per milestone; v0.26 must complete before any public release.

> When scoping a new milestone, skim the **Design Debt Log** in `01_input-ideas.md` for candidates worth promoting into a real task — it's a running list of non-behavioral findings (duplication, test gaps, hardening, style polish) that don't get pulled into planning automatically.
