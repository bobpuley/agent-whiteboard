---
name: agent-whiteboard
description: Core usage of the Agent Whiteboard MCP server — render diagrams, math, charts, HTML and quizzes to a local browser tab, pace the user with wait_done/wait_click, build step-by-step sequences, and export or share the result. Use whenever an explanation, analysis or design discussion would be clearer visually than as text, or when the user mentions the whiteboard.
---

# Agent Whiteboard — core

The whiteboard is a browser tab you control through MCP tools. The user does not draw on it; you draw, they react (Done button, clicks, quiz Submit). Use it when a picture, formula, chart or interactive check beats a paragraph. If the tools are missing, the server is not running or not registered: tell the user to run `npx agent-whiteboard` and add it to `.mcp.json` (see the project README).

## Rules that always apply
1. **`workspace` is required** on `render`, `init_step_frames`, `list_snapshots`, `export_html`. Pick one short name per topic or session (`tcp-lesson`, `q3-sales`). Reuse it so the history stays grouped. Letters, digits, `-`, `_`, `.`, spaces only.
2. **`render` replaces the canvas** and is single-frame. For a multi-frame sequence use `init_step_frames` → `append_frame` × N → `commit_step_frames`.
3. **Never end a turn assuming the user has looked.** After showing something they must read, call `wait_done` (blocks until they click Done, 10-minute timeout). Say what to look at in chat *before* blocking.
4. **Keep chat and canvas complementary.** Canvas = the visual; chat = the narration. Don't paste the diagram source into chat.
5. Every `ok:false` response has an `error` string. Read it, fix the payload, retry once; don't loop blindly.

## Choosing a render type
| Need                                           | `type`      | Notes                                                                                                                                                                               |
|------------------------------------------------|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Flow, sequence, class, ER, gantt, pie, mindmap | `mermaid`   | Must start with a valid keyword (`graph`, `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `mindmap`). Only `graph`/`flowchart` are reliably clickable. |
| Formulas                                       | `katex`     | LaTeX, display mode.                                                                                                                                                                |
| Data charts                                    | `vega-lite` | JSON spec as a string; inline `data.values`.                                                                                                                                        |
| Custom layout, tables, callouts                | `html`      | Sanitized: inline styles only, no `<script>`/`<style>`.                                                                                                                             |
| Hand-made illustrations                        | `svg`       | Inline markup.                                                                                                                                                                      |
| Knowledge check                                | `quiz`      | See the `whiteboard-assessment` skill. `render()` only — not in slideshows or step-frames.                                                                                          |

Keep each frame to one idea. Prefer 5–9 mermaid nodes; split big diagrams into frames.

## Pacing and interaction tools
- `wait_done` — user reviewed; continue. The default pacing tool.
- `wait_click([node_actions])` — user clicks a node/edge of the current mermaid diagram; returns `{id, label, action}`. `node_actions` maps node id → menu strings (e.g. `{"Cache": ["Explain", "Show failure"]}`). A new `wait_click` or `wait_done` supersedes a pending one.
- `wait_quiz` — user submits the quiz on screen; returns questions and answers.
- `step(next|prev)` / `seek(frame)` — move through a committed step-frames sequence.
- `slideshow(slides, delay_ms)` / `slideshow_stop` — unattended auto-advance (demos, ambient display). Not for teaching: the user can't pace it.

## Step-frames pattern
`init_step_frames(frame_type, workspace, title)` returns a builder id. Each `append_frame(id, payload, label)` is shown immediately, so the user watches it grow; interleave `wait_done` for a paced reveal. `type` on a frame overrides the sequence type (mix mermaid and katex). `commit_step_frames(id, node_to_frame)` finalizes and saves; `node_to_frame` lets the user click a node to jump to its frame. Builders expire after 30 minutes idle.

## History, export, sharing
- Every render/commit is saved under `~/.agent-whiteboard/<workspace>/`. `list_snapshots(workspace)` shows what exists; `export(id)` returns a snapshot's source.
- `export_html(workspace, ids)` returns one self-contained HTML document (CDN-linked). Quizzes are replaced by a note. For offline files or a saved path use `POST /export-html` with `{"mode":"offline"}`.
- Sharing a whole workspace with someone else: the browser's Import/export menu (zip). Tell the user; there is no MCP tool for it.

## Specialised skills
`whiteboard-teaching` (lessons, worked examples), `whiteboard-assessment` (quizzes), `whiteboard-analysis` (data and findings), `whiteboard-design` (architecture and decisions).
