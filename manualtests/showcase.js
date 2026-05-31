#!/usr/bin/env node
// Manual showcase — exercises every renderer via a server-side slideshow.
// Usage: node manualtests/showcase.js [-p <port>] [-d <delay_ms>] [-h]

import { parseArgs } from "node:util";

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    port:  { type: "string",  short: "p", default: "3000" },
    delay: { type: "string",  short: "d", default: "5000" },
    help:  { type: "boolean", short: "h", default: false  },
  },
  strict: true,
});

if (values.help) {
  console.log(`
Usage: node manualtests/showcase.js [OPTIONS]

Options:
  -p, --port <port>     Server port (default: 3000)
  -d, --delay <ms>      Delay between slides in ms (default: 5000)
  -h, --help            Show this help
`);
  process.exit(0);
}

const PORT     = values.port;
const DELAY_MS = parseInt(values.delay, 10);
const BASE     = `http://localhost:${PORT}`;

console.log(`\n🎬  Showcase — server: ${BASE}  delay: ${DELAY_MS}ms\n`);

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Slide definitions ─────────────────────────────────────────────────────────

const slides = [
  // 1. Mermaid — load-balanced architecture
  {
    type: "mermaid",
    title: "1 / 6 — Mermaid",
    payload: `graph TD
  Client -->|HTTP| LB[Load Balancer]
  LB --> A[App Server A]
  LB --> B[App Server B]
  A --> Cache[(Redis Cache)]
  B --> Cache
  A --> DB[(Primary DB)]
  B --> DB
  DB -->|replicate| R[(Replica)]`,
  },

  // 2. SVG — concentric circles geometry
  {
    type: "svg",
    title: "2 / 6 — SVG",
    payload: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" fill="url(#bg)" rx="12"/>
  <circle cx="200" cy="200" r="140" fill="none" stroke="#e94560" stroke-width="1.5" opacity="0.5"/>
  <circle cx="200" cy="200" r="100" fill="none" stroke="#e94560" stroke-width="1.5" opacity="0.6"/>
  <circle cx="200" cy="200" r="60"  fill="none" stroke="#e94560" stroke-width="1.5" opacity="0.7"/>
  <circle cx="200" cy="200" r="28"  fill="#e94560"/>
  <line x1="60"  y1="200" x2="340" y2="200" stroke="#a8dadc" stroke-width="1" opacity="0.35"/>
  <line x1="200" y1="60"  x2="200" y2="340" stroke="#a8dadc" stroke-width="1" opacity="0.35"/>
  <line x1="101" y1="101" x2="299" y2="299" stroke="#a8dadc" stroke-width="1" opacity="0.25"/>
  <line x1="299" y1="101" x2="101" y2="299" stroke="#a8dadc" stroke-width="1" opacity="0.25"/>
  <circle cx="200" cy="60"  r="7" fill="#f5a623"/>
  <circle cx="340" cy="200" r="7" fill="#f5a623"/>
  <circle cx="200" cy="340" r="7" fill="#f5a623"/>
  <circle cx="60"  cy="200" r="7" fill="#f5a623"/>
  <circle cx="101" cy="101" r="5" fill="#a8dadc"/>
  <circle cx="299" cy="101" r="5" fill="#a8dadc"/>
  <circle cx="299" cy="299" r="5" fill="#a8dadc"/>
  <circle cx="101" cy="299" r="5" fill="#a8dadc"/>
</svg>`,
  },

  // 3. HTML — capability card (inline styles; DOMPurify strips <style> blocks)
  {
    type: "html",
    title: "3 / 6 — HTML",
    payload: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
  <h1 style="margin:0 0 4px;font-size:28px;color:#1a1a2e">HTML Renderer</h1>
  <p style="margin:0 0 24px;color:#666;font-size:14px">Sanitized via DOMPurify — inline styles only</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <div style="background:#e8f4fd;border-left:4px solid #2196f3;padding:14px 16px;border-radius:4px">
      <div style="font-size:11px;font-weight:700;color:#2196f3;text-transform:uppercase;letter-spacing:.5px">Headings &amp; Text</div>
      <div style="font-size:13px;color:#333;margin-top:6px">h1–h6, p, span, strong, em, code</div>
    </div>
    <div style="background:#f3e8fd;border-left:4px solid #9c27b0;padding:14px 16px;border-radius:4px">
      <div style="font-size:11px;font-weight:700;color:#9c27b0;text-transform:uppercase;letter-spacing:.5px">Layout</div>
      <div style="font-size:13px;color:#333;margin-top:6px">div, section, table, ul, ol, li</div>
    </div>
    <div style="background:#e8fdf0;border-left:4px solid #4caf50;padding:14px 16px;border-radius:4px">
      <div style="font-size:11px;font-weight:700;color:#4caf50;text-transform:uppercase;letter-spacing:.5px">Inline Styles</div>
      <div style="font-size:13px;color:#333;margin-top:6px">color, background, border, grid, flex</div>
    </div>
    <div style="background:#fdf3e8;border-left:4px solid #ff9800;padding:14px 16px;border-radius:4px">
      <div style="font-size:11px;font-weight:700;color:#ff9800;text-transform:uppercase;letter-spacing:.5px">Stripped</div>
      <div style="font-size:13px;color:#333;margin-top:6px">&lt;script&gt;, &lt;style&gt;, event attrs</div>
    </div>
  </div>
</div>`,
  },

  // 4. KaTeX — Bayes + Maxwell + Euler
  {
    type: "katex",
    title: "4 / 6 — KaTeX",
    payload: String.raw`P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)} \qquad \text{(Bayes' Theorem)}\\[18pt]
\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0} \qquad
\nabla \times \mathbf{B} = \mu_0 \mathbf{J} + \mu_0\varepsilon_0\frac{\partial \mathbf{E}}{\partial t} \\[18pt]
e^{i\pi} + 1 = 0`,
  },

  // 5. Vega-Lite — request latency by percentile
  {
    type: "vega-lite",
    title: "5 / 6 — Vega-Lite",
    payload: JSON.stringify({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: 420,
      height: 260,
      title: { text: "Request latency by tier", fontSize: 14 },
      data: {
        values: [
          { tier: "p50",  ms: 12  },
          { tier: "p75",  ms: 28  },
          { tier: "p90",  ms: 67  },
          { tier: "p95",  ms: 110 },
          { tier: "p99",  ms: 340 },
          { tier: "p999", ms: 820 },
        ],
      },
      mark: { type: "bar", cornerRadiusEnd: 3 },
      encoding: {
        x: { field: "tier", type: "ordinal", axis: { labelAngle: 0 }, sort: null },
        y: { field: "ms",   type: "quantitative", title: "Latency (ms)" },
        color: { field: "ms", type: "quantitative", scale: { scheme: "orangered" }, legend: null },
        tooltip: [{ field: "tier", title: "Percentile" }, { field: "ms", title: "ms" }],
      },
    }),
  },

  // 6. Step-frames — cache miss / DB fetch / cache store sequence (frame 1 of 3)
  // Note: the slideshow shows frame 0 of the step-frames sequence;
  // use step() / Prev+Next buttons in the browser to navigate within the sequence.
  {
    type: "step-frames",
    title: "6 / 6 — Step-Frames (use Prev/Next)",
    payload: JSON.stringify({
      frame_type: "mermaid",
      frames: [
        {
          label: "Step 1 — Cache Miss",
          payload: `sequenceDiagram
  participant C as Client
  participant S as Server
  participant Cache as Redis
  participant DB as Database
  C->>S: GET /user/42
  S->>Cache: GET user:42
  Cache-->>S: (nil)`,
        },
        {
          label: "Step 2 — DB Fetch",
          payload: `sequenceDiagram
  participant C as Client
  participant S as Server
  participant Cache as Redis
  participant DB as Database
  C->>S: GET /user/42
  S->>Cache: GET user:42
  Cache-->>S: (nil)
  S->>DB: SELECT * FROM users WHERE id=42
  DB-->>S: {id:42, name:...}`,
        },
        {
          label: "Step 3 — Cache Store & Response",
          payload: `sequenceDiagram
  participant C as Client
  participant S as Server
  participant Cache as Redis
  participant DB as Database
  C->>S: GET /user/42
  S->>Cache: GET user:42
  Cache-->>S: (nil)
  S->>DB: SELECT * FROM users WHERE id=42
  DB-->>S: {id:42, name:...}
  S->>Cache: SET user:42 EX 300
  S-->>C: 200 OK {id:42,...}`,
        },
      ],
    }),
  },
];

// ── Run slideshow ─────────────────────────────────────────────────────────────

const totalMs = slides.length * DELAY_MS;

console.log(`▶  Starting ${slides.length}-slide tour (${totalMs / 1000}s total)…`);

const result = await post("/slideshow", { slides, delay_ms: DELAY_MS });
if (!result.ok) {
  console.error("✗ slideshow failed:", result.error);
  process.exit(1);
}
console.log(`   ✓ slideshow started — slides advance every ${DELAY_MS / 1000}s`);

// Wait for all slides to be shown, then stop.
await new Promise((r) => setTimeout(r, totalMs));

await post("/slideshow/stop", {});
console.log("\n✅  Showcase complete.\n");
