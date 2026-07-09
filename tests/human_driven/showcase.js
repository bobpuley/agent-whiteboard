#!/usr/bin/env node
// Manual showcase — exercises every renderer and interactive feature.
// Usage: node tests/human_driven/showcase.js [-p <port>] [-d <delay_ms>] [SECTIONS] [-h]

import { parseArgs } from "node:util";

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    port:        { type: "string",  short: "p", default: "3000"  },
    delay:       { type: "string",  short: "d", default: "5000"  },
    type:        { type: "string",  short: "t", default: ""      },
    standard:    { type: "boolean", short: "s", default: false   },
    interactive: { type: "boolean", short: "i", default: false   },
    popup:       { type: "boolean", short: "u", default: false   },
    edge:        { type: "boolean", short: "e", default: false   },
    exportid:    { type: "boolean", short: "x", default: false   },
    incremental: { type: "boolean", short: "c", default: false   },
    nodetoframe: { type: "boolean", short: "n", default: false   },
    all:         { type: "boolean", short: "a", default: false   },
    help:        { type: "boolean", short: "h", default: false   },
  },
  strict: true,
});

if (values.help) {
  console.log(`
Usage: node tests/human_driven/showcase.js [OPTIONS]

Section flags (combinable, e.g. -ie runs Sections 9+11 only):
  -s, --standard        Sections 1–8: renderer slideshow + seek demo (default when no flags given)
  -i, --interactive     Section 9:  node click drill-down + Done button
  -u, --popup           Section 10: node_actions popup menu (simulated)
  -e, --edge            Section 11: edge click demo
  -x, --exportid        Section 12: export by graph ID (v0.11)
  -c, --incremental     Section 13: incremental step-frames creation (init/append/commit, v0.8/v0.9)
  -n, --nodetoframe     Section 14: node_to_frame autonomous navigation (v0.2, U4e)
  -a, --all             All sections (equivalent to -siuexcn)

Other options:
  -p, --port <port>     Server port (default: 3000)
  -d, --delay <ms>      Delay between slides in ms (default: 5000)
  -t, --type <types>    Comma-separated renderer types to include in Section 1–5 slideshow
                        (mermaid, svg, html, katex, vega-lite). Omit for all.
  -h, --help            Show this help
`);
  process.exit(0);
}

// ── Section selection ─────────────────────────────────────────────────────────
// No section flags → behave as -s (backwards-compatible default).
const anySection = values.standard || values.interactive || values.popup || values.edge || values.exportid
  || values.incremental || values.nodetoframe || values.all;
const RUN_STANDARD    = !anySection || values.standard    || values.all;
const RUN_INTERACTIVE = values.interactive || values.all;
const RUN_POPUP       = values.popup       || values.all;
const RUN_EDGE        = values.edge        || values.all;
const RUN_EXPORT_ID   = values.exportid    || values.all;
const RUN_INCREMENTAL = values.incremental || values.all;
const RUN_NODE_TO_FRAME = values.nodetoframe || values.all;

const TYPE_FILTER = values.type
  ? new Set(values.type.split(",").map((t) => t.trim()).filter(Boolean))
  : null;

const PORT      = values.port;
const DELAY_MS  = parseInt(values.delay, 10);
const BASE      = `http://localhost:${PORT}`;
const WORKSPACE = "showcase";

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
    title: "1 / 5 — Mermaid",
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
    title: "2 / 5 — SVG",
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
    title: "3 / 5 — HTML",
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
    title: "4 / 5 — KaTeX",
    payload: String.raw`P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)} \qquad \text{(Bayes' Theorem)}\\[18pt]
\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0} \qquad
\nabla \times \mathbf{B} = \mu_0 \mathbf{J} + \mu_0\varepsilon_0\frac{\partial \mathbf{E}}{\partial t} \\[18pt]
e^{i\pi} + 1 = 0`,
  },

  // 5. Vega-Lite — request latency by percentile
  {
    type: "vega-lite",
    title: "5 / 5 — Vega-Lite",
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

];

// ── Sections 1–8 (standard) ───────────────────────────────────────────────────

