import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../server/app.js";
import { resetCanvas, resetLastWorkspace } from "../../../server/session.js";
import { cancelSlideshow } from "../../../server/slideshow.js";
import { resetClick } from "../../../server/events.js";
import { resetBuilders } from "../../../server/step-frames-builder.js";

const WORKSPACE = "test-workspace";

vi.mock("../../../server/snapshot.js", () => ({
  saveSnapshot: vi.fn(),
  generateSnapshotId: vi.fn(() => "test-uuid-generated"),
}));

vi.mock("../../../server/snapshot-reader.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/snapshot-reader.js")>();
  return {
    ...actual,
    listSnapshots: vi.fn(),
    listAllSnapshots: vi.fn(),
    loadSnapshotContent: vi.fn(),
    findSnapshotById: vi.fn(),
    findSnapshotByIdInWorkspace: vi.fn(),
  };
});

vi.mock("../../../server/ws.js", () => ({
  broadcast: vi.fn(),
  broadcastReplace: vi.fn(),
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

  it("rejects a frame whose payload fails validation for its effective type (B5 regression)", async () => {
    const { broadcast } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcast);
    spy.mockClear();

    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [
        { label: "Step 1", payload: "graph TD; A" },
        { label: "Step 2", payload: "not a valid diagram" },
      ],
    });
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload, options: { workspace: WORKSPACE } }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/mermaid/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("accepts a mixed-type sequence when each frame's own type is valid", async () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [
        { label: "Step 1", payload: "graph TD; A" },
        { label: "Step 2", type: "katex", payload: "E = mc^2" },
      ],
    });
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload, options: { workspace: WORKSPACE } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects a mixed-type sequence when a per-frame type override fails validation", async () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [
        { label: "Step 1", payload: "graph TD; A" },
        { label: "Step 2", type: "vega-lite", payload: "not json" },
      ],
    });
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload, options: { workspace: WORKSPACE } }),
    });
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/vega-lite/);
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

  it("broadcasts a frame's own type override, not the sequence-wide frame_type", async () => {
    const { broadcastStepFrames } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastStepFrames);

    const mixedSequence = JSON.stringify({
      frame_type: "mermaid",
      frames: [
        { label: "Step 1", payload: "graph TD; A" },
        { label: "Step 2", type: "katex", payload: "E = mc^2" },
      ],
    });
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: mixedSequence, options: { workspace: WORKSPACE } }),
    });

    spy.mockClear();
    await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });

    expect(spy).toHaveBeenCalledOnce();
    const [frames, , currentFrame] = spy.mock.calls[0];
    expect(frames[currentFrame]).toMatchObject({ type: "katex", payload: "E = mc^2" });
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
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000, workspace: WORKSPACE }),
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
        workspace: WORKSPACE,
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
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides: slides3, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 500, workspace: WORKSPACE }),
    });
    // Second call replaces the first.
    await app.request("/slideshow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: slides2, delay_ms: 500, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides, delay_ms: 1000, workspace: WORKSPACE }),
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
      body: JSON.stringify({ slides: VALID_SLIDES, delay_ms: 1000, workspace: WORKSPACE }),
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
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith(
      [{ type: "mermaid", payload }],
      { title: undefined, workspace: WORKSPACE },
      undefined,
      "test-uuid-generated"
    );
  });

  it("calls saveSnapshot with title when options.title is provided", async () => {
    const payload = "graph TD; A --> B";
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload, options: { workspace: WORKSPACE, title: "My diagram" } }),
    });

    expect(snapshotModule.saveSnapshot).toHaveBeenCalledOnce();
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith(
      [{ type: "mermaid", payload }],
      { workspace: WORKSPACE, title: "My diagram" },
      undefined,
      "test-uuid-generated"
    );
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
      [
        { type: "mermaid", label: "Step 1", payload: "graph TD; A" },
        { type: "mermaid", label: "Step 2", payload: "graph TD; A --> B" },
        { type: "mermaid", label: "Step 3", payload: "graph TD; A --> B --> C" },
      ],
      { title: undefined, node_to_frame: undefined, workspace: WORKSPACE },
      THREE_FRAME_SEQUENCE,
      "test-uuid-generated"
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

// ── Sprint 28 — GET /snapshots?workspace= explicit param (v0.15) ─────────────

