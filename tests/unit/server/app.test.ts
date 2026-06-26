import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../server/app.js";
import { resetCanvas, resetLastWorkspace } from "../../../server/session.js";
import { cancelSlideshow } from "../../../server/slideshow.js";
import { resetClick } from "../../../server/events.js";
import { resetBuilders } from "../../../server/step-frames-builder.js";

const WORKSPACE = "test-workspace";

vi.mock("../../../server/snapshot.js", () => ({
  saveSnapshot: vi.fn(),
}));

vi.mock("../../../server/snapshot-reader.js", () => ({
  listSnapshots: vi.fn(),
  listAllSnapshots: vi.fn(),
  loadSnapshotContent: vi.fn(),
}));

vi.mock("../../../server/ws.js", () => ({
  broadcast: vi.fn(),
  broadcastStepFrames: vi.fn(),
  addClient: vi.fn(),
}));

// Use a fresh app instance per suite; session state is reset between each test.
const app = createApp();

afterEach(() => {
  cancelSlideshow();
  resetCanvas();
  resetLastWorkspace();
  resetClick();
  resetBuilders();
});

// ── POST /render ─────────────────────────────────────────────────────────────

describe("POST /render", () => {
  it("accepts a valid Mermaid payload and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B", options: { workspace: WORKSPACE } }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects an unknown diagram keyword and returns { ok: false, error }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "invalid stuff", options: { workspace: WORKSPACE } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/diagram keyword/);
  });

  it("rejects an unknown type and returns 400", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "d2", payload: "x -> y", options: { workspace: WORKSPACE } }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });

  it("accepts svg type and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "svg", payload: "<svg><circle r='5'/></svg>", options: { workspace: WORKSPACE } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts html type and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "html", payload: "<h1>Hello</h1>", options: { workspace: WORKSPACE } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts katex type and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "katex", payload: "E = mc^2", options: { workspace: WORKSPACE } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts vega-lite type with valid JSON and returns { ok: true }", async () => {
    const spec = JSON.stringify({ "$schema": "https://vega.github.io/schema/vega-lite/v5.json", "mark": "bar" });
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "vega-lite", payload: spec, options: { workspace: WORKSPACE } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects vega-lite type with invalid JSON and returns { ok: false, error }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "vega-lite", payload: "not valid json {", options: { workspace: WORKSPACE } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/valid JSON/);
  });

  it("leaves canvas unchanged when payload is invalid", async () => {
    // Invalid render — should not modify canvas.
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "bogus", options: { workspace: WORKSPACE } }),
    });

    const exportRes = await app.request("/export");
    expect(await exportRes.json()).toEqual({ ok: true, data: "" });
  });

  it("rejects valid keyword but broken Mermaid syntax (Sprint 6)", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A -->", options: { workspace: WORKSPACE } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/syntax/i);
  });

  it("leaves canvas unchanged when mermaid syntax is invalid (Sprint 6)", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A -->", options: { workspace: WORKSPACE } }),
    });

    const exportRes = await app.request("/export");
    expect(await exportRes.json()).toEqual({ ok: true, data: "" });
  });

  it("accepts all valid Mermaid diagram keywords", async () => {
    const keywords = [
      "graph TD; A --> B",
      "flowchart LR; A --> B",
      "sequenceDiagram\nA->>B: Hello",
      "classDiagram\nAnimal <|-- Duck",
      "erDiagram\nCUSTOMER ||--o{ ORDER : places",
      "gantt\ntitle Plan\nsection A\nTask :a1, 2024-01-01, 30d",
      "pie\ntitle Pets\n\"Dogs\" : 386",
      "mindmap\nroot((mindmap))",
    ];

    for (const payload of keywords) {
      resetCanvas();
      const res = await app.request("/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "mermaid", payload, options: { workspace: WORKSPACE } }),
      });
      expect(res.status, `failed for payload starting with '${payload.split(/\s/)[0]}'`).toBe(200);
      expect((await res.json<{ ok: boolean }>()).ok).toBe(true);
    }
  });
});

// ── GET /export ───────────────────────────────────────────────────────────────

describe("GET /export", () => {
  it("returns empty string when canvas is blank", async () => {
    const res = await app.request("/export");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: "" });
  });

  it("returns the submitted source after a successful render", async () => {
    const payload = "graph TD; A --> B";

    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload, options: { workspace: WORKSPACE } }),
    });

    const res = await app.request("/export");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: payload });
  });

  it("returns verbatim svg payload after render", async () => {
    const payload = "<svg><circle r='10'/></svg>";

    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "svg", payload, options: { workspace: WORKSPACE } }),
    });

    const res = await app.request("/export");
    expect(await res.json()).toEqual({ ok: true, data: payload });
  });

  it("returns verbatim vega-lite payload after render", async () => {
    const payload = JSON.stringify({ mark: "bar" });

    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "vega-lite", payload, options: { workspace: WORKSPACE } }),
    });

    const res = await app.request("/export");
    expect(await res.json()).toEqual({ ok: true, data: payload });
  });
});

// ── POST /clear ───────────────────────────────────────────────────────────────