if (RUN_STANDARD) {
  const activeSlides = TYPE_FILTER ? slides.filter((s) => TYPE_FILTER.has(s.type)) : slides;

  if (activeSlides.length === 0) {
    console.error(`✗ No slides match type filter: ${[...TYPE_FILTER].join(", ")}`);
    console.error(`  Available types: ${[...new Set(slides.map((s) => s.type))].join(", ")}`);
    process.exit(1);
  }

  // One tick per slide — a slide is always exactly one frame (v0.26 Sprint 45).
  const totalMs = activeSlides.length * DELAY_MS;

  if (TYPE_FILTER) {
    console.log(`   Filter: ${[...TYPE_FILTER].join(", ")} (${activeSlides.length} of ${slides.length} slides)`);
  }
  console.log(`▶  Starting ${activeSlides.length}-slide tour (${totalMs / 1000}s total)…`);

  const result = await post("/slideshow", { slides: activeSlides, delay_ms: DELAY_MS, workspace: WORKSPACE });
  if (!result.ok) {
    console.error("✗ slideshow failed:", result.error);
    process.exit(1);
  }
  console.log(`   ✓ slideshow started — slides advance every ${DELAY_MS / 1000}s`);

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

  // 7c — step-frames: built via init_step_frames/append_frame/commit_step_frames
  // (the only way to create a multi-frame sequence — render() is single-frame
  // only, v0.26 Sprint 45), then the client calls POST /step for each frame
  // (3 s between frames). The server just stores the sequence; the agent
  // decides when to advance.
  {
    kind: "step-frames",
    title: "7c — Step-Frames, client-driven (3 s/frame)",
    frame_delay_ms: 3000,
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
  },
];

async function runClientSlideshow(slideList) {
  for (const slide of slideList) {
    process.stdout.write(`\n▶  ${slide.title}\n`);

    if (slide.kind === "step-frames") {
      const { title, frame_type, frames, frame_delay_ms } = slide;
      const initRes = await post("/step-frames/init", { frame_type, workspace: WORKSPACE, title });
      if (!initRes.ok) {
        console.error(`   ✗ init_step_frames failed: ${initRes.error}`);
        process.exit(1);
      }
      const { id } = initRes;
      for (const f of frames) {
        const appendRes = await post(`/step-frames/${id}/frame`, { payload: f.payload, label: f.label });
        if (!appendRes.ok) {
          console.error(`   ✗ append_frame failed: ${appendRes.error}`);
          process.exit(1);
        }
      }
      const commitRes = await post(`/step-frames/${id}/commit`, {});
      if (!commitRes.ok) {
        console.error(`   ✗ commit_step_frames failed: ${commitRes.error}`);
        process.exit(1);
      }
      console.log("   ✓ built via init_step_frames/append_frame/commit_step_frames — frame 1 on screen");

      // Frame 0 is already on screen; advance the remaining frames via POST /step.
      const pause = frame_delay_ms ?? DELAY_MS;
      for (let i = 1; i < frames.length; i++) {
        await new Promise((r) => setTimeout(r, pause));
        const stepRes = await post("/step", { direction: "next" });
        if (!stepRes.ok) {
          console.error(`   ✗ step failed: ${stepRes.error}`);
          process.exit(1);
        }
        const label = frames[i].label ? ` — ${frames[i].label}` : "";
        console.log(`   → frame ${i + 1}/${frames.length}${label}`);
      }
      // Linger on the last frame.
      await new Promise((r) => setTimeout(r, pause));
      continue;
    }

    const { type, payload, title, delay_ms = DELAY_MS } = slide;
    const renderRes = await post("/render", { type, payload, options: { workspace: WORKSPACE, title } });
    if (!renderRes.ok) {
      console.error(`   ✗ render failed: ${renderRes.error}`);
      process.exit(1);
    }
    console.log("   ✓ rendered");
    await new Promise((r) => setTimeout(r, delay_ms));
  }
}

  const totalClientMs = clientSlides.reduce((acc, s) => {
    if (s.kind === "step-frames") {
      return acc + s.frames.length * (s.frame_delay_ms ?? DELAY_MS);
    }
    return acc + (s.delay_ms ?? DELAY_MS);
  }, 0);

  console.log(`\n── Section 7: client-managed slideshow (${totalClientMs / 1000}s total) ──`);
  await runClientSlideshow(clientSlides);

// ── Section 8 — seek() random-access navigation ───────────────────────────────
//
// Builds a 4-frame sequence via init_step_frames/append_frame/commit_step_frames
// (the only way to create a multi-frame sequence — render() is single-frame
// only, v0.26 Sprint 45), then jumps to arbitrary frames via POST /seek.
// Demonstrates that seek() reaches any frame in one call — no repeated step().

