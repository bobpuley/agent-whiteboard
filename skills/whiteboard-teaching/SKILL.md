---
name: whiteboard-teaching
description: Teach or train a user with the Agent Whiteboard — concept explainers, progressive build-ups, worked examples, guided lessons and learner-driven branching. Use when the user wants to learn, be tutored, onboarded or trained on a topic and visuals would help. Builds on the agent-whiteboard skill.
---

# Teaching with the whiteboard

Read `agent-whiteboard` first for the tool rules (workspace, `wait_done`, render types). This skill is the lesson craft.

## Before you start
Ask at most two things if unknown: the learner's current level and what they want to be able to do afterwards. Pick one workspace per lesson (`<topic>-lesson`).

## Workflow A — Concept explainer (default loop)
1. `render` one visual for one idea, with a `title`.
2. Narrate in 2–4 sentences: what to look at, what it means.
3. `wait_done`.
4. Check understanding in one line ("What would happen if the server dropped the SYN?"), then continue or re-explain with a different visual.

## Workflow B — Progressive build-up
Use when the final picture is too big to show at once.
1. `init_step_frames(frame_type, workspace, title)`.
2. `append_frame` the simplest version, labelled "1. …". Narrate. `wait_done`.
3. Each next frame adds *one* element to the previous one (copy the earlier source, add a line) so the learner sees only the delta.
4. `commit_step_frames` at the end so the whole sequence can be replayed with `step`/`seek`. Add `node_to_frame` so they can click a node to revisit its frame.

## Workflow C — Worked example (math or algorithm)
One `katex` or `mermaid` frame per step: state before, operation, state after. Label frames by the operation ("Swap 3 and 5"). Pause with `wait_done` every 1–2 steps; for long derivations ask "want to try the next step yourself?" and wait in chat before revealing it.

## Workflow D — Guided lesson
Outline in chat (3–6 sections), then per section run A or B. Finish with a recap diagram that connects the sections, then a quiz (`whiteboard-assessment`). Keep the lesson in one workspace so it can be exported with `export_html`.

## Workflow E — Learner-driven branching
Render a mermaid map of the topic and call `wait_click` with `node_actions` such as `{"Cache": ["Explain", "Quiz me"]}`. Act on the returned `id`/`action`: explain that node, then re-render the map with visited nodes styled differently and arm `wait_click` again. Stop when the learner says so or all nodes are covered.

## Style
- One idea per frame; label every step; no more than ~9 nodes.
- Reuse the same colours/shapes for the same concept across frames.
- Ask before moving on if the learner seems lost; `seek` back to the relevant frame instead of re-rendering.
- Don't dump the source of a diagram into chat.