describe("POST /clear", () => {
  it("returns { ok: true }", async () => {
    const res = await app.request("/clear", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("resets canvas so export returns empty string", async () => {
    // First put something on the canvas.
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B", options: { workspace: WORKSPACE } }),
    });

    await app.request("/clear", { method: "POST" });

    const res = await app.request("/export");
    expect(await res.json()).toEqual({ ok: true, data: "" });
  });
});

// ── Sprint 8 — options.title ──────────────────────────────────────────────────

describe("POST /render — options.title", () => {
  it("accepts options.title and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "mermaid",
        payload: "graph TD; A --> B",
        options: { workspace: WORKSPACE, title: "My diagram" },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("title is not included in export() output", async () => {
    const payload = "graph TD; A --> B";
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload, options: { workspace: WORKSPACE, title: "My diagram" } }),
    });
    const res = await app.request("/export");
    expect(await res.json()).toEqual({ ok: true, data: payload });
  });

  it("render with only workspace in options (no title) returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B", options: { workspace: WORKSPACE } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ── step-frames ───────────────────────────────────────────────────────────────

const THREE_FRAME_SEQUENCE = JSON.stringify({
  frame_type: "mermaid",
  frames: [
    { label: "Step 1", payload: "graph TD; A" },
    { label: "Step 2", payload: "graph TD; A --> B" },
    { label: "Step 3", payload: "graph TD; A --> B --> C" },
  ],
});

describe("POST /render (step-frames)", () => {
  it("accepts a valid step-frames payload and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects step-frames with invalid JSON", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: "not json {", options: { workspace: WORKSPACE } }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/JSON/);
  });

  it("rejects step-frames with missing frames array", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: JSON.stringify({ frame_type: "mermaid" }), options: { workspace: WORKSPACE } }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
  });

  it("export returns the original frames JSON after loading", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });
    const res = await app.request("/export");
    expect(await res.json()).toEqual({ ok: true, data: THREE_FRAME_SEQUENCE });
  });
});

describe("POST /step", () => {
  it("returns error if no step-frames sequence is loaded", async () => {
    const res = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/no step-frames/);
  });

  it("advances cursor and returns current_frame / total_frames", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });

    const res = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, current_frame: 1, total_frames: 3 });
  });

  it("steps next twice and reaches frame 2", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });

    await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    const res = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    expect(await res.json()).toEqual({ ok: true, current_frame: 2, total_frames: 3 });
  });

  it("does not go past the last frame", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });

    // Step to the end.
    for (let i = 0; i < 5; i++) {
      await app.request("/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: "next" }),
      });
    }
    const res = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "prev" }),
    });
    expect((await res.json<{ ok: boolean; current_frame: number }>()).current_frame).toBe(1);
  });

  it("rejects unknown direction", async () => {
    const res = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "up" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });

  it("clear resets step-frames so /step returns error", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });

    await app.request("/clear", { method: "POST" });

    const res = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });
});

// ── Sprint 9 — POST /slideshow / POST /slideshow/stop ─────────────────────────

const VALID_SLIDES = [
  { type: "svg", payload: "<svg><circle r='5'/></svg>", title: "Slide 1" },
  { type: "html", payload: "<h1>Hello</h1>", title: "Slide 2" },
];

describe("POST /slideshow", () => {
  it("accepts a valid slides array and returns { ok: true }", async () => {
    vi.useFakeTimers();
    const res = await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    vi.useRealTimers();
  });

  it("rejects an empty slides array", async () => {
    const res = await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: [], delay_ms: 1000 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/non-empty/);
  });

  it("rejects a missing delay_ms", async () => {
    const res = await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: VALID_SLIDES }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });

  it("rejects a slide with invalid mermaid keyword", async () => {
    const res = await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slides: [{ type: "mermaid", payload: "not a diagram" }],
        delay_ms: 1000,
      }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/slide\[0\]/);
  });

  it("broadcasts first slide immediately and advances on timer", async () => {
    vi.useFakeTimers();
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000 }),
    });
    // First slide rendered — canvas should hold slide 0 payload.
    const exportRes1 = await app.request("/export");
    expect((await exportRes1.json<{ ok: boolean; data: string }>()).data).toBe(VALID_SLIDES[0].payload);

    // Advance timer by one interval — second slide should now be shown.
    vi.advanceTimersByTime(1000);
    const exportRes2 = await app.request("/export");
    expect((await exportRes2.json<{ ok: boolean; data: string }>()).data).toBe(VALID_SLIDES[1].payload);
    vi.useRealTimers();
  });

  it("advances through all 3 slides of a 3-slide playlist (B3)", async () => {
    vi.useFakeTimers();
    const slides3 = [
      { type: "svg",  payload: "<svg><circle r='1'/></svg>" },
      { type: "html", payload: "<p>slide 2</p>" },
      { type: "katex", payload: "x^2" },
    ];
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: slides3, delay_ms: 1000 }),
    });

    // t=0: slide 0 shown immediately.
    expect((await (await app.request("/export")).json<{ ok: boolean; data: string }>()).data).toBe(slides3[0].payload);

    // t=1s: slide 1.
    vi.advanceTimersByTime(1000);
    expect((await (await app.request("/export")).json<{ ok: boolean; data: string }>()).data).toBe(slides3[1].payload);

    // t=2s: slide 2 (last).
    vi.advanceTimersByTime(1000);
    expect((await (await app.request("/export")).json<{ ok: boolean; data: string }>()).data).toBe(slides3[2].payload);

    vi.useRealTimers();
  });

  it("a second /slideshow call cancels the first", async () => {
    vi.useFakeTimers();
    const slides2 = [{ type: "katex", payload: "x^2" }];
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 500 }),
    });
    // Second call replaces the first.
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: slides2, delay_ms: 500 }),
    });
    // Canvas should reflect the new slideshow's first slide.
    const exportRes = await app.request("/export");
    expect((await exportRes.json<{ ok: boolean; data: string }>()).data).toBe(slides2[0].payload);
    vi.useRealTimers();
  });

  it("POST /render cancels the running slideshow", async () => {
    vi.useFakeTimers();
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000 }),
    });
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "katex", payload: "E=mc^2", options: { workspace: WORKSPACE } }),
    });
    // Timer fires — but slideshow was cancelled, so canvas stays at katex payload.
    vi.advanceTimersByTime(1000);
    const exportRes = await app.request("/export");
    expect((await exportRes.json<{ ok: boolean; data: string }>()).data).toBe("E=mc^2");
    vi.useRealTimers();
  });

  it("POST /clear cancels the running slideshow", async () => {
    vi.useFakeTimers();
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000 }),
    });
    await app.request("/clear", { method: "POST" });
    vi.advanceTimersByTime(1000);
    const exportRes = await app.request("/export");
    expect((await exportRes.json<{ ok: boolean; data: string }>()).data).toBe("");
    vi.useRealTimers();
  });
});