const seekFrames = [
  {
    label: "Frame 0 — Request arrives",
    payload: `graph LR
  C([Client]) -->|Request| G[API Gateway]
  style C fill:#4caf50,color:#fff
  style G fill:#2196f3,color:#fff`,
  },
  {
    label: "Frame 1 — Auth check",
    payload: `graph LR
  C([Client]) -->|Request| G[API Gateway]
  G -->|Token| A[Auth Service]
  style C fill:#9e9e9e,color:#fff
  style G fill:#9e9e9e,color:#fff
  style A fill:#2196f3,color:#fff`,
  },
  {
    label: "Frame 2 — Business logic",
    payload: `graph LR
  C([Client]) -->|Request| G[API Gateway]
  G -->|Token| A[Auth Service]
  A -->|OK| S[Order Service]
  S -->|Query| DB[(Database)]
  style C fill:#9e9e9e,color:#fff
  style G fill:#9e9e9e,color:#fff
  style A fill:#9e9e9e,color:#fff
  style S fill:#2196f3,color:#fff
  style DB fill:#2196f3,color:#fff`,
  },
  {
    label: "Frame 3 — Response",
    payload: `graph LR
  C([Client]) -->|Request| G[API Gateway]
  G -->|Token| A[Auth Service]
  A -->|OK| S[Order Service]
  S -->|Query| DB[(Database)]
  DB -->|Data| S
  S -->|Response| C
  style C fill:#4caf50,color:#fff
  style G fill:#9e9e9e,color:#fff
  style A fill:#9e9e9e,color:#fff
  style S fill:#9e9e9e,color:#fff
  style DB fill:#9e9e9e,color:#fff`,
  },
];

async function runSeekDemo() {
  const PAUSE = Math.min(DELAY_MS, 2000);

  // Build the sequence (init → append × 4 → commit); frame 0 is shown on commit.
  const initRes = await post("/step-frames/init", {
    frame_type: "mermaid",
    workspace: WORKSPACE,
    title: "8 — seek() demo: frame 0 → 3 → 1 → 2",
  });
  if (!initRes.ok) {
    console.error(`   ✗ init_step_frames failed: ${initRes.error}`);
    process.exit(1);
  }
  const { id } = initRes;
  for (const f of seekFrames) {
    const appendRes = await post(`/step-frames/${id}/frame`, { payload: f.payload, label: f.label });
    if (!appendRes.ok) {
      console.error(`   ✗ append_frame failed: ${appendRes.error}`);
      process.exit(1);
    }
  }
  const commitRes = await post(`/step-frames/${id}/commit`, {});
  if (!commitRes.ok) {
    console.error(`   ✗ commit_step_frames failed: ${commitRes.error}`);
    process.exit(1);
  }
  console.log("   ✓ built 4-frame sequence via init_step_frames/append_frame/commit_step_frames (frame 0 shown)");
  await new Promise((r) => setTimeout(r, PAUSE));

  // Jump directly to frame 3 — no step() chain needed.
  const s3 = await post("/seek", { frame: 3 });
  console.log(`   → seek(3) → frame ${s3.current_frame}/${s3.total_frames - 1}: "${seekFrames[3].label}"`);
  await new Promise((r) => setTimeout(r, PAUSE));

  // Jump back to frame 1.
  const s1 = await post("/seek", { frame: 1 });
  console.log(`   → seek(1) → frame ${s1.current_frame}/${s1.total_frames - 1}: "${seekFrames[1].label}"`);
  await new Promise((r) => setTimeout(r, PAUSE));

  // Jump to frame 2.
  const s2 = await post("/seek", { frame: 2 });
  console.log(`   → seek(2) → frame ${s2.current_frame}/${s2.total_frames - 1}: "${seekFrames[2].label}"`);
  await new Promise((r) => setTimeout(r, PAUSE));
}

  console.log("\n── Section 8: seek() random-access frame navigation ──");
  await runSeekDemo();
} // end RUN_STANDARD

// ── Section 9 — Interactive drill-down (wait_click + wait_done) ──────────────
//
// Simulates a real agent interaction loop:
//   render overview → wait_click → dispatch hardcoded detail → wait_done → end
//
// Node IDs in the overview match Mermaid's SVG pattern (flowchart-<id>-N),
// so clicking FE / BE / DB returns those IDs via the wait_click response.
// A real agent would generate the detail diagram dynamically; here it is
// hardcoded to make the demo self-contained.

