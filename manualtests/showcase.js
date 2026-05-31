#!/usr/bin/env node
// Manual showcase — exercises every renderer via a server-side slideshow.
// Usage: node manualtests/showcase.js [-p <port>] [-d <delay_ms>] [-t <type,...>] [-h]

import { parseArgs } from "node:util";

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    port:  { type: "string",  short: "p", default: "3000"      },
    delay: { type: "string",  short: "d", default: "5000"      },
    type:  { type: "string",  short: "t", default: ""          },
    help:  { type: "boolean", short: "h", default: false       },
  },
  strict: true,
});

if (values.help) {
  console.log(`
Usage: node manualtests/showcase.js [OPTIONS]

Options:
  -p, --port <port>     Server port (default: 3000)
  -d, --delay <ms>      Delay between slides in ms (default: 5000)
  -t, --type <types>    Comma-separated types to include
                        (mermaid, svg, html, katex, vega-lite, step-frames)
                        Omit to show all slides.
  -h, --help            Show this help
`);
  process.exit(0);
}

const TYPE_FILTER = values.type
  ? new Set(values.type.split(",").map((t) => t.trim()).filter(Boolean))
  : null;

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

// ── Apply type filter ─────────────────────────────────────────────────────────

const activeSlides = TYPE_FILTER ? slides.filter((s) => TYPE_FILTER.has(s.type)) : slides;

if (activeSlides.length === 0) {
  console.error(`✗ No slides match type filter: ${[...TYPE_FILTER].join(", ")}`);
  console.error(`  Available types: ${[...new Set(slides.map((s) => s.type))].join(", ")}`);
  process.exit(1);
}

// ── Run slideshow ─────────────────────────────────────────────────────────────

// Count the actual number of timer ticks the server will fire.
// step-frames slides expand into one tick per frame (server-side B2 behaviour);
// plain slides are one tick each.
function countTicks(slideList) {
  return slideList.reduce((acc, s) => {
    if (s.type === "step-frames") {
      return acc + JSON.parse(s.payload).frames.length;
    }
    return acc + 1;
  }, 0);
}

const totalTicks = countTicks(activeSlides);
const totalMs = totalTicks * DELAY_MS;

if (TYPE_FILTER) {
  console.log(`   Filter: ${[...TYPE_FILTER].join(", ")} (${activeSlides.length} of ${slides.length} slides)`);
}
const tickNote = totalTicks !== activeSlides.length ? ` (${totalTicks} ticks after step-frames expansion)` : "";
console.log(`▶  Starting ${activeSlides.length}-slide tour (${totalMs / 1000}s total${tickNote})…`);

const result = await post("/slideshow", { slides: activeSlides, delay_ms: DELAY_MS });
if (!result.ok) {
  console.error("✗ slideshow failed:", result.error);
  process.exit(1);
}
console.log(`   ✓ slideshow started — slides advance every ${DELAY_MS / 1000}s`);

// Wait for all slides to be shown, then stop.
await new Promise((r) => setTimeout(r, totalMs));

await post("/slideshow/stop", {});
console.log("   ✓ server slideshow done");

// ── Section 7 — Client-managed slideshow ──────────────────────────────────────
//
// The agent renders each slide individually via POST /render, choosing the
// type and delay per slide.  Demonstrates:
//   • mixed content types in a single sequence
//   • non-constant intervals (each slide has its own delay_ms)
//   • step-frames driven by the client: the agent calls POST /step for each
//     frame at its own pace instead of delegating to the server timer
//
// Slide definitions carry an optional `delay_ms` (overrides DELAY_MS) and,
// for step-frames only, an optional `frame_delay_ms` (per-frame pause).

