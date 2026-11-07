---
name: whiteboard-design
description: Run design and architecture sessions on the Agent Whiteboard — system diagrams refined iteratively, option comparisons the user decides between by clicking, codebase explanations, and onboarding material. Use when discussing architecture, flows, trade-offs or explaining how a system works. Builds on the agent-whiteboard skill.
---

# Design and architecture with the whiteboard

Read `agent-whiteboard` first. Mermaid is the main tool: `flowchart`/`graph` for structure and clicks, `sequenceDiagram` for interactions, `classDiagram`/`erDiagram` for models. State machines: draw them as a `flowchart` (the validator only accepts the keywords listed in the core skill).

## Workflow A — Iterative system design
1. Render a high-level `flowchart` (5–9 boxes). `wait_click` with `node_actions` for the components worth deepening, e.g. `{"API": ["Expand", "Alternatives"], "DB": ["Expand", "Scaling"]}`.
2. On a click, render the zoomed diagram of that component (or a step-frames drill-down). Keep a breadcrumb in the `title` ("System › API").
3. Return to the overview with the explored nodes marked, and repeat until the user is satisfied.
Record decisions in chat as they are made.

## Workflow B — Option comparison and decision
Show 2–3 alternatives as separate frames in one step-frames sequence (same structure and axes so differences pop), followed by an `html` frame with a short comparison table (criteria × options, plain inline styles). Then ask for a decision with `wait_click` on a mermaid node per option, or simply ask in chat. Finish by rendering the chosen design and the decision rationale.

## Workflow C — Explain existing code or a protocol
Read the code first, then draw: component/flow diagram → sequence diagram for the key scenario → state or error paths. Step-frames with `wait_done` between frames work well for request lifecycles. Use real names from the code in node labels so the diagram maps to files.

## Workflow D — Onboarding pack
Compose a short slideshow of step-frames sequences (what the system is → how a request flows → where to find things), end with a quiz via `whiteboard-assessment`, and `export_html` the workspace so newcomers can read it without the tool.

## Diagram hygiene
- Label edges with the action or protocol, not just arrows.
- Group with `subgraph` rather than adding nodes; keep one direction (`LR` or `TD`) per diagram.
- Mark external systems and the part under discussion with different shapes or styles, consistently across frames.
- Mermaid syntax errors come back as `ok:false`; fix and retry rather than simplifying the content away.
