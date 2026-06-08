#!/usr/bin/env node
// Manual demo — renders a Mermaid diagram and demonstrates node/edge click handling.
//
// Modes:
//   click (default) — renders a flowchart, long-polls /wait-click, logs the click event
//   nav             — renders a step-frames sequence with node_to_frame; clicking a mapped
//                     node jumps directly to its frame without any agent long-poll
//
// Usage:
//   node manualtests/click-demo.js               # click mode
//   node manualtests/click-demo.js --mode nav    # autonomous nav mode
//   node manualtests/click-demo.js -p 3001       # custom port

import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    port: { type: "string", short: "p", default: "3000" },
    mode: { type: "string", short: "m", default: "click" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`
Usage: node manualtests/click-demo.js [OPTIONS]

Options:
  -m, --mode <mode>   Demo mode: "click" (default), "nav", or "popup"
  -p, --port <port>   Server port (default: 3000)
  -h, --help          Show this help

Modes:
  click   Renders a flowchart and long-polls /wait-click. The agent (this script)
          waits for you to click a node or edge, then logs the result.

  nav     Renders a step-frames sequence with options.node_to_frame set.
          Clicking a mapped node in the browser jumps directly to its frame
          via POST /seek — no agent long-poll required. The script just watches
          exports to show you it worked.

  popup   Renders a flowchart and calls wait_click with node_actions pre-registered
          for node B. Clicking node B shows a popup menu ("Explain this" / "Drill down");
          selecting an action resolves wait_click and logs the chosen action.
          Clicking an unregistered node returns a plain click (action: null).
`);
  process.exit(0);
}

const BASE = `http://localhost:${values.port}`;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Mode: click ───────────────────────────────────────────────────────────────

async function runClickMode() {
  const diagram = `graph TD
  Client -->|HTTP| Server
  Server -->|Query| DB[(Database)]
  DB -->|Result| Server
  Server -->|Response| Client`;

  console.log(`\nRendering diagram on ${BASE} …`);
  const renderRes = await post("/render", {
    type: "mermaid",
    payload: diagram,
    options: { title: "Click any node or edge" },
  });

  if (!renderRes.ok) {
    console.error("render failed:", renderRes.error);
    process.exit(1);
  }
  console.log("  diagram rendered — click a node or edge in the browser");
  console.log("  waiting for click (POST /wait-click) …\n");

  const clickRes = await fetch(`${BASE}/wait-click`, { method: "POST" });
  const event = await clickRes.json();

  if (event.type === "timeout") {
    console.log("  timed out — no click received within 10 minutes");
  } else {
    console.log("  click received:");
    console.log(`    type  : ${event.type}`);
    console.log(`    id    : ${event.id}`);
    console.log(`    label : ${event.label}`);
  }
  console.log();
}

// ── Mode: nav (node_to_frame autonomous navigation) ──────────────────────────

