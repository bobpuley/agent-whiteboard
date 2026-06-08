import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../server/app.js";
import { resetCanvas } from "../../../server/session.js";
import { cancelSlideshow } from "../../../server/slideshow.js";
import { resetClick } from "../../../server/events.js";

// Use a fresh app instance per suite; session state is reset between each test.
const app = createApp();

afterEach(() => {
  cancelSlideshow();
  resetCanvas();
  resetClick();
});

// ── POST /render ─────────────────────────────────────────────────────────────

describe("POST /render", () => {
  it("accepts a valid Mermaid payload and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects an unknown diagram keyword and returns { ok: false, error }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "invalid stuff" }),
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
      body: JSON.stringify({ type: "d2", payload: "x -> y" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });

  it("accepts svg type and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "svg", payload: "<svg><circle r='5'/></svg>" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts html type and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "html", payload: "<h1>Hello</h1>" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts katex type and returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "katex", payload: "E = mc^2" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("accepts vega-lite type with valid JSON and returns { ok: true }", async () => {
    const spec = JSON.stringify({ "$schema": "https://vega.github.io/schema/vega-lite/v5.json", "mark": "bar" });
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "vega-lite", payload: spec }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects vega-lite type with invalid JSON and returns { ok: false, error }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "vega-lite", payload: "not valid json {" }),
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
      body: JSON.stringify({ type: "mermaid", payload: "bogus" }),
    });

    const exportRes = await app.request("/export");
    expect(await exportRes.json()).toEqual({ ok: true, data: "" });
  });

  it("rejects valid keyword but broken Mermaid syntax (Sprint 6)", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A -->" }),
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
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A -->" }),
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
        body: JSON.stringify({ type: "mermaid", payload }),
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
      body: JSON.stringify({ type: "mermaid", payload }),
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
      body: JSON.stringify({ type: "svg", payload }),
    });

    const res = await app.request("/export");
    expect(await res.json()).toEqual({ ok: true, data: payload });
  });

  it("returns verbatim vega-lite payload after render", async () => {
    const payload = JSON.stringify({ mark: "bar" });

    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "vega-lite", payload }),
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
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B" }),
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
        options: { title: "My diagram" },
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
      body: JSON.stringify({ type: "mermaid", payload, options: { title: "My diagram" } }),
    });
    const res = await app.request("/export");
    expect(await res.json()).toEqual({ ok: true, data: payload });
  });

  it("render without options still returns { ok: true }", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B" }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects step-frames with invalid JSON", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: "not json {" }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/JSON/);
  });

  it("rejects step-frames with missing frames array", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: JSON.stringify({ frame_type: "mermaid" }) }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
  });

  it("export returns the original frames JSON after loading", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
      body: JSON.stringify({ type: "katex", payload: "E=mc^2" }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE }),
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
