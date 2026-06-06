#!/usr/bin/env node
// Manual demo — renders a 3-node flowchart, waits for a node/edge click, logs the result.
// Usage: node manualtests/click-demo.js [-p <port>]
//
// 1. Start the server: npm run dev
// 2. In a second terminal: node manualtests/click-demo.js
// 3. Click any node or edge in the browser — the click event is logged here.

import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    port: { type: "string", short: "p", default: "3000" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`
Usage: node manualtests/click-demo.js [OPTIONS]

Options:
  -p, --port <port>   Server port (default: 3000)
  -h, --help          Show this help
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

// ── 1. Render a 3-node flowchart ──────────────────────────────────────────────

const diagram = `graph TD
  Client -->|HTTP| Server
  Server -->|Query| DB[(Database)]
  DB -->|Result| Server
  Server -->|Response| Client`;

console.log(`\n🖼   Rendering diagram on ${BASE} …`);
const renderRes = await post("/render", {
  type: "mermaid",
  payload: diagram,
  options: { title: "Click any node or edge" },
});

if (!renderRes.ok) {
  console.error("✗ render failed:", renderRes.error);
  process.exit(1);
}
console.log("   ✓ diagram rendered — open the browser tab and click a node or edge");

// ── 2. Long-poll for the click ────────────────────────────────────────────────

console.log("   ⏳ waiting for click (POST /wait-click) …\n");

const clickRes = await fetch(`${BASE}/wait-click`, { method: "POST" });
const event = await clickRes.json();

// ── 3. Log the result ─────────────────────────────────────────────────────────

if (event.type === "timeout") {
  console.log("   ⌛ timed out — no click received within 10 minutes");
} else {
  console.log(`   ✓ click received:`);
  console.log(`      type  : ${event.type}`);
  console.log(`      id    : ${event.id}`);
  console.log(`      label : ${event.label}`);
}

console.log();
