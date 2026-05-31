#!/usr/bin/env node
// Manual showcase — exercises every renderer and the step-through feature.
// Usage: node manualtests/showcase.js [-p <port>] [--controlled | --normal] [-h]

import { parseArgs } from "node:util";
import { createInterface } from "node:readline";

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    port:       { type: "string",  short: "p", default: "3000" },
    controlled: { type: "boolean",             default: false   },
    normal:     { type: "boolean",             default: false   },
    help:       { type: "boolean", short: "h", default: false   },
  },
  strict: true,
});

if (values.help) {
  console.log(`
Usage: node manualtests/showcase.js [OPTIONS]

Options:
  -p, --port <port>   Server port (default: 3000)
  --controlled        Pause and wait for Enter after each step
  --normal            Wait 5 seconds after each step (default)
  -h, --help          Show this help
`);
  process.exit(0);
}

const PORT   = values.port;
const MODE   = values.controlled ? "controlled" : "normal";
const BASE   = `http://localhost:${PORT}`;
const DELAY  = 5000; // ms for normal mode

console.log(`\n🎬  Showcase — server: ${BASE}  mode: ${MODE}\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pause(label) {
  if (MODE === "controlled") {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((resolve) => rl.question(`  ↵  ${label} — press Enter to continue… `, () => { rl.close(); resolve(); }));
  } else {
    process.stdout.write(`  ⏳  ${label} — waiting ${DELAY / 1000}s…`);
    await new Promise((r) => setTimeout(r, DELAY));
    process.stdout.write(" done\n");
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function render(type, payload, title) {
  process.stdout.write(`\n▶  ${title}\n`);
  const result = await post("/render", { type, payload, options: { title } });
  if (!result.ok) {
    console.error("   ✗ render failed:", result.error);
    process.exit(1);
  }
  console.log("   ✓ ok");
}

async function step(direction) {
  const result = await post("/step", { direction });
  if (!result.ok) {
    console.error("   ✗ step failed:", result.error);
    process.exit(1);
  }
  return result;
}

// ── Showcase steps ────────────────────────────────────────────────────────────

// 1. Mermaid flowchart — system architecture
await render(
  "mermaid",
  `flowchart TD
    A[User] -->|asks question| B[Claude Agent]
    B -->|calls render| C[MCP Server]
    C -->|WebSocket push| D[Browser]
    D -->|renders| E[Whiteboard]
    B -->|calls export| C
    C -->|returns source| B`,
  "Mermaid — system architecture flowchart"
);
await pause("flowchart rendered");

// 2. Mermaid sequence diagram — MCP call flow
await render(
  "mermaid",
  `sequenceDiagram
    participant A as Agent
    participant S as MCP Server
    participant B as Browser

    A->>S: render(type="mermaid", payload)
    S->>S: validate payload
    S->>B: WebSocket push {action:replace}
    B->>B: Mermaid.js renders SVG
    S-->>A: {ok: true}

    A->>S: export()
    S-->>A: {ok: true, data: "..."}`,
  "Mermaid — MCP call sequence diagram"
);
await pause("sequence diagram rendered");

// 3. KaTeX — neural net activation formula
await render(
  "katex",
  String.raw`\hat{y} = \sigma\!\left(\sum_{i=1}^{n} w_i x_i + b\right) \qquad \sigma(z) = \frac{1}{1+e^{-z}}`,
  "KaTeX — neural network activation formula"
);
await pause("KaTeX formula rendered");

// 4. SVG — inline vector graphic
await render(
  "svg",
  `<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif">
  <rect width="400" height="200" fill="#1a1a2e"/>
  <circle cx="200" cy="100" r="60" fill="none" stroke="#e94560" stroke-width="3"/>
  <circle cx="200" cy="100" r="40" fill="none" stroke="#0f3460" stroke-width="3"/>
  <circle cx="200" cy="100" r="20" fill="#e94560"/>
  <line x1="200" y1="40" x2="200" y2="10" stroke="#e94560" stroke-width="2"/>
  <line x1="200" y1="160" x2="200" y2="190" stroke="#e94560" stroke-width="2"/>
  <line x1="140" y1="100" x2="10" y2="100" stroke="#e94560" stroke-width="2"/>
  <line x1="260" y1="100" x2="390" y2="100" stroke="#e94560" stroke-width="2"/>
  <text x="200" y="175" text-anchor="middle" fill="white" font-size="14">Target</text>
</svg>`,
  "SVG — inline vector graphic"
);
await pause("SVG rendered");

// 5. Vega-Lite — training loss chart
await render(
  "vega-lite",
  JSON.stringify({
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 500,
    height: 280,
    title: "Training loss over epochs",
    data: {
      values: [
        { epoch: 1, loss: 2.41 }, { epoch: 2, loss: 1.89 },
        { epoch: 3, loss: 1.43 }, { epoch: 4, loss: 1.12 },
        { epoch: 5, loss: 0.87 }, { epoch: 6, loss: 0.71 },
        { epoch: 7, loss: 0.60 }, { epoch: 8, loss: 0.53 },
        { epoch: 9, loss: 0.48 }, { epoch: 10, loss: 0.45 },
      ],
    },
    mark: { type: "line", point: true, color: "#e94560" },
    encoding: {
      x: { field: "epoch", type: "quantitative", title: "Epoch" },
      y: { field: "loss",  type: "quantitative", title: "Loss", scale: { zero: false } },
    },
  }),
  "Vega-Lite — training loss line chart"
);
await pause("Vega-Lite chart rendered");

// 6. Step-through — flowchart built incrementally (5 frames)
await render(
  "step-frames",
  JSON.stringify({
    frame_type: "mermaid",
    frames: [
      { label: "Step 1 — single node",   payload: "graph TD\n    A[Start]" },
      { label: "Step 2 — add decision",  payload: "graph TD\n    A[Start] --> B{Is data valid?}" },
      { label: "Step 3 — happy path",    payload: "graph TD\n    A[Start] --> B{Is data valid?}\n    B -->|Yes| C[Process data]" },
      { label: "Step 4 — error path",    payload: "graph TD\n    A[Start] --> B{Is data valid?}\n    B -->|Yes| C[Process data]\n    B -->|No| D[Return error]" },
      { label: "Step 5 — complete flow", payload: "graph TD\n    A[Start] --> B{Is data valid?}\n    B -->|Yes| C[Process data]\n    B -->|No| D[Return error]\n    C --> E[Return result]\n    D --> F[End]\n    E --> F" },
    ],
  }),
  "Step-through — incremental flowchart (frame 1/5)"
);
await pause("frame 1/5");

for (let i = 2; i <= 5; i++) {
  const { current_frame, total_frames } = await step("next");
  console.log(`   ✓ frame ${current_frame + 1}/${total_frames}`);
  await pause(`frame ${current_frame + 1}/${total_frames}`);
}

console.log("\n✅  Showcase complete.\n");