describe("POST /slideshow — step-frames slide", () => {
  it("leaves session in step-frames state so /step works afterward", async () => {
    vi.useFakeTimers();
    const slides = [{ type: "step-frames", payload: THREE_FRAME_SEQUENCE }];
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides, delay_ms: 1000 }),
    });
    // export() returns the raw frames JSON (not a single frame payload).
    const exportRes = await app.request("/export");
    expect(await exportRes.json()).toEqual({ ok: true, data: THREE_FRAME_SEQUENCE });
    vi.useRealTimers();
  });

  it("allows /step navigation after a step-frames slideshow slide", async () => {
    vi.useFakeTimers();
    const slides = [{ type: "step-frames", payload: THREE_FRAME_SEQUENCE }];
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides, delay_ms: 1000 }),
    });
    // Should be at frame 0; step next moves to frame 1.
    const stepRes = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    expect(await stepRes.json()).toEqual({ ok: true, current_frame: 1, total_frames: 3 });
    vi.useRealTimers();
  });
});

// ── Sprint 9 B2 — step-frames auto-advance ────────────────────────────────────

describe("POST /slideshow — step-frames auto-advance (B2)", () => {
  it("auto-advances through all frames at delay_ms intervals", async () => {
    vi.useFakeTimers();
    const slides = [{ type: "step-frames", payload: THREE_FRAME_SEQUENCE }];
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides, delay_ms: 1000 }),
    });

    // t=0: frame 0. Two ticks advance to frame 2 (last).
    vi.advanceTimersByTime(1000); // frame 1
    vi.advanceTimersByTime(1000); // frame 2

    // Session is at frame 2 — step next is capped at last frame.
    const res = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    expect(await res.json()).toEqual({ ok: true, current_frame: 2, total_frames: 3 });
    vi.useRealTimers();
  });

  it("session stays in step-frames state after full auto-advance", async () => {
    vi.useFakeTimers();
    const slides = [{ type: "step-frames", payload: THREE_FRAME_SEQUENCE }];
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides, delay_ms: 1000 }),
    });

    vi.advanceTimersByTime(2000); // advance past all 3 frames

    // export() returns the full frames JSON (not a single frame payload).
    const exportRes = await app.request("/export");
    expect(await exportRes.json()).toEqual({ ok: true, data: THREE_FRAME_SEQUENCE });

    // /step is functional — session is in step-frames state.
    const stepRes = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "prev" }),
    });
    expect((await stepRes.json<{ ok: boolean }>()).ok).toBe(true);
    vi.useRealTimers();
  });

  it("mixed playlist: step-frames expands so next plain slide follows after all frames", async () => {
    vi.useFakeTimers();
    const slides = [
      { type: "step-frames", payload: THREE_FRAME_SEQUENCE },
      { type: "svg", payload: "<svg><circle r='5'/></svg>" },
    ];
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides, delay_ms: 1000 }),
    });

    // 3 frames (ticks 0-2) + 1 svg slide (tick 3) = 4 ticks total.
    // After 3 intervals the svg slide is shown.
    vi.advanceTimersByTime(3000);

    const exportRes = await app.request("/export");
    expect((await exportRes.json<{ ok: boolean; data: string }>()).data).toBe(
      "<svg><circle r='5'/></svg>"
    );
    vi.useRealTimers();
  });
});

// ── Sprint 12 — POST /node-click / POST /wait-click ──────────────────────────