describe("GET /snapshots — explicit ?workspace= param (v0.15)", () => {
  beforeEach(() => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockClear();
  });

  it("uses the explicit ?workspace= param instead of lastWorkspace", async () => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockReturnValue([]);

    // Set lastWorkspace to something different via a real render() call.
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B", options: { workspace: "browser-workspace" } }),
    });

    const res = await app.request("/snapshots?workspace=agent-workspace");
    expect(res.status).toBe(200);
    expect(snapshotReaderModule.listSnapshots).toHaveBeenCalledWith("agent-workspace", expect.any(String));
  });

  it("falls back to lastWorkspace when the param is absent (unchanged browser behavior)", async () => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockReturnValue([]);

    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B", options: { workspace: "browser-workspace" } }),
    });

    const res = await app.request("/snapshots");
    expect(res.status).toBe(200);
    expect(snapshotReaderModule.listSnapshots).toHaveBeenCalledWith("browser-workspace", expect.any(String));
  });

  it("returns 400 for an empty ?workspace= value", async () => {
    const res = await app.request("/snapshots?workspace=");
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean; error: string }>()).ok).toBe(false);
  });

  it("returns 400 when ?workspace= contains path-traversal characters", async () => {
    const res = await app.request(`/snapshots?workspace=${encodeURIComponent("../evil")}`);
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean; error: string }>()).error).toMatch(/path traversal/);
  });

  it("includes the id field in each returned entry (additive, from snapshot-reader)", async () => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockReturnValue([
      { id: "uuid-1", filename: "20260609_143000_screen.json", timestamp: "2026-06-09T14:30:00.000Z", type: "svg" },
    ]);
    const res = await app.request("/snapshots?workspace=agent-workspace");
    const body = await res.json<{ ok: boolean; snapshots: { id?: string }[] }>();
    expect(body.snapshots[0].id).toBe("uuid-1");
  });
});

// ── Sprint 17 — POST /snapshots/load ─────────────────────────────────────────

const VALID_SNAPSHOT_JSON = JSON.stringify({
  timestamp: "2026-06-09T14:30:00.000Z",
  workspace: "agent-whiteboard",
  cursor: 0,
  frames: [{ type: "mermaid", payload: "graph TD; A --> B" }],
  title: "Loaded diagram",
});

const VALID_SVG_SNAPSHOT_JSON = JSON.stringify({
  timestamp: "2026-06-09T14:31:00.000Z",
  workspace: "agent-whiteboard",
  cursor: 0,
  frames: [{ type: "svg", payload: "<svg><circle r='5'/></svg>" }],
});