const clientSlides = [
  // 7a — quick annotation: short pause, just enough to read
  {
    type: "html",
    title: "7a — HTML (2 s)",
    delay_ms: 2000,
    payload: `<div style="font-family:system-ui,sans-serif;padding:32px 40px;max-width:520px">
  <h2 style="margin:0 0 8px;color:#1a1a2e">Client-managed slideshow</h2>
  <p style="color:#555;margin:0 0 20px">Each slide is rendered individually by the agent.<br>
  Delays vary: 2 s → 6 s → 3 s per frame.</p>
  <code style="background:#f3f3f3;padding:6px 10px;border-radius:4px;font-size:13px">
    POST /render  ×3  +  POST /step  ×2
  </code>
</div>`,
  },

  // 7b — data chart: give it more time to read
  {
    type: "vega-lite",
    title: "7b — Vega-Lite (6 s)",
    delay_ms: 6000,
    payload: JSON.stringify({
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: 380,
      height: 220,
      title: { text: "Deployment pipeline — stage durations (s)", fontSize: 13 },
      data: {
        values: [
          { stage: "Install",  s: 12 },
          { stage: "Typecheck", s: 8  },
          { stage: "Test",     s: 34 },
          { stage: "Build",    s: 21 },
          { stage: "Publish",  s: 6  },
        ],
      },
      mark: { type: "bar", cornerRadiusEnd: 3 },
      encoding: {
        x: { field: "stage", type: "ordinal",      axis: { labelAngle: 0 }, sort: null },
        y: { field: "s",     type: "quantitative", title: "Duration (s)" },
        color: {
          field: "s", type: "quantitative",
          scale: { scheme: "blues" }, legend: null,
        },
        tooltip: [{ field: "stage", title: "Stage" }, { field: "s", title: "s" }],
      },
    }),
  },

  // 7c — step-frames: client calls POST /step for each frame (3 s between frames)
  // The server just stores the sequence; the agent decides when to advance.
  {
    type: "step-frames",
    title: "7c — Step-Frames, client-driven (3 s/frame)",
    frame_delay_ms: 3000,
    payload: JSON.stringify({
      frame_type: "mermaid",
      frames: [
        {
          label: "Phase 1 — Install & Typecheck",
          payload: `graph LR
  A([Push]) --> B[Install deps]
  B --> C[Typecheck]
  style A fill:#4caf50,color:#fff
  style B fill:#2196f3,color:#fff
  style C fill:#2196f3,color:#fff`,
        },
        {
          label: "Phase 2 — Test & Build",
          payload: `graph LR
  A([Push]) --> B[Install deps]
  B --> C[Typecheck]
  C --> D[Run tests]
  D --> E[Build]
  style A fill:#4caf50,color:#fff
  style B fill:#9e9e9e,color:#fff
  style C fill:#9e9e9e,color:#fff
  style D fill:#2196f3,color:#fff
  style E fill:#2196f3,color:#fff`,
        },
        {
          label: "Phase 3 — Publish",
          payload: `graph LR
  A([Push]) --> B[Install deps]
  B --> C[Typecheck]
  C --> D[Run tests]
  D --> E[Build]
  E --> F([Publish])
  style A fill:#4caf50,color:#fff
  style B fill:#9e9e9e,color:#fff
  style C fill:#9e9e9e,color:#fff
  style D fill:#9e9e9e,color:#fff
  style E fill:#9e9e9e,color:#fff
  style F fill:#4caf50,color:#fff`,
        },
      ],
    }),
  },
];

async function runClientSlideshow(slideList) {
  for (const slide of slideList) {
    const { type, payload, title, delay_ms = DELAY_MS, frame_delay_ms } = slide;
    process.stdout.write(`\n▶  ${title}\n`);

    const renderRes = await post("/render", { type, payload, options: { title } });
    if (!renderRes.ok) {
      console.error(`   ✗ render failed: ${renderRes.error}`);
      process.exit(1);
    }
    console.log("   ✓ rendered");

    if (type === "step-frames") {
      // Frame 0 is already on screen; advance the remaining frames via POST /step.
      const spec = JSON.parse(payload);
      const frameCount = spec.frames.length;
      const pause = frame_delay_ms ?? delay_ms;
      for (let i = 1; i < frameCount; i++) {
        await new Promise((r) => setTimeout(r, pause));
        const stepRes = await post("/step", { direction: "next" });
        if (!stepRes.ok) {
          console.error(`   ✗ step failed: ${stepRes.error}`);
          process.exit(1);
        }
        const label = spec.frames[i].label ? ` — ${spec.frames[i].label}` : "";
        console.log(`   → frame ${i + 1}/${frameCount}${label}`);
      }
      // Linger on the last frame.
      await new Promise((r) => setTimeout(r, pause));
    } else {
      await new Promise((r) => setTimeout(r, delay_ms));
    }
  }
}

const totalClientMs = clientSlides.reduce((acc, s) => {
  if (s.type === "step-frames") {
    const frames = JSON.parse(s.payload).frames.length;
    return acc + frames * (s.frame_delay_ms ?? DELAY_MS);
  }
  return acc + (s.delay_ms ?? DELAY_MS);
}, 0);

console.log(`\n── Section 7: client-managed slideshow (${totalClientMs / 1000}s total) ──`);
await runClientSlideshow(clientSlides);

console.log("\n✅  Showcase complete.\n");