describe("POST /node-click", () => {
  it("returns { ok: true } even when no wait_click() is pending (no-op)", async () => {
    const res = await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", id: "A", label: "Client" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects unknown type with 400", async () => {
    const res = await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "button", id: "x", label: "y" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/node.*edge/i);
  });

  it("resolves a pending /wait-click when fired", async () => {
    // Start wait-click without awaiting — it long-polls.
    const waitPromise = app.request("/wait-click", { method: "POST" });

    // Yield so the waitForClick() promise is registered before we fire node-click.
    await new Promise((r) => setTimeout(r, 0));

    await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", id: "B", label: "Server" }),
    });

    const res = await waitPromise;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, type: "node", id: "B", label: "Server", action: null });
  });

  it("edge click resolves /wait-click with type=edge", async () => {
    const waitPromise = app.request("/wait-click", { method: "POST" });
    await new Promise((r) => setTimeout(r, 0));

    await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "edge", id: "L_A_B_0", label: "HTTP" }),
    });

    const res = await waitPromise;
    expect(await res.json()).toEqual({ ok: true, type: "edge", id: "L_A_B_0", label: "HTTP", action: null });
  });

  it("second /wait-click cancels the first (replaces listener)", async () => {
    const first = app.request("/wait-click", { method: "POST" });
    await new Promise((r) => setTimeout(r, 0));

    // Second call cancels first — first resolves with timeout.
    const second = app.request("/wait-click", { method: "POST" });
    await new Promise((r) => setTimeout(r, 0));

    // Fire node-click — should resolve the second listener.
    await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", id: "X", label: "X" }),
    });

    const firstBody = await (await first).json<{ ok: boolean; type: string }>();
    const secondBody = await (await second).json<{ ok: boolean; type: string }>();

    expect(firstBody).toEqual({ ok: true, type: "timeout", id: "", label: "", action: null });
    expect(secondBody).toEqual({ ok: true, type: "node", id: "X", label: "X", action: null });
  });

  it("/wait-click resolves with timeout after timeout fires", async () => {
    vi.useFakeTimers();
    const waitPromise = app.request("/wait-click", { method: "POST" });

    // runAllTimersAsync advances all pending timers and flushes async work.
    await vi.runAllTimersAsync();

    const res = await waitPromise;
    expect(await res.json()).toEqual({ ok: true, type: "timeout", id: "", label: "", action: null });
    vi.useRealTimers();
  });

  it("/wait-click with node_actions body broadcasts the map and returns action from node-click", async () => {
    const nodeActions = { B: ["Explain", "Drill down"] };
    const waitPromise = app.request("/wait-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_actions: nodeActions }),
    });
    await new Promise((r) => setTimeout(r, 0));

    await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", id: "B", label: "Server", action: "Drill down" }),
    });

    const res = await waitPromise;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, type: "node", id: "B", label: "Server", action: "Drill down" });
  });

  it("/wait-click rejects invalid node_actions with 400", async () => {
    const res = await app.request("/wait-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_actions: { B: "not-an-array" } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/node_actions/);
  });
});

describe("POST /slideshow/stop", () => {
  it("returns { ok: true } even when no slideshow is running", async () => {
    const res = await app.request("/slideshow/stop", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("stops the timer and leaves the last rendered slide on screen", async () => {
    vi.useFakeTimers();
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000 }),
    });
    await app.request("/slideshow/stop", { method: "POST" });
    // Timer fires — slideshow is stopped so canvas stays at slide 0.
    vi.advanceTimersByTime(1000);
    const exportRes = await app.request("/export");
    expect((await exportRes.json<{ ok: boolean; data: string }>()).data).toBe(VALID_SLIDES[0].payload);
    vi.useRealTimers();
  });
});

// ── Sprint 13 — POST /seek ────────────────────────────────────────────────────

describe("POST /seek", () => {
  it("returns error when no step-frames sequence is loaded", async () => {
    const res = await app.request("/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: 1 }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/no step-frames/);
  });

  it("returns error when frame index is out of range", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });
    const res = await app.request("/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: 5 }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/out of range/);
  });

  it("returns error for negative frame index", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });
    const res = await app.request("/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: -1 }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
  });

  it("jumps to the target frame and returns current_frame / total_frames", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });
    const res = await app.request("/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: 2 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, current_frame: 2, total_frames: 3 });
  });

  it("seek to frame 0 works from any position", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });
    // Advance to frame 2.
    await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    // Seek back to frame 0.
    const res = await app.request("/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: 0 }),
    });
    expect(await res.json()).toEqual({ ok: true, current_frame: 0, total_frames: 3 });
  });

  it("returns 400 for non-integer frame", async () => {
    const res = await app.request("/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: "two" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });
});

// ── Sprint 13 — POST /wait-click bugfix: broadcasts set_node_actions ─────────

describe("POST /wait-click — set_node_actions broadcast (Sprint 13 bugfix)", () => {
  it("resolves a pending /wait-click and the request returns { ok: true, type, id, label, action }", async () => {
    // Baseline: wait-click round-trip still works after the bugfix.
    const waitPromise = app.request("/wait-click", { method: "POST" });
    await new Promise((r) => setTimeout(r, 0));

    await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", id: "FE", label: "Frontend" }),
    });

    const res = await waitPromise;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, type: "node", id: "FE", label: "Frontend", action: null });
  });
});

// ── Sprint 14 — node_actions: popup menu action returned in click event ───────

