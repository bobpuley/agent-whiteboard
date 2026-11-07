---
name: whiteboard-analysis
description: Present and explore data and findings on the Agent Whiteboard — Vega-Lite charts, iterative data exploration, findings walkthroughs and statistics or math derivations. Use when the user wants to analyse, visualise, compare or explain data or results. Builds on the agent-whiteboard skill.
---

# Analysis with the whiteboard

Read `agent-whiteboard` first. The charts are Vega-Lite specs (`type="vega-lite"`, payload = JSON string).

## Chart basics
- Put data inline in `data.values`; keep it to a few hundred rows (summarise first if larger — aggregate in your own tooling, then chart the result).
- Always set axis titles, units and a chart `title`. Choose the mark for the question: line = trend, bar = comparison, point = relationship, area/stack = composition.
- Fix colour meaning across a session (the same series, the same colour) so successive charts compare visually.
- The payload must be valid JSON; a failed render returns `ok:false` with the reason.

## Workflow A — Data exploration loop
1. Render the first chart with a clear `title`; say in chat what it shows.
2. `wait_done`, then take the user's follow-up ("split by region", "log scale", "exclude 2020") and re-render. Each render is saved, so earlier versions stay in History for comparison.
3. Summarise what changed between versions in one sentence each time.
Keep the same `workspace` throughout (`<dataset>-exploration`).

## Workflow B — Findings walkthrough
Build a story with step-frames (`init_step_frames` → `append_frame` × N → `commit_step_frames`), mixing types per frame: `html` question/context → `vega-lite` evidence → `html` interpretation → `html` conclusion/next steps. Label frames "1. Question", "2. Evidence", … and `wait_done` between them when presenting live. End with `export_html(workspace, ids)` if the user wants a shareable report.

## Workflow C — Statistics or math derivation
Pair a `katex` frame (the formula or derivation step) with a `vega-lite` frame illustrating it (distribution, regression line, confidence band). One step per frame. State assumptions in an `html` frame first.

## Workflow D — Compare two datasets or scenarios
Two charts side by side use a single `vega-lite` spec with `hconcat`/`vconcat` or `facet`, not two renders. For before/after, use two step-frames with identical axes so toggling with `step` shows the change.

## Honesty
State sample size, time range and caveats on the canvas (`html` frame or chart subtitle), not only in chat. Don't truncate axes to exaggerate a difference unless you say so.