const VALID_STEP_FRAMES_SNAPSHOT_JSON = JSON.stringify({
  timestamp: "2026-06-09T14:32:00.000Z",
  workspace: "agent-whiteboard",
  cursor: 0,
  frames: [
    { type: "mermaid", label: "Step 1", payload: "graph TD; A" },
    { type: "mermaid", label: "Step 2", payload: "graph TD; A --> B" },
    { type: "mermaid", label: "Step 3", payload: "graph TD; A --> B --> C" },
  ],
  rawPayload: THREE_FRAME_SEQUENCE,
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
      cursor: 0,
      frames: [{ type: "mermaid", payload: "not a valid mermaid diagram" }],
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

// ── Sprint 23 — v0.10: POST /snapshots/load updates lastWorkspace ─────────────

describe("POST /snapshots/load — lastWorkspace update (v0.10)", () => {
  beforeEach(() => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockClear();
    vi.mocked(snapshotReaderModule.listAllSnapshots).mockClear();
  });

  it("updates lastWorkspace so GET /snapshots/all marks the loaded workspace as current", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_SNAPSHOT_JSON);
    vi.mocked(snapshotReaderModule.listAllSnapshots).mockImplementation((_root, currentWs) => [
      { name: "original-project", isCurrent: currentWs === "original-project", snapshots: [] },
      { name: "other-project", isCurrent: currentWs === "other-project", snapshots: [] },
    ]);

    await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "other-project", filename: "20260609_143000_screen.json" }),
    });

    const res = await app.request("/snapshots/all");
    const body = await res.json<{ ok: boolean; workspaces: { name: string; isCurrent: boolean; snapshots: unknown[] }[] }>();

    expect(body.ok).toBe(true);
    const other = body.workspaces.find((g) => g.name === "other-project");
    expect(other?.isCurrent).toBe(true);
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
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith(
      [{ type: "mermaid", payload }],
      { title: undefined, workspace: "course_1" },
      undefined,
      "test-uuid-generated"
    );
  });

  it("passes both title and workspace to saveSnapshot", async () => {
    const payload = "graph TD; A-->B";
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload, options: { title: "Lesson 1", workspace: "course_2" } }),
    });

    expect(res.status).toBe(200);
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith(
      [{ type: "mermaid", payload }],
      { title: "Lesson 1", workspace: "course_2" },
      undefined,
      "test-uuid-generated"
    );
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
    expect(snapshotModule.saveSnapshot).toHaveBeenCalledWith(
      [
        { type: "mermaid", label: "A", payload: "graph TD; A" },
        { type: "mermaid", label: "B", payload: "graph TD; B" },
      ],
      { title: undefined, node_to_frame: undefined, workspace: "course_3" },
      payload,
      "test-uuid-generated"
    );
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

  it("accepts a per-frame type override that differs from the sequence's frame_type", async () => {
    const id = await initBuilder(); // frame_type: mermaid
    const res = await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "E = mc^2", type: "katex" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, frame_count: 1 });
  });

  it("returns 400 when a per-frame type override fails validation", async () => {
    const id = await initBuilder(); // frame_type: mermaid
    const res = await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "not json", type: "vega-lite" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/vega-lite/);
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

  it("a mermaid+katex sequence built via append_frame renders each frame's own type on step/seek", async () => {
    const { broadcastReplace, broadcastStepFrames } = await import("../../../server/ws.js");
    const stepSpy = vi.mocked(broadcastStepFrames);
    const seekSpy = vi.mocked(broadcastReplace);

    const initRes = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE }),
    });
    const { id } = await initRes.json<{ ok: boolean; id: string }>();
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A", label: "Diagram" }),
    });
    await app.request(`/step-frames/${id}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "E = mc^2", label: "Formula", type: "katex" }),
    });
    await app.request(`/step-frames/${id}/commit`, { method: "POST" });

    stepSpy.mockClear();
    const stepRes = await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
    expect(await stepRes.json()).toEqual({ ok: true, current_frame: 1, total_frames: 2 });
    const [stepFrames, , stepCurrentFrame] = stepSpy.mock.calls[0];
    expect(stepFrames[stepCurrentFrame]).toMatchObject({ type: "katex", payload: "E = mc^2" });

    seekSpy.mockClear();
    const seekRes = await app.request("/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: 0 }),
    });
    expect(await seekRes.json()).toEqual({ ok: true, current_frame: 0, total_frames: 2 });
    expect(seekSpy.mock.calls[0][0]).toMatchObject({ type: "mermaid", payload: "graph TD; A" });
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
    const [frames] = snapshotSpy.mock.calls[0];
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ type: "mermaid" });
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

    const [, , , , title] = spy.mock.calls[0];
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

// ── v0.11 — Export by Graph ID ────────────────────────────────────────────────

describe("POST /render — returns id in response (v0.11)", () => {
  it("includes id in response when saveSnapshot returns a UUID", async () => {
    const snapshotModule = await import("../../../server/snapshot.js");
    vi.mocked(snapshotModule.saveSnapshot).mockReturnValueOnce("test-uuid-render-001");

    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A --> B", options: { workspace: WORKSPACE } }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "test-uuid-render-001" });
  });

  it("omits id from response when saveSnapshot returns undefined (write failure)", async () => {
    const snapshotModule = await import("../../../server/snapshot.js");
    vi.mocked(snapshotModule.saveSnapshot).mockReturnValueOnce(undefined);

    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "html", payload: "<p>test</p>", options: { workspace: WORKSPACE } }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("includes id in response for step-frames render", async () => {
    const snapshotModule = await import("../../../server/snapshot.js");
    vi.mocked(snapshotModule.saveSnapshot).mockReturnValueOnce("test-uuid-sf-001");

    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [{ payload: "graph TD; A --> B" }],
    });
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload, options: { workspace: WORKSPACE } }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "test-uuid-sf-001" });
  });
});

describe("POST /step-frames/:id/commit — returns id in response (v0.11)", () => {
  it("includes id in response when saveSnapshot returns a UUID", async () => {
    const snapshotModule = await import("../../../server/snapshot.js");

    const initRes = await app.request("/step-frames/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_type: "mermaid", workspace: WORKSPACE }),
    });
    const { id: builderId } = await initRes.json<{ ok: boolean; id: string }>();

    await app.request(`/step-frames/${builderId}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "graph TD; A --> B" }),
    });

    vi.mocked(snapshotModule.saveSnapshot).mockReturnValueOnce("test-uuid-commit-001");

    const commitRes = await app.request(`/step-frames/${builderId}/commit`, { method: "POST" });
    expect(commitRes.status).toBe(200);
    expect(await commitRes.json()).toEqual({ ok: true, id: "test-uuid-commit-001" });
  });
});

