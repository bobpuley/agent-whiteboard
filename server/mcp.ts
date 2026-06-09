// MCP tool definitions and handlers.
// Tools: render, clear, export, step.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { clearCanvas, exportCanvas, getCanvas, seekStepFrame, setCanvas, setStepFrames, stepCursor } from "./session.js";
import type { StepFrame } from "./session.js";
import { broadcast } from "./ws.js";
import { hasMermaidKeyword, parseMermaid } from "./validate.js";
import { cancelSlideshow, startSlideshow } from "./slideshow.js";
import { waitForClick, waitForDone } from "./events.js";
import { saveSnapshot } from "./snapshot.js";

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
        '  • "step-frames" — Ordered sequence of frames for step-through. payload is a JSON string: { "frame_type": "mermaid", "frames": [{ "label": "Step 1", "payload": "graph TD; A" }, ...] }. Displays frame 0; use step() to navigate.\n' +
        'options (optional): { "title": "My diagram" } — displays a label above the canvas; omit to show no title. Example: render({ type: "mermaid", payload: "graph TD; A --> B", options: { title: "System flow" } })',
      inputSchema: z.object({
        type: z
          .enum(["mermaid", "svg", "html", "katex", "vega-lite", "step-frames"])
          .describe("Content type."),
        payload: z
          .string()
          .describe(
            "The content source. For mermaid: must begin with a valid diagram keyword. " +
              "For vega-lite and step-frames: must be valid JSON. For svg/html/katex: any string."
          ),
        options: z
          .object({
            title: z.string().optional(),
            node_to_frame: z.record(z.string(), z.number()).optional(),
          })
          .optional()
          .describe('Optional display options. title: label shown above the canvas. node_to_frame (step-frames only): map of node ID → frame index for autonomous browser navigation; clicking a mapped node jumps directly to its frame without wait_click().'),
      }),
    },
    async ({ type, payload, options }) => {
      const title = options?.title;
      const nodeToFrame = options?.node_to_frame;
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
        cancelSlideshow();
        setStepFrames(frames, spec.frame_type, payload, title, nodeToFrame);
        broadcast({
          action: "replace",
          type: spec.frame_type,
          payload: frames[0].payload,
          frameLabel: frames[0].label,
          stepFrames: true,
          currentFrame: 0,
          totalFrames: frames.length,
          ...(title !== undefined ? { title } : {}),
          ...(nodeToFrame !== undefined ? { nodeToFrame } : {}),
        });
        try { saveSnapshot("step-frames", payload, { title, node_to_frame: nodeToFrame }); } catch { /* non-fatal */ }
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
        };
      }

      cancelSlideshow();
      setCanvas(type, payload, title);
      broadcast({ action: "replace", type, payload, ...(title !== undefined ? { title } : {}) });
      try { saveSnapshot(type, payload, { title }); } catch { /* non-fatal */ }

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
      inputSchema: z.object({
        direction: z
          .enum(["next", "prev"])
          .describe('"next" to advance, "prev" to rewind.'),
      }),
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
          currentFrame: result.currentFrame,
          totalFrames: result.totalFrames,
          ...(state.title !== undefined ? { title: state.title } : {}),
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

  // seek(frame) — jump the step cursor to an arbitrary frame index.
  server.registerTool(
    "seek",
    {
      description:
        'Jump the step-frame cursor to an arbitrary frame index. ' +
        'Useful for random-access navigation without repeated step() calls. ' +
        'Returns { "ok": true, "current_frame": N, "total_frames": M }. ' +
        'Returns { "ok": false, "error": "..." } if no step-frames sequence is loaded or frame is out of range.',
      inputSchema: z.object({
        frame: z.number().int().nonnegative().describe("Zero-based frame index to jump to."),
      }),
    },
    ({ frame }) => {
      const state = getCanvas();
      if (state.type !== "step-frames") {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "no step-frames sequence is loaded" }) }],
        };
      }
      const total = state.frames.length;
      if (frame < 0 || frame >= total) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: `frame out of range: must be 0–${total - 1}` }) }],
        };
      }
      seekStepFrame(frame);
      const f = state.frames[frame];
      broadcast({
        action: "replace",
        type: state.frameType,
        payload: f.payload,
        frameLabel: f.label,
        stepFrames: true,
        currentFrame: frame,
        totalFrames: total,
        ...(state.title !== undefined ? { title: state.title } : {}),
        ...(state.nodeToFrame !== undefined ? { nodeToFrame: state.nodeToFrame } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, current_frame: frame, total_frames: total }) }],
      };
    }
  );

  // clear() — reset the canvas.
  server.registerTool(
    "clear",
    {
      description: "Reset the whiteboard canvas to a blank state.",
      inputSchema: z.object({}),
    },
    () => {
      cancelSlideshow();
      clearCanvas();
      broadcast({ action: "clear" });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // slideshow(slides, delay_ms) — auto-advance a playlist on a server-side timer.
  server.registerTool(
    "slideshow",
    {
      description:
        "Load a playlist of slides and auto-advance the canvas on a server-side timer.\n" +
        'slides: array of { type, payload, title? } — same types as render().\n' +
        'delay_ms: interval in milliseconds between slides.\n' +
        "A new call cancels any running slideshow. Use slideshow_stop() to stop early.\n" +
        'Example: slideshow({ slides: [{ type: "mermaid", payload: "graph TD; A-->B", title: "Slide 1" }], delay_ms: 3000 })',
      inputSchema: z.object({
        slides: z
          .array(
            z.object({
              type: z.enum(["mermaid", "svg", "html", "katex", "vega-lite"]).describe("Content type."),
              payload: z.string().describe("Content source."),
              title: z.string().optional().describe("Optional label above the canvas."),
            })
          )
          .min(1)
          .describe("Ordered list of slides."),
        delay_ms: z
          .number()
          .positive()
          .describe("Milliseconds between slide advances."),
      }),
    },
    async ({ slides, delay_ms }) => {
      // Validate each slide payload.
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        if (s.type === "mermaid") {
          if (!hasMermaidKeyword(s.payload)) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: `slide[${i}]: invalid payload: mermaid source must begin with a diagram keyword`,
                }),
              }],
            };
          }
          try {
            await parseMermaid(s.payload);
          } catch (err) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: `slide[${i}]: invalid mermaid syntax: ${err instanceof Error ? err.message : String(err)}`,
                }),
              }],
            };
          }
        } else if (s.type === "vega-lite") {
          try {
            JSON.parse(s.payload);
          } catch {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  error: `slide[${i}]: invalid payload: vega-lite payload must be valid JSON`,
                }),
              }],
            };
          }
        }
      }
      startSlideshow(slides, delay_ms);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // slideshow_stop() — cancel the running slideshow.
  server.registerTool(
    "slideshow_stop",
    {
      description:
        "Cancel the running slideshow timer. The last rendered slide remains on screen. " +
        "No-op if no slideshow is running.",
      inputSchema: z.object({}),
    },
    () => {
      cancelSlideshow();
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    }
  );

  // wait_click(node_actions?) — arm click listener, block until user clicks a node/edge.
  server.registerTool(
    "wait_click",
    {
      description:
        "Arm the browser for a single node or edge click on the current Mermaid diagram. " +
        "The browser highlights clickable elements; one click resolves the call.\n" +
        "Optional node_actions: map of node ID → string[] — nodes with registered actions show a popup menu on click; user selects one.\n" +
        "Returns { \"ok\": true, \"type\": \"node\"|\"edge\", \"id\": \"<id>\", \"label\": \"<label>\", \"action\": \"<string or null>\" }.\n" +
        "  action is null when no popup was shown or user clicked without selecting; string value when menu item was selected.\n" +
        "On timeout (10 min): returns { \"ok\": true, \"type\": \"timeout\" }.\n" +
        "Applies to graph/flowchart diagrams reliably; other Mermaid types (sequenceDiagram, erDiagram, classDiagram) are best-effort — node IDs may be opaque or extraction may fail.\n" +
        "Only one wait_click() may be pending at a time — a second call cancels the first.\n" +
        "Example — plain click: render({ type: \"mermaid\", payload: \"graph TD; A-->B\" }) → wait_click() → handle result\n" +
        "Example — popup menu: wait_click({ node_actions: { \"B\": [\"Explain\", \"Drill down\"] } }) → user clicks B → selects action",
      inputSchema: z.object({
        node_actions: z
          .record(z.string(), z.array(z.string()))
          .optional()
          .describe(
            "Optional map of node ID → action labels. " +
            "Nodes with a non-empty entry show a popup menu on click; user selects one action. " +
            "Nodes not in the map accept a plain click (no popup). " +
            "Edge clicks are always plain (no popup)."
          ),
      }),
    },
    async ({ node_actions }) => {
      // Arm the browser click listener, passing the node_actions map (or empty map for plain click).
      broadcast({ action: "set_node_actions", node_actions: node_actions ?? {}, enabled: true });
      const event = await waitForClick();
      // Disarm the browser.
      broadcast({ action: "set_node_actions", enabled: false });
      if (event.type === "timeout") {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, type: "timeout" }) }],
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: true,
            type: event.type,
            id: event.id,
            label: event.label,
            action: event.action,
          }),
        }],
      };
    }
  );

  // wait_done() — block until the user clicks Done in the browser.
  server.registerTool(
    "wait_done",
    {
      description:
        "Block until the user clicks the Done button in the whiteboard browser. " +
        "Call this immediately after render() when you want the user to review the diagram before you continue. " +
        'Returns { "ok": true } when the user signals they are ready. ' +
        "Example flow: render(...) → wait_done() → continue lesson",
      inputSchema: z.object({}),
    },
    async () => {
      await waitForDone();
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
      inputSchema: z.object({}),
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
