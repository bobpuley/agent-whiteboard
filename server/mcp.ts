// MCP tool definitions and handlers.
// Tools: render, clear, export, step.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { clearCanvas, exportCanvas, getCanvas, setCanvas, setStepFrames, stepCursor } from "./session.js";
import type { StepFrame } from "./session.js";
import { broadcast } from "./ws.js";
import { hasMermaidKeyword, parseMermaid } from "./validate.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "agent-whiteboard",
    version: "0.1.0",
  });

  // render(type, payload) — push content to the canvas.
  server.registerTool(
    "render",
    {
      description:
        "Push content to the whiteboard canvas. The payload always replaces the current canvas state.\n" +
        "Supported types:\n" +
        '  • "mermaid"     — Mermaid diagram source. Must begin with a diagram keyword (graph, flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap). Example: render({ type: "mermaid", payload: "graph TD; A --> B" })\n' +
        '  • "svg"         — Inline SVG markup. Example: render({ type: "svg", payload: "<svg>...</svg>" })\n' +
        '  • "html"        — HTML/CSS fragment. Example: render({ type: "html", payload: "<h1>Hello</h1>" })\n' +
        '  • "katex"       — LaTeX string, rendered in display mode. Example: render({ type: "katex", payload: "E = mc^2" })\n' +
        '  • "vega-lite"   — Vega-Lite JSON spec (must be valid JSON). Example: render({ type: "vega-lite", payload: "{\"$schema\":\"...\",\"mark\":\"bar\",...}" })\n' +
        '  • "step-frames" — Ordered sequence of frames for step-through. payload is a JSON string: { "frame_type": "mermaid", "frames": [{ "label": "Step 1", "payload": "graph TD; A" }, ...] }. Displays frame 0; use step() to navigate.',
      inputSchema: {
        type: z
          .enum(["mermaid", "svg", "html", "katex", "vega-lite", "step-frames"])
          .describe("Content type."),
        payload: z
          .string()
          .describe(
            "The content source. For mermaid: must begin with a valid diagram keyword. " +
              "For vega-lite and step-frames: must be valid JSON. For svg/html/katex: any string."
          ),
      },
    },
    async ({ type, payload }) => {
      if (type === "mermaid") {
        if (!hasMermaidKeyword(payload)) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error:
                    "invalid payload: mermaid source must begin with a diagram keyword " +
                    "(e.g. 'graph TD', 'sequenceDiagram', 'classDiagram', ...)",
                }),
              },
            ],
          };
        }
        try {
          await parseMermaid(payload);
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: `invalid mermaid syntax: ${err instanceof Error ? err.message : String(err)}`,
                }),
              },
            ],
          };
        }
      }

      if (type === "vega-lite") {
        try {
          JSON.parse(payload);
        } catch {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: "invalid payload: vega-lite payload must be valid JSON",
                }),
              },
            ],
          };
        }
      }

      if (type === "step-frames") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: "invalid payload: step-frames payload must be valid JSON",
                }),
              },
            ],
          };
        }
        const spec = parsed as { frame_type?: string; frames?: unknown[] };
        if (
          typeof spec.frame_type !== "string" ||
          !Array.isArray(spec.frames) ||
          spec.frames.length === 0
        ) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: 'invalid payload: step-frames must have "frame_type" (string) and "frames" (non-empty array)',
                }),
              },
            ],
          };
        }
        const frames = spec.frames as StepFrame[];
        if (frames.some((f) => typeof f.payload !== "string")) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: 'invalid payload: each frame must have a "payload" string',
                }),
              },
            ],
          };
        }
        setStepFrames(frames, spec.frame_type, payload);
        broadcast({
          action: "replace",
          type: spec.frame_type,
          payload: frames[0].payload,
          frameLabel: frames[0].label,
          stepFrames: true,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
        };
      }

      setCanvas(type, payload);
      broadcast({ action: "replace", type, payload });

      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // step(direction) — advance or rewind the step cursor.
  server.registerTool(
    "step",
    {
      description:
        'Advance ("next") or rewind ("prev") the step cursor for a loaded step-frames sequence. ' +
        'Returns { "ok": true, "current_frame": N, "total_frames": M }. ' +
        'Returns { "ok": false, "error": "..." } if no step-frames sequence is loaded.',
      inputSchema: {
        direction: z
          .enum(["next", "prev"])
          .describe('"next" to advance, "prev" to rewind.'),
      },
    },
    ({ direction }) => {
      const result = stepCursor(direction);
      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                error: "no step-frames sequence is loaded",
              }),
            },
          ],
        };
      }
      const state = getCanvas();
      if (state.type === "step-frames") {
        const frame = state.frames[result.currentFrame];
        broadcast({
          action: "replace",
          type: state.frameType,
          payload: frame.payload,
          frameLabel: frame.label,
          stepFrames: true,
        });
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              current_frame: result.currentFrame,
              total_frames: result.totalFrames,
            }),
          },
        ],
      };
    }
  );

  // clear() — reset the canvas.
  server.registerTool(
    "clear",
    {
      description: "Reset the whiteboard canvas to a blank state.",
      inputSchema: {},
    },
    () => {
      clearCanvas();
      broadcast({ action: "clear" });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // export() — return the current canvas source spec.
  server.registerTool(
    "export",
    {
      description:
        "Return the current canvas source spec. " +
        'Response: { "ok": true, "data": "<source>" }. ' +
        "For step-frames: returns the full original frames JSON string (not the current frame). " +
        "data is an empty string if the canvas is empty or was cleared.",
      inputSchema: {},
    },
    () => {
      const data = exportCanvas();
      return {
        content: [
          { type: "text", text: JSON.stringify({ ok: true, data }) },
        ],
      };
    }
  );

  return server;
}