describe("GET /export?id — snapshot lookup by UUID (v0.11)", () => {
  let snapshotReaderModule: typeof import("../../../server/snapshot-reader.js");

  beforeEach(async () => {
    snapshotReaderModule = await import("../../../server/snapshot-reader.js");
    vi.mocked(snapshotReaderModule.findSnapshotById).mockClear();
  });

  it("returns the snapshot payload when id matches", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotById).mockReturnValueOnce("graph TD; A --> B");

    const res = await app.request("/export?id=test-uuid-abc-123");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: "graph TD; A --> B" });
    expect(snapshotReaderModule.findSnapshotById).toHaveBeenCalledOnce();
    expect(snapshotReaderModule.findSnapshotById).toHaveBeenCalledWith("test-uuid-abc-123", expect.any(String));
  });

  it("returns 404 with graph not found error when id does not match", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotById).mockReturnValueOnce(null);

    const res = await app.request("/export?id=nonexistent-uuid");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "graph not found" });
  });

  it("falls back to canvas state when id param is absent", async () => {
    // First render something so canvas is not blank.
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "html", payload: "<b>hello</b>", options: { workspace: WORKSPACE } }),
    });

    const res = await app.request("/export");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: "<b>hello</b>" });
    expect(snapshotReaderModule.findSnapshotById).not.toHaveBeenCalled();
  });

  it("falls back to canvas state when id param is empty string", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "html", payload: "<i>test</i>", options: { workspace: WORKSPACE } }),
    });

    const res = await app.request("/export?id=");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: "<i>test</i>" });
    expect(snapshotReaderModule.findSnapshotById).not.toHaveBeenCalled();
  });
});

// ── v0.12 — Snapshot delete endpoints ────────────────────────────────────────

import { mkdirSync, writeFileSync, existsSync, rmSync as fsRmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { getLastWorkspace } from "../../../server/session.js";

const BASE_SNAP_ROOT = pathJoin(tmpdir(), `whiteboard-delete-tests-${process.pid}`);

function makeSnapRoot(suffix: string) {
  return pathJoin(BASE_SNAP_ROOT, suffix);
}

function createWorkspace(root: string, ws: string, filenames: string[]) {
  const dir = pathJoin(root, ws);
  mkdirSync(dir, { recursive: true });
  const stub = JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", payload: "graph TD; A" });
  for (const f of filenames) writeFileSync(pathJoin(dir, f), stub);
}

describe("POST /snapshots/delete-files (v0.12)", () => {
  const SNAP_ROOT = makeSnapRoot("delete-files");

  beforeEach(() => {
    process.env.WHITEBOARD_SNAPSHOTS_DIR = SNAP_ROOT;
    createWorkspace(SNAP_ROOT, "test-ws", [
      "20260101_000000_screen.json",
      "20260101_000001_screen.json",
    ]);
  });

  afterEach(() => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    try { fsRmSync(SNAP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("deletes a single file and returns { ok: true, deleted: 1 }", async () => {
    const res = await app.request("/snapshots/delete-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws", filenames: ["20260101_000000_screen.json"] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; deleted: number }>();
    expect(body).toEqual({ ok: true, deleted: 1 });
    expect(existsSync(pathJoin(SNAP_ROOT, "test-ws", "20260101_000000_screen.json"))).toBe(false);
    expect(existsSync(pathJoin(SNAP_ROOT, "test-ws", "20260101_000001_screen.json"))).toBe(true);
  });

  it("deletes multiple files in one request", async () => {
    const res = await app.request("/snapshots/delete-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace: "test-ws",
        filenames: ["20260101_000000_screen.json", "20260101_000001_screen.json"],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 2 });
  });

  it("skips missing files silently and returns deleted: 0", async () => {
    const res = await app.request("/snapshots/delete-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws", filenames: ["missing_screen.json"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 0 });
  });

  it("returns 404 when workspace does not exist", async () => {
    const res = await app.request("/snapshots/delete-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "nonexistent", filenames: ["20260101_000000_screen.json"] }),
    });
    expect(res.status).toBe(404);
    expect((await res.json<{ ok: boolean; error: string }>()).ok).toBe(false);
  });

  it("rejects path-traversal in filename", async () => {
    const res = await app.request("/snapshots/delete-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws", filenames: ["../other_screen.json"] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean }>()).ok).toBe(false);
  });

  it("rejects path-traversal in workspace", async () => {
    const res = await app.request("/snapshots/delete-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "../evil", filenames: ["20260101_000000_screen.json"] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean }>()).ok).toBe(false);
  });

  it("rejects empty filenames array", async () => {
    const res = await app.request("/snapshots/delete-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws", filenames: [] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean }>()).ok).toBe(false);
  });
});

