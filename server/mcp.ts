// MCP tool definitions and handlers.
// Tools: render, clear, export (step is Phase 2).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { clearCanvas, exportCanvas, setCanvas } from "./session.js";
import { broadcast } from "./ws.js";

// Valid Mermaid diagram keywords (Layer 1 + Layer 2 validation).
const MERMAID_KEYWORDS = [
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "erDiagram",
  "gantt",
  "pie",
  "mindmap",
];

function isValidMermaid(payload: string): boolean {
  const first = payload.trimStart().split(/\s/)[0];
  return MERMAID_KEYWORDS.includes(first);
}

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
        'Push content to the whiteboard canvas. In v1, type must be "mermaid". ' +
        "The payload always replaces the current canvas state. " +
        'Example: render({ type: "mermaid", payload: "graph TD; A --> B" })',
      inputSchema: {
        type: z.enum(["mermaid"]).describe(
          'Content type. Only "mermaid" is supported in v1.'
        ),
        payload: z
          .string()
          .describe(
            "The diagram source. For mermaid: must begin with a valid diagram keyword " +
              "(graph, flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap)."
          ),
      },
    },
    ({ type, payload }) => {
      if (!isValidMermaid(payload)) {
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

      setCanvas(type, payload);
      broadcast({ action: "replace", type, payload });

      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
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
        'Response: { "ok": true, "data": "<mermaid source>" }. ' +
        'data is an empty string if the canvas is empty or was cleared.',
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