const DRILLDOWN = {
  FE: {
    title: "Frontend internals — click Done when ready",
    payload: `graph TD
  Browser[Browser SPA]
  Svelte[Svelte components]
  WS[WebSocket client]
  Browser --> Svelte
  Browser --> WS
  WS -->|ws /stream| Server[Node server :3000]`,
  },
  BE: {
    title: "Backend internals — click Done when ready",
    payload: `graph TD
  Hono[Hono HTTP :3000]
  MCP[MCP server SSE /mcp]
  WSS[WebSocket /stream]
  REST[REST endpoints]
  Hono --> MCP
  Hono --> WSS
  Hono --> REST`,
  },
  DB: {
    title: "In-memory session — click Done when ready",
    payload: `graph TD
  Session[Session module]
  Canvas[Canvas state]
  Frames[Step-frames cursor]
  NTF[nodeToFrame map]
  Session --> Canvas
  Session --> Frames
  Session --> NTF`,
  },
};

async function runInteractiveDemo() {
  const overview = `graph TD
  FE[Frontend]
  BE[Backend]
  DB[(Database)]
  FE -->|HTTP| BE
  BE -->|Query| DB`;

  console.log("   rendering overview — open the browser tab and click a node");

  const r1 = await post("/render", {
    type: "mermaid",
    payload: overview,
    options: { workspace: WORKSPACE, title: "9 — Click FE, BE, or DB to drill in" },
  });
  if (!r1.ok) { console.error(`   ✗ render failed: ${r1.error}`); return; }

  console.log("   waiting for click (POST /wait-click) …");
  const click = await fetch(`${BASE}/wait-click`, { method: "POST" }).then((r) => r.json());

  if (click.type === "timeout") {
    console.log("   timed out — no click received within 10 minutes");
    return;
  }

  console.log(`   ✓ click: type=${click.type}  id=${click.id}  label="${click.label}"  action=${JSON.stringify(click.action)}`);

  if (click.type === "edge") {
    console.log(`   ℹ edge clicked (id="${click.id}" label="${click.label}") — drill-down is node-only in this demo`);
    console.log("   tip: click one of the three nodes (FE, BE, DB) to see a drill-down diagram");
    return;
  }

  const detail = DRILLDOWN[click.id];
  if (!detail) {
    console.log(`   (no drill-down defined for "${click.id}" — expected FE, BE, or DB)`);
    return;
  }

  const r2 = await post("/render", {
    type: "mermaid",
    payload: detail.payload,
    options: { workspace: WORKSPACE, title: detail.title },
  });
  if (!r2.ok) { console.error(`   ✗ render failed: ${r2.error}`); return; }
  console.log(`   ✓ drill-down rendered for "${click.id}" — click Done in the browser when ready`);

  await fetch(`${BASE}/wait-done`, { method: "POST" });
  console.log("   ✓ Done received");
}

if (RUN_INTERACTIVE) {
  console.log("\n── Section 9: interactive drill-down (wait_click + wait_done) ──");
  await runInteractiveDemo();
}

// ── Section 10 — node_actions popup menu ─────────────────────────────────────
//
// Full end-to-end popup demo:
//   render diagram → arm /wait-click with node_actions map → browser shows
//   popup when user clicks a registered node → user picks an action →
//   server returns { type, id, label, action } to this script.