describe("POST /snapshots/delete-workspace (v0.12)", () => {
  const SNAP_ROOT = makeSnapRoot("delete-workspace");

  beforeEach(() => {
    process.env.WHITEBOARD_SNAPSHOTS_DIR = SNAP_ROOT;
    createWorkspace(SNAP_ROOT, "test-ws", ["20260101_000000_screen.json"]);
  });

  afterEach(() => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    try { fsRmSync(SNAP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("removes the workspace directory entirely and returns { ok: true }", async () => {
    const res = await app.request("/snapshots/delete-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(existsSync(pathJoin(SNAP_ROOT, "test-ws"))).toBe(false);
  });

  it("resets lastWorkspace to empty string when deleted workspace matches", async () => {
    // Simulate a render that sets lastWorkspace to "test-ws".
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "svg", payload: "<svg/>", options: { workspace: "test-ws" } }),
    });
    expect(getLastWorkspace()).toBe("test-ws");

    await app.request("/snapshots/delete-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws" }),
    });

    expect(getLastWorkspace()).toBe("");
  });

  it("does NOT reset lastWorkspace when deleted workspace does not match", async () => {
    createWorkspace(SNAP_ROOT, "other-ws", ["20260101_000000_screen.json"]);
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "svg", payload: "<svg/>", options: { workspace: "other-ws" } }),
    });
    expect(getLastWorkspace()).toBe("other-ws");

    await app.request("/snapshots/delete-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws" }),
    });

    expect(getLastWorkspace()).toBe("other-ws");
  });

  it("returns 404 when workspace does not exist", async () => {
    const res = await app.request("/snapshots/delete-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not found/);
  });

  it("rejects path-traversal in workspace", async () => {
    const res = await app.request("/snapshots/delete-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "../evil" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean }>()).ok).toBe(false);
  });

  it("rejects a bare '.' workspace and deletes nothing (B6)", async () => {
    const res = await app.request("/snapshots/delete-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "." }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean }>()).ok).toBe(false);
    // The snapshots root itself, and the workspace created in beforeEach, must survive.
    expect(existsSync(SNAP_ROOT)).toBe(true);
    expect(existsSync(pathJoin(SNAP_ROOT, "test-ws"))).toBe(true);
  });
});

// ── v0.19 — Mermaid viewport persistence (F19/C3) ────────────────────────────

describe("POST /viewport (v0.19)", () => {
  const SNAP_ROOT = makeSnapRoot("viewport");

  beforeEach(() => {
    process.env.WHITEBOARD_SNAPSHOTS_DIR = SNAP_ROOT;
  });

  afterEach(() => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    try { fsRmSync(SNAP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("persists a valid viewport and returns { ok: true }", async () => {
    const res = await app.request("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "snap-1", scale: 1.4, positionX: 0.12, positionY: -0.05 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const { getViewport } = await import("../../../server/viewport-cache.js");
    expect(getViewport("snap-1")).toEqual({ scale: 1.4, positionX: 0.12, positionY: -0.05 });
  });

  it("rejects a missing id", async () => {
    const res = await app.request("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scale: 1, positionX: 0, positionY: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/id/);
  });

  it("rejects a non-finite scale", async () => {
    const res = await app.request("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "snap-1", scale: "big", positionX: 0, positionY: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/scale/);
  });

  it("rejects a missing positionX", async () => {
    const res = await app.request("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "snap-1", scale: 1, positionY: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.error).toMatch(/positionX/);
  });

  it("rejects a missing positionY", async () => {
    const res = await app.request("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "snap-1", scale: 1, positionX: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.error).toMatch(/positionY/);
  });

  it("overwrites a previous entry for the same id", async () => {
    await app.request("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "snap-1", scale: 1, positionX: 0, positionY: 0 }),
    });
    await app.request("/viewport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "snap-1", scale: 2, positionX: 0.3, positionY: 0.4 }),
    });
    const { getViewport } = await import("../../../server/viewport-cache.js");
    expect(getViewport("snap-1")).toEqual({ scale: 2, positionX: 0.3, positionY: 0.4 });
  });
});

describe("POST /render — id in broadcast (v0.19)", () => {
  beforeEach(async () => {
    const { broadcastReplace, broadcastStepFrames } = await import("../../../server/ws.js");
    vi.mocked(broadcastReplace).mockClear();
    vi.mocked(broadcastStepFrames).mockClear();
  });

  it("includes id in the broadcast for a plain render", async () => {
    const { broadcastReplace } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastReplace);

    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "mermaid", payload: "graph TD; A", options: { workspace: WORKSPACE } }),
    });

    expect(spy.mock.calls[0][0]).toMatchObject({ id: "test-uuid-generated" });
  });

  it("includes id in the broadcast for a step-frames render", async () => {
    const { broadcastReplace } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastReplace);

    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });

    expect(spy.mock.calls[0][0]).toMatchObject({ id: "test-uuid-generated" });
  });

  it("step() re-broadcasts the same id the sequence was created with", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });

    const { broadcastStepFrames } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastStepFrames);
    spy.mockClear();

    await app.request("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });

    const [, , , id] = spy.mock.calls[0];
    expect(id).toBe("test-uuid-generated");
  });

  it("seek() re-broadcasts the same id the sequence was created with", async () => {
    await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "step-frames", payload: THREE_FRAME_SEQUENCE, options: { workspace: WORKSPACE } }),
    });

    const { broadcastReplace } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastReplace);
    spy.mockClear();

    await app.request("/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: 2 }),
    });

    expect(spy.mock.calls[0][0]).toMatchObject({ id: "test-uuid-generated" });
  });
});