describe("POST /node-click — Sprint 14: action field", () => {
  it("node click with action resolves /wait-click with action string", async () => {
    const waitPromise = app.request("/wait-click", { method: "POST" });
    await new Promise((r) => setTimeout(r, 0));

    await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", id: "B", label: "Server", action: "Drill down" }),
    });

    const res = await waitPromise;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, type: "node", id: "B", label: "Server", action: "Drill down" });
  });

  it("node click without action resolves /wait-click with action: null", async () => {
    const waitPromise = app.request("/wait-click", { method: "POST" });
    await new Promise((r) => setTimeout(r, 0));

    await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", id: "A", label: "Client" }),
    });

    const res = await waitPromise;
    expect(await res.json()).toEqual({ ok: true, type: "node", id: "A", label: "Client", action: null });
  });

  it("edge click always returns action: null (edges do not support popup)", async () => {
    const waitPromise = app.request("/wait-click", { method: "POST" });
    await new Promise((r) => setTimeout(r, 0));

    await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "edge", id: "L_A_B_0", label: "HTTP" }),
    });

    const res = await waitPromise;
    expect(await res.json()).toEqual({ ok: true, type: "edge", id: "L_A_B_0", label: "HTTP", action: null });
  });

  it("node-click with action resolves even when no /wait-click is pending (no-op)", async () => {
    const res = await app.request("/node-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", id: "B", label: "Server", action: "Explain" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ── Sprint 16 — render snapshot persistence ───────────────────────────────────

import * as snapshotModule from "../../../server/snapshot.js";
import * as snapshotReaderModule from "../../../server/snapshot-reader.js";
import { isValidWorkspaceName } from "../../../server/validate.js";

describe("POST /render — snapshot persistence (Sprint 16)", () => {
  beforeEach(() => {
    vi.mocked(snapshotModule.saveSnapshot).mockClear();
  });

  it("calls saveSnapshot with correct args after a valid mermaid render", async () => {
    const payload = "graph TD; A --> B";
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload, options: { workspace: WORKSPACE } }),
    });

    expect(snapshotModule.saveSnapshot).toHaveBeenCalledOnce();
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith("mermaid", payload, { title: undefined, workspace: WORKSPACE });
  });

  it("calls saveSnapshot with title when options.title is provided", async () => {
    const payload = "graph TD; A --> B";
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload, options: { workspace: WORKSPACE, title: "My diagram" } }),
    });

    expect(snapshotModule.saveSnapshot).toHaveBeenCalledOnce();
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith("mermaid", payload, { workspace: WORKSPACE, title: "My diagram" });
  });

  it("does NOT call saveSnapshot when render payload is invalid", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "bogus", options: { workspace: WORKSPACE } }),
    });

    expect(snapshotModule.saveSnapshot).not.toHaveBeenCalled();
  });

  it("does NOT call saveSnapshot on invalid mermaid syntax (Sprint 6 gate)", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A -->", options: { workspace: WORKSPACE } }),
    });

    expect(snapshotModule.saveSnapshot).not.toHaveBeenCalled();
  });

  it("calls saveSnapshot with type=step-frames for a valid step-frames render", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });

    expect(snapshotModule.saveSnapshot).toHaveBeenCalledOnce();
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith(
      "step-frames",
      THREE_FRAME_SEQUENCE,
      { title: undefined, node_to_frame: undefined, workspace: WORKSPACE }
    );
  });

  it("render still returns { ok: true } when saveSnapshot throws", async () => {
    vi.mocked(snapshotModule.saveSnapshot).mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "svg", payload: "<svg/>", options: { workspace: WORKSPACE } }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ── Sprint 17 — GET /snapshots ────────────────────────────────────────────────

describe("GET /snapshots", () => {
  beforeEach(() => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockClear();
  });

  it("returns { ok: true, snapshots: [] } when directory is empty", async () => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockReturnValue([]);
    const res = await app.request("/snapshots");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, snapshots: [] });
  });

  it("returns sorted snapshot list from listSnapshots", async () => {
    const entries = [
      { filename: "20260609_150000_screen.json", timestamp: "2026-06-09T15:00:00.000Z", type: "mermaid", title: "Diagram 2" },
      { filename: "20260609_140000_screen.json", timestamp: "2026-06-09T14:00:00.000Z", type: "html" },
    ];
    vi.mocked(snapshotReaderModule.listSnapshots).mockReturnValue(entries);
    const res = await app.request("/snapshots");
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; snapshots: typeof entries }>();
    expect(body.ok).toBe(true);
    expect(body.snapshots).toHaveLength(2);
    expect(body.snapshots[0].filename).toBe("20260609_150000_screen.json");
    expect(body.snapshots[0].title).toBe("Diagram 2");
    expect(body.snapshots[1].filename).toBe("20260609_140000_screen.json");
    expect(body.snapshots[1].title).toBeUndefined();
  });

  it("calls listSnapshots (delegating file skipping logic to snapshot-reader)", async () => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockReturnValue([
      { filename: "20260609_143000_screen.json", timestamp: "2026-06-09T14:30:00.000Z", type: "svg" },
    ]);
    const res = await app.request("/snapshots");
    expect(snapshotReaderModule.listSnapshots).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });
});

// ── Sprint 17 — POST /snapshots/load ─────────────────────────────────────────

const VALID_SNAPSHOT_JSON = JSON.stringify({
  timestamp: "2026-06-09T14:30:00.000Z",
  workspace: "agent-whiteboard",
  type: "mermaid",
  payload: "graph TD; A --> B",
  options: { title: "Loaded diagram" },
});

const VALID_SVG_SNAPSHOT_JSON = JSON.stringify({
  timestamp: "2026-06-09T14:31:00.000Z",
  workspace: "agent-whiteboard",
  type: "svg",
  payload: "<svg><circle r='5'/></svg>",
});

const VALID_STEP_FRAMES_SNAPSHOT_JSON = JSON.stringify({
  timestamp: "2026-06-09T14:32:00.000Z",
  workspace: "agent-whiteboard",
  type: "step-frames",
  payload: THREE_FRAME_SEQUENCE,
});

