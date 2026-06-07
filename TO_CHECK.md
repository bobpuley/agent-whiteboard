1. a click on a node in the step-frames diagram trigger the agent generating a diagram exploding the steps collapsed in the clicked box
2. a click on a node in the step-frames diagram trigger the page/server navigating to another diagram's step
3. a click on a node in a step-frames diagram trigger the agent explaining it
4. a click on a node in a step-frames diagram trigger a popup-menu offering available actions, the user click on one of them triggering the proper effect
5. extend same feature to edges

## Test flows
Item 1 — render a step-frames sequence → call wait_click() → click a node → agent calls render() with an exploded diagram
Item 2 — same setup → after click, call step() to navigate to a target frame based on which node was clicked
Item 3 — same setup → after click, agent outputs an explanation in text

## Test results

| Item                | Mechanism        | Visual highlight          | Node ID extraction               | Status            |
|---------------------|------------------|---------------------------|----------------------------------|-------------------|
| 1 explode node      | ✅ works end-to-end | ✅ confirmed working (re-run) | ❌ returns raw SVG id (label is correct) | re-tested ✅, 1 bug |
| 2 navigate to frame | ✅ works end-to-end | ✅ confirmed working       | ✅ fixed (`flowchart-(.+?)-\d+$`)     | ✅ done             |
| 3 explain node      | ✅ works end-to-end | ✅ confirmed working       | ✅ fixed (`flowchart-(.+?)-\d+$`)     | ✅ done             |
| 4 popup menu        | ❌ not implemented | —                        | —                                | Sprint 13         |
| 5 edge support      | ⚠️ plain clicks work, no popup | —             | —                                | Sprint 13         |

## Known bugs

1. ~~**Node ID regex**~~ — fixed in `Mermaid.svelte` `extractNodeId`: changed `^flowchart-(.+)-\d+$`
   to `flowchart-(.+?)-\d+$` (removed `^` anchor, non-greedy). Verified: `id` now returns `"BE"`
   not `"mermaid-<ts>-flowchart-BE-1"`.

2. ~~**Step cursor skip**~~ — confirmed test artifact: two `step("next")` calls issued in a single
   agent response executed concurrently. Sequential calls work correctly. Not a real bug.

3. **`click-demo.js` REST path broken**: `POST /wait-click` does not broadcast `set_node_actions
   enabled:true` to arm the browser. Only the MCP `wait_click()` tool arms the browser. The demo
   script uses the REST path and therefore nodes are never made clickable.