describe("POST /snapshots/load — id + viewport in broadcast (v0.19)", () => {
  const SNAP_ROOT = makeSnapRoot("load-viewport");

  beforeEach(async () => {
    process.env.WHITEBOARD_SNAPSHOTS_DIR = SNAP_ROOT;
    const { broadcastReplace } = await import("../../../server/ws.js");
    vi.mocked(broadcastReplace).mockClear();
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockClear();
  });

  afterEach(() => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    try { fsRmSync(SNAP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const SNAPSHOT_WITH_ID = JSON.stringify({
    id: "loaded-id-1",
    timestamp: "2026-06-09T14:30:00.000Z",
    workspace: "agent-whiteboard",
    cursor: 0,
    frames: [{ type: "mermaid", payload: "graph TD; A --> B" }],
  });

  it("includes the loaded snapshot's id in the broadcast", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(SNAPSHOT_WITH_ID);

    const { broadcastReplace } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastReplace);

    await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143000_screen.json" }),
    });

    expect(spy.mock.calls[0][0]).toMatchObject({ id: "loaded-id-1" });
  });

  it("includes a cached viewport in the broadcast when one exists for that id", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(SNAPSHOT_WITH_ID);
    const { setViewport } = await import("../../../server/viewport-cache.js");
    setViewport("loaded-id-1", { scale: 1.7, positionX: 0.2, positionY: -0.1 });

    const { broadcastReplace } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastReplace);

    await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143000_screen.json" }),
    });

    expect(spy.mock.calls[0][0]).toMatchObject({
      id: "loaded-id-1",
      viewport: { scale: 1.7, positionX: 0.2, positionY: -0.1 },
    });
  });

  it("omits viewport when no cache entry exists for that id", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(SNAPSHOT_WITH_ID);

    const { broadcastReplace } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastReplace);

    await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260609_143000_screen.json" }),
    });

    // broadcastReplace() itself omits the key from the wire message when
    // undefined (verified directly in ws.test.ts) — here we just confirm the
    // call site passes no viewport through.
    expect(spy.mock.calls[0][0].viewport).toBeUndefined();
  });

  it("synthesizes a fresh id when the loaded snapshot has no id field", async () => {
    const noIdSnapshot = JSON.stringify({
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "agent-whiteboard",
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A" }],
    });
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(noIdSnapshot);

    const { broadcastReplace } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcastReplace);

    await app.request("/snapshots/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "20260101_000000_screen.json" }),
    });

    // id/cursor/total are mandatory on every broadcast (v0.26 Sprint 42) — a
    // legacy snapshot with no id field gets a freshly synthesized one instead
    // of omitting the key; it has no viewport-cache entry either, so the
    // browser still auto-fits exactly as it did when id was omitted.
    expect(spy.mock.calls[0][0]).toMatchObject({ id: "test-uuid-generated", cursor: 0, total: 1 });
    expect(spy.mock.calls[0][0].viewport).toBeUndefined();
  });
});

