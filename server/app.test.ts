import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { resetCanvas } from "./session.js";
import { cancelSlideshow } from "./slideshow.js";

// Use a fresh app instance per suite; session state is reset between each test.
const app = createApp();

afterEach(() => {
  cancelSlideshow();
  resetCanvas();
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