describe("POST /snapshots/load", () => {
  beforeEach(() => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockClear();
    vi.mocked(snapshotModule.saveSnapshot).mockClear();
  });

  it("loads a valid mermaid snapshot, updates canvas, does NOT call saveSnapshot", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_SNAPSHOT_JSON);

    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143000_screen.json" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(snapshotModule.saveSnapshot).not.toHaveBeenCalled();

    // Canvas state should now reflect the loaded snapshot.
    const exportRes = await app.request("/export");
    expect((await exportRes.json<{ ok: boolean; data: string }>()).data).toBe("graph TD; A --> B");
  });

  it("loads a valid svg snapshot without title", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_SVG_SNAPSHOT_JSON);

    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143100_screen.json" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const exportRes = await app.request("/export");
    expect((await exportRes.json<{ ok: boolean; data: string }>()).data).toBe("<svg><circle r='5'/></svg>");
  });

  it("loads a valid step-frames snapshot and leaves session in step-frames state", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_STEP_FRAMES_SNAPSHOT_JSON);

    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143200_screen.json" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // /step should work after loading step-frames snapshot.
    const stepRes = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    expect((await stepRes.json<{ ok: boolean }>()).ok).toBe(true);
  });

  it("returns { ok: false, error } when file is not found", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(null);

    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "missing_screen.json" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not found/);
  });

  it("rejects path traversal with ../ in filename", async () => {
    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "../etc/passwd_screen.json" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/path traversal/);
    expect(snapshotReaderModule.loadSnapshotContent).not.toHaveBeenCalled();
  });

  it("rejects filename with a slash", async () => {
    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "subdir/20260609_143000_screen.json" }),
    });

    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/path traversal/);
    expect(snapshotReaderModule.loadSnapshotContent).not.toHaveBeenCalled();
  });

  it("rejects filename that does not end with _screen.json", async () => {
    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143000_other.json" }),
    });

    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
  });

  it("returns { ok: false, error } for malformed JSON in snapshot file", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue("{ not valid json");

    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143000_screen.json" }),
    });

    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/malformed/);
  });

  it("returns { ok: false, error } when snapshot payload fails validation", async () => {
    const invalidSnapshot = JSON.stringify({
      timestamp: "2026-06-09T14:30:00.000Z",
      workspace: "agent-whiteboard",
      type: "mermaid",
      payload: "not a valid mermaid diagram",
    });
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(invalidSnapshot);

    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143000_screen.json" }),
    });

    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/diagram keyword/);
  });

  it("does NOT call saveSnapshot even when load succeeds", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_SVG_SNAPSHOT_JSON);

    await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143100_screen.json" }),
    });

    expect(snapshotModule.saveSnapshot).not.toHaveBeenCalled();
  });

  it("returns 400 when filename is not a string", async () => {
    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: 42 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });
});

// ── Sprint 18 — GET /snapshots/all ───────────────────────────────────────────

describe("GET /snapshots/all", () => {
  beforeEach(() => {
    vi.mocked(snapshotReaderModule.listAllSnapshots).mockClear();
  });

  it("returns { ok: true, workspaces: [] } when root directory is absent", async () => {
    vi.mocked(snapshotReaderModule.listAllSnapshots).mockReturnValue([]);
    const res = await app.request("/snapshots/all");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, workspaces: [] });
  });

  it("returns grouped workspaces with isCurrent flag", async () => {
    const groups = [
      {
        name: "project-a",
        isCurrent: false,
        snapshots: [
          { filename: "20260609_140000_screen.json", timestamp: "2026-06-09T14:00:00.000Z", type: "html" },
        ],
      },
      {
        name: "project-b",
        isCurrent: true,
        snapshots: [
          { filename: "20260609_150000_screen.json", timestamp: "2026-06-09T15:00:00.000Z", type: "mermaid", title: "Diagram B" },
        ],
      },
    ];
    vi.mocked(snapshotReaderModule.listAllSnapshots).mockReturnValue(groups);

    const res = await app.request("/snapshots/all");
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; workspaces: typeof groups }>();
    expect(body.ok).toBe(true);
    expect(body.workspaces).toHaveLength(2);
    expect(body.workspaces[0].name).toBe("project-a");
    expect(body.workspaces[0].isCurrent).toBe(false);
    expect(body.workspaces[1].name).toBe("project-b");
    expect(body.workspaces[1].isCurrent).toBe(true);
    expect(body.workspaces[1].snapshots[0].title).toBe("Diagram B");
  });

  it("calls listAllSnapshots (delegating file-skipping and sorting to snapshot-reader)", async () => {
    vi.mocked(snapshotReaderModule.listAllSnapshots).mockReturnValue([]);
    await app.request("/snapshots/all");
    expect(snapshotReaderModule.listAllSnapshots).toHaveBeenCalledOnce();
  });
});

// ── Sprint 18 — POST /snapshots/load workspace field ─────────────────────────

describe("POST /snapshots/load — workspace field (Sprint 18)", () => {
  beforeEach(() => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockClear();
    vi.mocked(snapshotModule.saveSnapshot).mockClear();
  });

  it("loads a snapshot from an explicit workspace", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_SNAPSHOT_JSON);

    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "other-project", filename: "20260609_143000_screen.json" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(snapshotReaderModule.loadSnapshotContent).toHaveBeenCalledWith(
      "other-project",
      expect.any(String),
      "20260609_143000_screen.json"
    );
  });

  it("defaults to lastWorkspace from last render() when workspace field is absent", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "svg", payload: "<svg/>", options: { workspace: "my-project" } }),
    });

    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_SVG_SNAPSHOT_JSON);

    await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143100_screen.json" }),
    });

    const [calledWorkspace] = vi.mocked(snapshotReaderModule.loadSnapshotContent).mock.calls[0];
    expect(calledWorkspace).toBe("my-project");
  });

  it("rejects workspace containing a forward slash", async () => {
    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "some/path", filename: "20260609_143000_screen.json" }),
    });

    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/path traversal/);
    expect(snapshotReaderModule.loadSnapshotContent).not.toHaveBeenCalled();
  });

  it("rejects workspace that is bare '..'", async () => {
    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "..", filename: "20260609_143000_screen.json" }),
    });

    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/path traversal/);
    expect(snapshotReaderModule.loadSnapshotContent).not.toHaveBeenCalled();
  });

  it("rejects workspace that is an empty string", async () => {
    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "", filename: "20260609_143000_screen.json" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });

  it("accepts workspace with dots and hyphens (e.g. my-project.v2)", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_SNAPSHOT_JSON);

    const res = await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "my-project.v2", filename: "20260609_143000_screen.json" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ── Sprint 19 — F14.4: isValidWorkspaceName unit tests ───────────────────────