describe("viewport-cache cleanup on delete (v0.19)", () => {
  const SNAP_ROOT = makeSnapRoot("viewport-delete");

  function writeSnapshotWithId(root: string, ws: string, filename: string, id: string) {
    const dir = pathJoin(root, ws);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      pathJoin(dir, filename),
      JSON.stringify({ id, timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", payload: "graph TD; A" })
    );
  }

  beforeEach(() => {
    process.env.WHITEBOARD_SNAPSHOTS_DIR = SNAP_ROOT;
  });

  afterEach(() => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    try { fsRmSync(SNAP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("POST /snapshots/delete-files removes the matching viewport-cache entry", async () => {
    writeSnapshotWithId(SNAP_ROOT, "test-ws", "20260101_000000_screen.json", "id-to-delete");
    writeSnapshotWithId(SNAP_ROOT, "test-ws", "20260101_000001_screen.json", "id-to-keep");

    const { setViewport, getViewport } = await import("../../../server/viewport-cache.js");
    setViewport("id-to-delete", { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-to-keep", { scale: 2, positionX: 0.1, positionY: 0.1 });

    const res = await app.request("/snapshots/delete-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws", filenames: ["20260101_000000_screen.json"] }),
    });
    expect(res.status).toBe(200);

    expect(getViewport("id-to-delete")).toBeUndefined();
    expect(getViewport("id-to-keep")).toEqual({ scale: 2, positionX: 0.1, positionY: 0.1 });
  });

  it("POST /snapshots/delete-workspace removes every viewport-cache entry for that workspace", async () => {
    writeSnapshotWithId(SNAP_ROOT, "test-ws", "20260101_000000_screen.json", "ws-id-1");
    writeSnapshotWithId(SNAP_ROOT, "test-ws", "20260101_000001_screen.json", "ws-id-2");
    writeSnapshotWithId(SNAP_ROOT, "other-ws", "20260101_000000_screen.json", "other-ws-id");

    const { setViewport, getViewport } = await import("../../../server/viewport-cache.js");
    setViewport("ws-id-1", { scale: 1, positionX: 0, positionY: 0 });
    setViewport("ws-id-2", { scale: 1, positionX: 0, positionY: 0 });
    setViewport("other-ws-id", { scale: 1, positionX: 0, positionY: 0 });

    const res = await app.request("/snapshots/delete-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "test-ws" }),
    });
    expect(res.status).toBe(200);

    expect(getViewport("ws-id-1")).toBeUndefined();
    expect(getViewport("ws-id-2")).toBeUndefined();
    expect(getViewport("other-ws-id")).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });
});

// ── v0.13 — HTML Export ───────────────────────────────────────────────────────

describe("POST /export-html (v0.13)", () => {
  const VALID_KATEX_RECORD = JSON.stringify({
    frames: [{ type: "katex", payload: "x^2 + y^2 = r^2" }],
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  beforeEach(() => {
    process.env.WHITEBOARD_SNAPSHOTS_DIR = makeSnapRoot("export-html");
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockClear();
  });

  afterEach(() => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
  });

  it("returns 400 when items is missing", async () => {
    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean; error: string }>()).ok).toBe(false);
  });

  it("returns 400 when items is an empty array", async () => {
    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean; error: string }>()).ok).toBe(false);
  });

  it("returns 400 when workspace contains path-traversal characters", async () => {
    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "../evil", filename: "20260101_000000_screen.json" }],
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean; error: string }>()).error).toMatch(/no valid items/);
  });

  it("returns 400 when filename does not match the safe pattern", async () => {
    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "my-ws", filename: "../evil.json" }],
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean; error: string }>()).error).toMatch(/no valid items/);
  });

  it("returns 400 when all snapshots are unreadable (loadSnapshotContent returns null)", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(null);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "my-ws", filename: "20260101_000000_screen.json" }],
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean; error: string }>()).error).toMatch(/no valid items/);
  });

  it("skips unreadable snapshot and still exports the remaining valid item", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent)
      .mockReturnValueOnce(null)                // first item: unreadable
      .mockReturnValueOnce(VALID_KATEX_RECORD); // second item: valid

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { workspace: "my-ws", filename: "20260101_000000_screen.json" },
          { workspace: "my-ws", filename: "20260101_000001_screen.json" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });

  it("returns 200 with HTML body and correct headers for a valid single-workspace export", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_KATEX_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "my-ws", filename: "20260101_000000_screen.json" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toMatch(/my-ws/);
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("uses 'export-' filename prefix when items span multiple workspaces", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_KATEX_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { workspace: "ws-a", filename: "20260101_000000_screen.json" },
          { workspace: "ws-b", filename: "20260101_000001_screen.json" },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toMatch(/export-/);
  });

  // v0.14 — Mermaid export fix (Sprint 27): server no longer pre-renders
  // Mermaid via happy-dom; raw source is embedded and rendered client-side.
  const VALID_MERMAID_RECORD = JSON.stringify({
    frames: [{ type: "mermaid", payload: "graph TD; A --> B" }],
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  const STEP_FRAMES_MERMAID_RECORD = JSON.stringify({
    frames: [
      { type: "mermaid", label: "Phase 1", payload: "graph LR\n  A([Push]) --> B[Install deps]" },
      { type: "mermaid", label: "Phase 2", payload: "graph LR\n  A([Push]) --> B[Install deps] --> C[Typecheck]" },
    ],
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  // Regression: previously threw "Could not find a suitable point for the
  // given distance" under happy-dom (edge labels + cylinder node shape).
  const EDGE_LABEL_CYLINDER_RECORD = JSON.stringify({
    frames: [{ type: "mermaid", payload: "graph TD\n  FE[Frontend]\n  BE[Backend]\n  DB[(Database)]\n  FE -->|HTTP| BE\n  BE -->|Query| DB" }],
    timestamp: "2026-01-01T00:00:00.000Z",
  });

  it("embeds raw mermaid source in a .mermaid container instead of a pre-rendered SVG", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_MERMAID_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "my-ws", filename: "20260101_000000_screen.json" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<pre class="mermaid">graph TD; A --&gt; B</pre>');
    expect(body).not.toContain('<p class="export-error">');
  });

  it("embeds the mermaid.js bundle and bootstrap script when mermaid items are present", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_MERMAID_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "my-ws", filename: "20260101_000000_screen.json" }],
      }),
    });

    const body = await res.text();
    expect(body).toContain('mermaid.initialize({ startOnLoad: false, securityLevel: "strict" })');
    expect(body).toContain('mermaid.run({ querySelector: ".mermaid" })');
    expect(body).not.toMatch(/<script src=["']https?:/);
  });

  it("does not embed the mermaid bundle when no mermaid items are present", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(VALID_KATEX_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "my-ws", filename: "20260101_000000_screen.json" }],
      }),
    });

    const body = await res.text();
    expect(body).not.toContain("mermaid.initialize");
  });

  it("renders each mermaid frame of a step-frames sequence as its own container, with no export-error", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(STEP_FRAMES_MERMAID_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "my-ws", filename: "20260101_000000_screen.json" }],
      }),
    });

    const body = await res.text();
    expect(body).not.toContain('<p class="export-error">');
    expect((body.match(/<pre class="mermaid">/g) ?? []).length).toBe(2);
    expect(body).toContain("mermaid.initialize");
  });

  it("does not error on a mermaid diagram with edge labels and a cylinder node (regression)", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(EDGE_LABEL_CYLINDER_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ workspace: "my-ws", filename: "20260101_000000_screen.json" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain('<p class="export-error">');
    expect(body).toContain('<pre class="mermaid">');
  });
});

