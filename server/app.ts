// Pure Hono application — no startup side effects.
// Exported so tests can import it without spinning up a real server.

import { Hono } from "hono";
import { clearCanvas, exportCanvas, getCanvas, setCanvas, setStepFrames, stepCursor } from "./session.js";
import type { CanvasType, StepFrame } from "./session.js";
import { broadcast } from "./ws.js";
import { hasMermaidKeyword, parseMermaid } from "./validate.js";

// Re-export for tests that reference MERMAID_KEYWORDS / isValidMermaid directly.
export { MERMAID_KEYWORDS } from "./validate.js";
export function isValidMermaid(payload: string): boolean {
  return hasMermaidKeyword(payload);
}

const KNOWN_TYPES: readonly (CanvasType | "step-frames")[] = [
  "mermaid", "svg", "html", "katex", "vega-lite", "step-frames",
];

export function createApp(): Hono {
  const app = new Hono();

  app.post("/render", async (c) => {
    const body = await c.req.json<{ type?: string; payload?: string; options?: { title?: string } }>();

    if (typeof body.payload !== "string") {
      return c.json({ ok: false, error: "payload must be a string" }, 400);
    }

    if (!KNOWN_TYPES.includes(body.type as CanvasType)) {
      return c.json(
        {
          ok: false,
          error: `type must be one of: ${KNOWN_TYPES.join(", ")}`,
        },
        400
      );
    }

    const type = body.type as CanvasType | "step-frames";
    const { payload } = body;
    const title = body.options?.title;

    if (type === "mermaid") {
      if (!hasMermaidKeyword(payload)) {
        return c.json({
          ok: false,
          error:
            "invalid payload: mermaid source must begin with a diagram keyword " +
            "(e.g. 'graph TD', 'sequenceDiagram', 'classDiagram', ...)",
        });
      }
      try {
        await parseMermaid(payload);
      } catch (err) {
        return c.json({
          ok: false,
          error: `invalid mermaid syntax: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else if (type === "vega-lite") {
      try {
        JSON.parse(payload);
      } catch {
        return c.json({
          ok: false,
          error: "invalid payload: vega-lite payload must be valid JSON",
        });
      }
    } else if (type === "step-frames") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        return c.json({
          ok: false,
          error: "invalid payload: step-frames payload must be valid JSON",
        });
      }
      const spec = parsed as { frame_type?: string; frames?: unknown[] };
      if (
        typeof spec.frame_type !== "string" ||
        !Array.isArray(spec.frames) ||
        spec.frames.length === 0
      ) {
        return c.json({
          ok: false,
          error: 'invalid payload: step-frames must have "frame_type" (string) and "frames" (non-empty array)',
        });
      }
      const frames = spec.frames as StepFrame[];
      if (frames.some((f) => typeof f.payload !== "string")) {
        return c.json({
          ok: false,
          error: 'invalid payload: each frame must have a "payload" string',
        });
      }
      setStepFrames(frames, spec.frame_type, payload, title);
      broadcast({
        action: "replace",
        type: spec.frame_type,
        payload: frames[0].payload,
        frameLabel: frames[0].label,
        stepFrames: true,
        currentFrame: 0,
        totalFrames: frames.length,
        ...(title !== undefined ? { title } : {}),
      });
      return c.json({ ok: true });
    }
    // svg, html, katex: passthrough — no server-side content validation

    setCanvas(type as CanvasType, payload, title);
    broadcast({ action: "replace", type, payload, ...(title !== undefined ? { title } : {}) });
    return c.json({ ok: true });
  });

  app.post("/step", async (c) => {
    const body = await c.req.json<{ direction?: string }>();
    if (body.direction !== "next" && body.direction !== "prev") {
      return c.json(
        { ok: false, error: 'direction must be "next" or "prev"' },
        400
      );
    }
    const result = stepCursor(body.direction);
    if (!result) {
      return c.json({
        ok: false,
        error: "no step-frames sequence is loaded",
      });
    }
    // Push new frame to browser.
    const state = getCanvas();
    if (state.type === "step-frames") {
      const frame = state.frames[result.currentFrame];
      broadcast({
        action: "replace",
        type: state.frameType,
        payload: frame.payload,
        frameLabel: frame.label,
        stepFrames: true,
        currentFrame: result.currentFrame,
        totalFrames: result.totalFrames,
        ...(state.title !== undefined ? { title: state.title } : {}),
      });
    }
    return c.json({ ok: true, current_frame: result.currentFrame, total_frames: result.totalFrames });
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