async function runPopupDemo() {
  const diagram = `graph TD
  Client[Client] -->|HTTP| Server[Server]
  Server -->|Query| DB[(Database)]
  DB -->|Result| Server
  Server -->|Response| Client`;

  const nodeActions = {
    Client: ["Explain", "Show internals"],
    Server: ["Explain", "Show internals", "Change request"],
    DB:     ["Explain", "Show schema"],
  };

  const r = await post("/render", {
    type: "mermaid",
    payload: diagram,
    options: { workspace: WORKSPACE, title: "10 — Click a node to see its popup menu" },
  });
  if (!r.ok) { console.error(`   ✗ render failed: ${r.error}`); return; }
  console.log("   ✓ diagram rendered — open the browser tab and click a node:");
  console.log("       Client → Explain | Show internals");
  console.log("       Server → Explain | Show internals | Change request");
  console.log("       DB     → Explain | Show schema");

  const click = await fetch(`${BASE}/wait-click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node_actions: nodeActions }),
  }).then((r2) => r2.json());

  if (click.type === "timeout") {
    console.log("   timed out — no click received within 10 minutes");
    return;
  }

  console.log(`\n   ✓ click received:`);
  console.log(`       type   = ${click.type}`);
  console.log(`       id     = ${click.id}`);
  console.log(`       label  = "${click.label}"`);
  console.log(`       action = ${JSON.stringify(click.action)}`);

  if (click.action) {
    console.log(`\n   Agent would now handle: "${click.action}" on node "${click.label}"`);
  } else {
    console.log(`\n   Plain click on unregistered node — no action selected`);
  }
}

if (RUN_POPUP) {
  console.log("\n── Section 10: node_actions popup menu ──");
  await runPopupDemo();
}

// ── Section 11 — Edge click demo (Sprint 14) ──────────────────────────────────
//
// Renders a diagram with clearly labeled edges, arms /wait-click, and waits for
// the user to click an edge in the browser.  Confirms that:
//   • edge clicks return { type: "edge", id, label, action: null }
//   • action is always null for edges (no popup support)
//
// Edge IDs in Mermaid SVG are drawn from the parent group of the .edgeLabel
// element — typically "L_<source>_<target>_<N>".  The label is the text
// content of the edge label element.

async function runEdgeDemo() {
  const diagram = `graph LR
  Client[Client] -->|REST API| Server[Server]
  Server -->|SQL query| DB[(Database)]
  DB -->|Result set| Server
  Server -->|JSON response| Client`;

  const r = await post("/render", {
    type: "mermaid",
    payload: diagram,
    options: { workspace: WORKSPACE, title: "11 — Edge click demo: click any labeled arrow" },
  });
  if (!r.ok) { console.error(`   ✗ render failed: ${r.error}`); return; }
  console.log("   ✓ diagram rendered — open the browser tab and click one of the labeled arrows:");
  console.log("       REST API  |  SQL query  |  Result set  |  JSON response");

  const waitPromise = fetch(`${BASE}/wait-click`, { method: "POST" }).then((r2) => r2.json());

  const click = await waitPromise;

  if (click.type === "timeout") {
    console.log("   timed out — no click received within 10 minutes");
    return;
  }

  console.log(`\n   ✓ click received:`);
  console.log(`       type   = ${click.type}`);
  console.log(`       id     = ${click.id}`);
  console.log(`       label  = "${click.label}"`);
  console.log(`       action = ${JSON.stringify(click.action)}`);

  if (click.type === "edge") {
    console.log("   ✓ confirmed: edge click returns type=\"edge\" and action=null");
  } else {
    console.log(`   ℹ node was clicked instead (id="${click.id}") — try clicking a labeled arrow`);
  }
}

if (RUN_EDGE) {
  console.log("\n── Section 11: edge click demo (Sprint 14) ──");
  await runEdgeDemo();
}

// ── Section 12 — Export by Graph ID (v0.11) ───────────────────────────────────
//
// Demonstrates the new id-based export feature:
//   1. render() a diagram — capture the returned id
//   2. render() a second diagram (canvas state changes)
//   3. GET /export (no id) → returns the second diagram (current canvas)
//   4. GET /export?id=<first-id> → returns the first diagram by UUID
//
// Confirms that render() returns { ok: true, id: "<uuid>" } and that the
// id can be used to retrieve any past snapshot, not just the current one.

async function runExportIdDemo() {
  const PAUSE = Math.min(DELAY_MS, 2000);

  // Render first diagram — capture id.
  const diagram1 = `graph TD
  A[Alpha] --> B[Beta]
  B --> C[Gamma]`;

  const r1 = await post("/render", {
    type: "mermaid",
    payload: diagram1,
    options: { workspace: WORKSPACE, title: "12 — First diagram (will be replaced)" },
  });
  if (!r1.ok) { console.error(`   ✗ render failed: ${r1.error}`); return; }

  const id1 = r1.id;
  if (!id1) {
    console.error("   ✗ render response did not include id — check v0.11 implementation");
    return;
  }
  console.log(`   ✓ first render — id: ${id1}`);
  await new Promise((r) => setTimeout(r, PAUSE));

  // Render second diagram — replaces canvas state.
  const diagram2 = `graph TD
  X[Delta] --> Y[Epsilon]
  Y --> Z[Zeta]`;

  const r2 = await post("/render", {
    type: "mermaid",
    payload: diagram2,
    options: { workspace: WORKSPACE, title: "12 — Second diagram (current canvas)" },
  });
  if (!r2.ok) { console.error(`   ✗ render 2 failed: ${r2.error}`); return; }
  const id2 = r2.id;
  console.log(`   ✓ second render — id: ${id2}`);
  await new Promise((r) => setTimeout(r, PAUSE));

  // GET /export (no id) → should return diagram2 (current canvas).
  const expCurrent = await fetch(`${BASE}/export`).then((r3) => r3.json());
  if (!expCurrent.ok || expCurrent.data !== diagram2) {
    console.error("   ✗ GET /export (no id) did not return the current canvas");
    console.error("     got:", JSON.stringify(expCurrent).slice(0, 120));
    return;
  }
  console.log("   ✓ GET /export (no id) — returns current canvas (diagram 2)");

  // GET /export?id=<id1> → should return diagram1 by UUID.
  const expById = await fetch(`${BASE}/export?id=${encodeURIComponent(id1)}`).then((r4) => r4.json());
  if (!expById.ok || expById.data !== diagram1) {
    console.error("   ✗ GET /export?id=<id1> did not return diagram 1");
    console.error("     got:", JSON.stringify(expById).slice(0, 120));
    return;
  }
  console.log("   ✓ GET /export?id=<id1> — returns diagram 1 by UUID");

  // GET /export?id=<nonexistent> → should return 404 with graph not found.
  const expMissing = await fetch(`${BASE}/export?id=00000000-0000-0000-0000-000000000000`).then((r5) => r5.json());
  if (expMissing.ok !== false || expMissing.error !== "graph not found") {
    console.error("   ✗ GET /export?id=<nonexistent> did not return expected error");
    console.error("     got:", JSON.stringify(expMissing));
    return;
  }
  console.log("   ✓ GET /export?id=<nonexistent> — returns { ok: false, error: 'graph not found' }");

  console.log("\n   All export-by-id checks passed.");
}

if (RUN_EXPORT_ID) {
  console.log("\n── Section 12: export by graph ID (v0.11) ──");
  await runExportIdDemo();
}

// ── Section 13 — Incremental step-frames creation (v0.8; live preview v0.9) ──
//
// Three-tool protocol for building a step-frames sequence one frame at a
// time instead of a single large payload: init_step_frames() creates an
// empty skeleton and shows a 0-frame placeholder; append_frame() validates
// and appends one frame, pushing the accumulated partial sequence to the
// browser after each call (live preview — the user watches it grow);
// commit_step_frames() finalizes the sequence (snapshot write only — the
// visual is already fully shown by the last append).

async function runIncrementalDemo() {
  const PAUSE = Math.min(DELAY_MS, 2000);

  const initRes = await post("/step-frames/init", {
    frame_type: "mermaid",
    workspace: WORKSPACE,
    title: "13 — Incremental step-frames (init → append → commit)",
  });
  if (!initRes.ok) { console.error(`   ✗ init_step_frames failed: ${initRes.error}`); return; }
  const { id } = initRes;
  console.log(`   ✓ init_step_frames — id: ${id} (browser shows a 0-frame placeholder)`);
  await new Promise((r) => setTimeout(r, PAUSE));

  const frames = [
    { label: "Frame 1 — Request arrives", payload: `graph LR\n  A([Client]) --> B[API Gateway]\n  style A fill:#4caf50,color:#fff\n  style B fill:#2196f3,color:#fff` },
    { label: "Frame 2 — Auth check", payload: `graph LR\n  A([Client]) --> B[API Gateway]\n  B --> C[Auth Service]\n  style A fill:#9e9e9e,color:#fff\n  style B fill:#9e9e9e,color:#fff\n  style C fill:#2196f3,color:#fff` },
    { label: "Frame 3 — Response", payload: `graph LR\n  A([Client]) --> B[API Gateway]\n  B --> C[Auth Service]\n  C --> D([Response])\n  style A fill:#9e9e9e,color:#fff\n  style B fill:#9e9e9e,color:#fff\n  style C fill:#9e9e9e,color:#fff\n  style D fill:#4caf50,color:#fff` },
  ];

  for (let i = 0; i < frames.length; i++) {
    const appendRes = await post(`/step-frames/${id}/frame`, { payload: frames[i].payload, label: frames[i].label });
    if (!appendRes.ok) { console.error(`   ✗ append_frame failed: ${appendRes.error}`); return; }
    console.log(`   ✓ append_frame ${i + 1}/${frames.length} — frame_count: ${appendRes.frame_count} (live preview updated in browser)`);
    await new Promise((r) => setTimeout(r, PAUSE));
  }

  const commitRes = await post(`/step-frames/${id}/commit`, {});
  if (!commitRes.ok) { console.error(`   ✗ commit_step_frames failed: ${commitRes.error}`); return; }
  console.log(`   ✓ commit_step_frames — sequence finalized, snapshot written${commitRes.id ? ` (id: ${commitRes.id})` : ""}`);
}