// ── Sprint 28 — POST /export-html: { workspace, id } items (v0.15) ───────────

describe("POST /export-html — { workspace, id } items (v0.15)", () => {
  const VALID_KATEX_RECORD = {
    frames: [{ type: "katex", payload: "x^2 + y^2 = r^2" }],
    timestamp: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    process.env.WHITEBOARD_SNAPSHOTS_DIR = makeSnapRoot("export-html-id");
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace).mockReset();
  });

  afterEach(() => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
  });

  it("resolves an { workspace, id } item via findSnapshotByIdInWorkspace and returns 200 HTML", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace).mockReturnValue(VALID_KATEX_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ workspace: "my-ws", id: "uuid-1" }] }),
    });

    expect(res.status).toBe(200);
    expect(snapshotReaderModule.findSnapshotByIdInWorkspace).toHaveBeenCalledWith("my-ws", "uuid-1", expect.any(String));
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("skips an unresolvable id and returns 400 when it is the only item", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace).mockReturnValue(null);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ workspace: "my-ws", id: "uuid-missing" }] }),
    });

    expect(res.status).toBe(400);
    expect((await res.json<{ ok: boolean; error: string }>()).error).toMatch(/no valid items/);
  });

  it("accepts filename-based and id-based items in the same request", async () => {
    vi.mocked(snapshotReaderModule.loadSnapshotContent).mockReturnValue(
      JSON.stringify({ frames: [{ type: "katex", payload: "a^2" }], timestamp: "2026-01-01T00:00:00.000Z" })
    );
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace).mockReturnValue(VALID_KATEX_RECORD);

    const res = await app.request("/export-html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { workspace: "my-ws", filename: "20260101_000000_screen.json" },
          { workspace: "my-ws", id: "uuid-1" },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(snapshotReaderModule.loadSnapshotContent).toHaveBeenCalled();
    expect(snapshotReaderModule.findSnapshotByIdInWorkspace).toHaveBeenCalled();
  });
});
