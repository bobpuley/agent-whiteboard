// Pure Hono application — no startup side effects.
// Exported so tests can import it without spinning up a real server.

import { Hono } from "hono";
import { clearCanvas, exportCanvas, setCanvas } from "./session.js";
import { broadcast } from "./ws.js";

export const MERMAID_KEYWORDS = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "erDiagram",
  "gantt",
  "pie",
  "mindmap",
] as const;

export function isValidMermaid(payload: string): boolean {
  const first = payload.trimStart().split(/\s/)[0];
  return (MERMAID_KEYWORDS as readonly string[]).includes(first);
}

export function createApp(): Hono {
  const app = new Hono();

  app.post("/render", async (c) => {
    const body = await c.req.json<{ type?: string; payload?: string }>();
    if (body.type !== "mermaid" || typeof body.payload !== "string") {
      return c.json(
        { ok: false, error: "type must be 'mermaid' and payload must be a string" },
        400
      );
    }
    if (!isValidMermaid(body.payload)) {
      return c.json({
        ok: false,
        error:
          "invalid payload: mermaid source must begin with a diagram keyword " +
          "(e.g. 'graph TD', 'sequenceDiagram', 'classDiagram', ...)",
      });
    }
    setCanvas("mermaid", body.payload);
    broadcast({ action: "replace", type: "mermaid", payload: body.payload });
    return c.json({ ok: true });
  });

  app.post("/clear", (c) => {
    clearCanvas();
    broadcast({ action: "clear" });
    return c.json({ ok: true });
  });

  app.get("/export", (c) => {
    return c.json({ ok: true, data: exportCanvas() });
  });

  return app;
}