async function runNavMode() {
  const framesPayload = JSON.stringify({
    frame_type: "mermaid",
    frames: [
      {
        label: "Overview — click a layer to drill in",
        payload: `graph TD
  FE[Frontend]
  BE[Backend]
  DB[(Database)]
  FE --> BE --> DB`,
      },
      {
        label: "Frontend detail",
        payload: `graph TD
  FE[Frontend]
  React[React SPA]
  Vite[Vite dev server]
  FE --> React --> Vite`,
      },
      {
        label: "Backend detail",
        payload: `graph TD
  BE[Backend]
  Hono[Hono HTTP server]
  MCP[MCP server]
  BE --> Hono
  BE --> MCP`,
      },
      {
        label: "Database detail",
        payload: `graph TD
  DB[(Database)]
  Pg[(PostgreSQL)]
  Redis[(Redis cache)]
  DB --> Pg
  DB --> Redis`,
      },
    ],
  });

  // node_to_frame: clicking FE → frame 1, BE → frame 2, DB → frame 3.
  const nodeToFrame = { FE: 1, BE: 2, DB: 3 };

  console.log(`\nRendering step-frames with node_to_frame on ${BASE} …`);
  console.log("  node_to_frame:", nodeToFrame);
  const renderRes = await post("/render", {
    type: "step-frames",
    payload: framesPayload,
    options: {
      title: "Click a layer node to jump to its detail frame",
      node_to_frame: nodeToFrame,
    },
  });

  if (!renderRes.ok) {
    console.error("render failed:", renderRes.error);
    process.exit(1);
  }

  console.log("  step-frames rendered (frame 0 shown)");
  console.log("  click FE, BE, or DB in the browser to jump directly to its detail frame");
  console.log("  (no wait_click() involved — the browser calls POST /seek autonomously)");
  console.log("\n  Press Ctrl-C to exit.\n");

  // Poll export every second to show the current frame index.
  let lastFrame = -1;
  const poll = setInterval(async () => {
    try {
      const res = await fetch(`${BASE}/export`);
      const body = await res.json();
      if (!body.ok) return;
      // Parse current frame from the exported raw payload (not available directly via export).
      // Instead, just note that export returns the full frames JSON — we can only observe
      // frame changes via the seek endpoint response. For demo purposes, just print a reminder.
      if (lastFrame === -1) {
        lastFrame = 0;
        console.log("  [poll] export OK — click a node to see autonomous frame navigation");
      }
    } catch { /* server may not be running */ }
  }, 2000);

  // Keep alive until Ctrl-C.
  process.on("SIGINT", () => {
    clearInterval(poll);
    console.log("\n  done.\n");
    process.exit(0);
  });

  await new Promise(() => { /* run until Ctrl-C */ });
}

// ── Mode: popup (node_actions popup menu) ────────────────────────────────────

async function runPopupMode() {
  const diagram = `graph TD
  Client[Client] -->|HTTP| Server[Server]
  Server -->|Query| DB[(Database)]
  DB -->|Result| Server
  Server -->|Response| Client`;

  console.log(`\nRendering diagram on ${BASE} …`);
  const renderRes = await post("/render", {
    type: "mermaid",
    payload: diagram,
    options: { title: "Click node B (Server) for a popup menu, or any other node for a plain click" },
  });

  if (!renderRes.ok) {
    console.error("render failed:", renderRes.error);
    process.exit(1);
  }
  console.log("  diagram rendered");
  console.log("  node_actions registered for node \"Server\": [\"Explain this\", \"Drill down\"]");
  console.log("  arming wait_click with node_actions …\n");

  // Use MCP REST path with node_actions sent via the MCP-only path.
  // Since POST /wait-click is plain-click only, we simulate the MCP flow via
  // a direct /wait-click call here (which accepts plain clicks), then separately
  // demonstrate that the browser would fire /node-click with an action field.
  //
  // For a full popup demo, use the MCP wait_click(node_actions=...) tool directly
  // from Claude Code: the browser popup fires POST /node-click with the action field.

  console.log("  NOTE: POST /wait-click (REST) does not support node_actions.");
  console.log("  This demo arms /wait-click and simulates the popup by firing /node-click with action.");
  console.log("  In production, use the MCP wait_click(node_actions=...) tool from Claude Code.\n");

  // Arm wait-click in background.
  const waitPromise = fetch(`${BASE}/wait-click`, { method: "POST" });

  // Brief pause to let the long-poll register.
  await new Promise((r) => setTimeout(r, 100));

  // Simulate user selecting "Drill down" from the popup on node Server.
  console.log("  Simulating: user clicked node \"Server\" and selected \"Drill down\" from popup …");
  const clickRes = await post("/node-click", {
    type: "node",
    id: "Server",
    label: "Server",
    action: "Drill down",
  });
  console.log("  /node-click response:", clickRes);

  const event = await (await waitPromise).json();
  console.log("\n  wait_click resolved:");
  console.log(`    type   : ${event.type}`);
  console.log(`    id     : ${event.id}`);
  console.log(`    label  : ${event.label}`);
  console.log(`    action : ${event.action}`);
  console.log();
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

if (values.mode === "nav") {
  await runNavMode();
} else if (values.mode === "popup") {
  await runPopupMode();
} else {
  await runClickMode();
}