if (RUN_INCREMENTAL) {
  console.log("\n── Section 13: incremental step-frames creation (init/append/commit) ──");
  await runIncrementalDemo();
}

// ── Section 14 — node_to_frame autonomous navigation (v0.2, U4e) ────────────
//
// commit_step_frames(id, node_to_frame={...}) attaches click listeners in the
// browser automatically: clicking a mapped node jumps directly to its frame
// via POST /seek, with no agent involvement (no wait_click() call).
// (Entry point moved here from render(type="step-frames", options.node_to_frame)
// in v0.26 Sprint 45 — render() is single-frame only now, so the sequence must
// be built via init_step_frames/append_frame/commit_step_frames.) This script
// can only build the sequence and print instructions — the resulting seek()
// calls are browser → server directly and produce no response this script can
// observe.

async function runNodeToFrameDemo() {
  const nodeToFrame = { A: 0, B: 1, C: 2 };
  const frames = [
    { label: "Frame 0 — Client", payload: `graph LR\n  A([Client]) --> B[API Gateway]\n  B --> C[(Database)]\n  style A fill:#4caf50,color:#fff` },
    { label: "Frame 1 — Gateway", payload: `graph LR\n  A([Client]) --> B[API Gateway]\n  B --> C[(Database)]\n  style B fill:#2196f3,color:#fff` },
    { label: "Frame 2 — Database", payload: `graph LR\n  A([Client]) --> B[API Gateway]\n  B --> C[(Database)]\n  style C fill:#e91e63,color:#fff` },
  ];

  const initRes = await post("/step-frames/init", {
    frame_type: "mermaid",
    workspace: WORKSPACE,
    title: "14 — node_to_frame: click a node to jump",
  });
  if (!initRes.ok) { console.error(`   ✗ init_step_frames failed: ${initRes.error}`); return; }
  const { id } = initRes;
  for (const f of frames) {
    const appendRes = await post(`/step-frames/${id}/frame`, { payload: f.payload, label: f.label });
    if (!appendRes.ok) { console.error(`   ✗ append_frame failed: ${appendRes.error}`); return; }
  }
  const commitRes = await post(`/step-frames/${id}/commit`, { node_to_frame: nodeToFrame });
  if (!commitRes.ok) { console.error(`   ✗ commit_step_frames failed: ${commitRes.error}`); return; }
  console.log("   ✓ built via init_step_frames/append_frame/commit_step_frames(node_to_frame) — click a node in the browser to jump directly to its mapped frame (no agent involvement):");
  console.log(`       Client (A) → frame 0  |  API Gateway (B) → frame 1  |  Database (C) → frame 2`);

  const WAIT_MS = Math.max(DELAY_MS, 8000);
  console.log(`   waiting ${WAIT_MS / 1000}s for you to try clicking nodes…`);
  await new Promise((res) => setTimeout(res, WAIT_MS));
}

if (RUN_NODE_TO_FRAME) {
  console.log("\n── Section 14: node_to_frame autonomous navigation ──");
  await runNodeToFrameDemo();
}

console.log("\n✅  Showcase complete.\n");

const skipped = [
  !RUN_INTERACTIVE   && "  -i  Section 9:  node click drill-down + Done button",
  !RUN_POPUP         && "  -u  Section 10: node_actions popup menu (simulated)",
  !RUN_EDGE          && "  -e  Section 11: edge click demo",
  !RUN_EXPORT_ID     && "  -x  Section 12: export by graph ID (v0.11)",
  !RUN_INCREMENTAL   && "  -c  Section 13: incremental step-frames creation (init/append/commit)",
  !RUN_NODE_TO_FRAME && "  -n  Section 14: node_to_frame autonomous navigation",
].filter(Boolean);

if (skipped.length) {
  console.log("   Sections not run (add flags to include):");
  skipped.forEach((s) => console.log(`   ${s}`));
  console.log("   (use -a / --all to run everything — equivalent to -siuexcn)\n");
}