describe("isValidWorkspaceName", () => {
  it("accepts simple alphanumeric names", () => {
    expect(isValidWorkspaceName("course1")).toBe(true);
    expect(isValidWorkspaceName("MyProject")).toBe(true);
    expect(isValidWorkspaceName("abc123")).toBe(true);
  });

  it("accepts names with dashes, underscores, dots, and spaces", () => {
    expect(isValidWorkspaceName("course-1")).toBe(true);
    expect(isValidWorkspaceName("course_1")).toBe(true);
    expect(isValidWorkspaceName("my.project")).toBe(true);
    expect(isValidWorkspaceName("my project")).toBe(true);
    expect(isValidWorkspaceName("course-1_v2.0")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidWorkspaceName("")).toBe(false);
  });

  it("rejects bare '..'", () => {
    expect(isValidWorkspaceName("..")).toBe(false);
  });

  it("rejects names containing a forward slash", () => {
    expect(isValidWorkspaceName("some/path")).toBe(false);
    expect(isValidWorkspaceName("/absolute")).toBe(false);
  });

  it("rejects names containing a backslash", () => {
    expect(isValidWorkspaceName("some\\path")).toBe(false);
  });

  it("rejects names containing null bytes", () => {
    expect(isValidWorkspaceName("bad\0name")).toBe(false);
  });

  it("rejects names with special shell characters", () => {
    expect(isValidWorkspaceName("bad!name")).toBe(false);
    expect(isValidWorkspaceName("bad@name")).toBe(false);
    expect(isValidWorkspaceName("bad#name")).toBe(false);
  });
});

// ── Sprint 19 — F14.5: POST /render — per-call workspace routing ─────────────

describe("POST /render — per-call workspace routing (Sprint 19 / F14)", () => {
  beforeEach(() => {
    vi.mocked(snapshotModule.saveSnapshot).mockClear();
  });

  it("passes options.workspace to saveSnapshot when valid", async () => {
    const payload = "graph TD; A-->B";
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload, options: { workspace: "course_1" } }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledOnce();
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith("mermaid", payload, {
      title: undefined,
      workspace: "course_1",
    });
  });

  it("passes both title and workspace to saveSnapshot", async () => {
    const payload = "graph TD; A-->B";
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload, options: { title: "Lesson 1", workspace: "course_2" } }),
    });

    expect(res.status).toBe(200);
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith("mermaid", payload, {
      title: "Lesson 1",
      workspace: "course_2",
    });
  });

  it("rejects an invalid workspace name (path separator)", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A-->B", options: { workspace: "../evil" } }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid workspace/);
    expect(snapshotModule.saveSnapshot).not.toHaveBeenCalled();
  });

  it("rejects '..' as workspace name", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A-->B", options: { workspace: ".." } }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(snapshotModule.saveSnapshot).not.toHaveBeenCalled();
  });

  it("returns { ok: false, error } when workspace is absent", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; X-->Y" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/workspace is required/);
    expect(snapshotModule.saveSnapshot).not.toHaveBeenCalled();
  });

  it("passes workspace to saveSnapshot for step-frames renders", async () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [{ label: "A", payload: "graph TD; A" }, { label: "B", payload: "graph TD; B" }],
    });
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload, options: { workspace: "course_3" } }),
    });

    expect(res.status).toBe(200);
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith("step-frames", payload, {
      title: undefined,
      node_to_frame: undefined,
      workspace: "course_3",
    });
  });
});

// ── Incremental step-frames builder (v0.8) ────────────────────────────────────

describe("POST /step-frames/init", () => {
  it("creates a builder and returns { ok: true, id } with a non-empty id", async () => {
    const res = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; id: string }>();
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
  });

  it("accepts an optional title", async () => {
    const res = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE, title: "My sequence" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json<{ ok: boolean }>()).ok).toBe(true);
  });

  it("rejects an unsupported frame_type", async () => {
    const res = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "d2", workspace: WORKSPACE }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/frame_type/);
  });

  it("rejects missing workspace", async () => {
    const res = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/workspace/);
  });

  it("rejects invalid workspace name", async () => {
    const res = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: "../etc" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
  });
});

describe("POST /step-frames/:id/frame", () => {
  async function initBuilder(title?: string) {
    const res = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE, ...(title ? { title } : {}) }),
    });
    const body = await res.json<{ ok: boolean; id: string }>();
    return body.id;
  }

  it("appends a valid frame and returns { ok: true, frame_count: 1 }", async () => {
    const id = await initBuilder();
    const res = await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, frame_count: 1 });
  });

  it("appends multiple frames and increments frame_count", async () => {
    const id = await initBuilder();
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A" }),
    });
    const res = await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A --> B", label: "Step 2" }),
    });
    expect(await res.json()).toEqual({ ok: true, frame_count: 2 });
  });

  it("returns 404 for unknown id", async () => {
    const res = await app.request("/step-frames/unknown-id/frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not found or expired/);
  });

  it("returns 400 for invalid mermaid payload", async () => {
    const id = await initBuilder();
    const res = await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "not a diagram" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/diagram keyword/);
  });

  it("returns 400 when payload is not a string", async () => {
    const id = await initBuilder();
    const res = await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: 42 }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean }>()).ok).toBe(false);
  });
});

