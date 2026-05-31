import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { resetCanvas } from "./session.js";

// Use a fresh app instance per suite; session state is reset between each test.
const app = createApp();

afterEach(() => {
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

  it("rejects a payload with wrong type and returns 400", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "d2", payload: "x -> y" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
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