describe("POST /step-frames/:id/commit", () => {
  async function initAndAppend(frameCount = 1) {
    const initRes = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE }),
    });
    const { id } = await initRes.json<{ ok: boolean; id: string }>();
    for (let i = 0; i < frameCount; i++) {
      await app.request(`/step-frames/${id}/frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: `graph TD; A${i}`, label: `Step ${i + 1}` }),
      });
    }
    return id;
  }

  it("commits a valid sequence and returns { ok: true }", async () => {
    const id = await initAndAppend(2);
    const res = await app.request(`/step-frames/${id}/commit`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("after commit, export returns the assembled step-frames JSON", async () => {
    const id = await initAndAppend(2);
    await app.request(`/step-frames/${id}/commit`, { method: "POST" });

    const exportRes = await app.request("/export");
    const body = await exportRes.json<{ ok: boolean; data: string }>();
    expect(body.ok).toBe(true);
    const parsed = JSON.parse(body.data) as { frame_type: string; frames: unknown[] };
    expect(parsed.frame_type).toBe("mermaid");
    expect(parsed.frames).toHaveLength(2);
  });

  it("after commit, step() works on the committed sequence", async () => {
    const id = await initAndAppend(3);
    await app.request(`/step-frames/${id}/commit`, { method: "POST" });

    const stepRes = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    expect(await stepRes.json()).toEqual({ ok: true, current_frame: 1, total_frames: 3 });
  });

  it("returns 404 for unknown id", async () => {
    const res = await app.request("/step-frames/unknown-id/commit", { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not found or expired/);
  });

  it("returns 400 for zero-frame sequence", async () => {
    const initRes = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE }),
    });
    const { id } = await initRes.json<{ ok: boolean; id: string }>();
    const res = await app.request(`/step-frames/${id}/commit`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/empty/);
  });

  it("calls saveSnapshot with the assembled payload after commit", async () => {
    const { saveSnapshot } = await import("../../../server/snapshot.js");
    const snapshotSpy = vi.mocked(saveSnapshot);
    snapshotSpy.mockClear();

    const id = await initAndAppend(1);
    await app.request(`/step-frames/${id}/commit`, { method: "POST" });

    expect(snapshotSpy).toHaveBeenCalledOnce();
    const [type, payload] = snapshotSpy.mock.calls[0];
    expect(type).toBe("step-frames");
    const parsed = JSON.parse(payload) as { frame_type: string; frames: unknown[] };
    expect(parsed.frame_type).toBe("mermaid");
    expect(parsed.frames).toHaveLength(1);
  });
});

// ── v0.9 — Live Step-Frames Preview ──────────────────────────────────────────

describe("POST /step-frames/:id/frame — live preview (v0.9)", () => {
  async function initBuilder(title?: string) {
    const res = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE, ...(title ? { title } : {}) }),
    });
    const body = await res.json<{ ok: boolean; id: string }>();
    return body.id;
  }

  it("calls broadcastStepFrames with frame_count=1, currentFrame=0 after first append", async () => {
    const { broadcastStepFrames } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastStepFrames);
    spy.mockClear();

    const id = await initBuilder();
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A", label: "Step 1" }),
    });

    expect(spy).toHaveBeenCalledOnce();
    const [frames, frameType, currentFrame] = spy.mock.calls[0];
    expect(frameType).toBe("mermaid");
    expect(frames).toHaveLength(1);
    expect(frames[0].payload).toBe("graph TD; A");
    expect(frames[0].label).toBe("Step 1");
    expect(currentFrame).toBe(0);
  });

  it("calls broadcastStepFrames positioned at the latest frame after each append", async () => {
    const { broadcastStepFrames } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastStepFrames);
    spy.mockClear();

    const id = await initBuilder();
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A" }),
    });
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A --> B", label: "Step 2" }),
    });

    expect(spy).toHaveBeenCalledTimes(2);
    const [frames2, , currentFrame2] = spy.mock.calls[1];
    expect(frames2).toHaveLength(2);
    expect(currentFrame2).toBe(1); // positioned at latest frame (index 1)
  });

  it("passes builder title to broadcastStepFrames", async () => {
    const { broadcastStepFrames } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastStepFrames);
    spy.mockClear();

    const id = await initBuilder("TCP Handshake");
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A" }),
    });

    const [, , , title] = spy.mock.calls[0];
    expect(title).toBe("TCP Handshake");
  });

  it("does NOT call broadcastStepFrames when payload is invalid", async () => {
    const { broadcastStepFrames } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastStepFrames);
    spy.mockClear();

    const id = await initBuilder();
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "not a diagram" }),
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("export() before commit returns pre-build canvas state (empty)", async () => {
    const id = await initBuilder();
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A" }),
    });
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A --> B" }),
    });

    const exportRes = await app.request("/export");
    const body = await exportRes.json<{ ok: boolean; data: string }>();
    expect(body.ok).toBe(true);
    // Canvas state was never updated by append_frame — still empty.
    expect(body.data).toBe("");
  });
});

describe("POST /step-frames/:id/commit — final broadcast (v0.9)", () => {
  async function initAndAppend(frameCount = 1) {
    const initRes = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE }),
    });
    const { id } = await initRes.json<{ ok: boolean; id: string }>();
    for (let i = 0; i < frameCount; i++) {
      await app.request(`/step-frames/${id}/frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: `graph TD; A${i}`, label: `Step ${i + 1}` }),
      });
    }
    return id;
  }

  it("calls broadcastStepFrames once at frame 0 after commit", async () => {
    const { broadcastStepFrames } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastStepFrames);
    spy.mockClear();

    const id = await initAndAppend(2);
    spy.mockClear(); // clear calls from append_frame previews
    await app.request(`/step-frames/${id}/commit`, { method: "POST" });

    expect(spy).toHaveBeenCalledOnce();
    const [frames, , currentFrame] = spy.mock.calls[0];
    expect(frames).toHaveLength(2);
    expect(currentFrame).toBe(0); // commit broadcasts at frame 0
  });
});
