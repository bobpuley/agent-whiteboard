// Entry point — starts HTTP + WebSocket + MCP servers.

import { serve } from "@hono/node-server";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Hono } from "hono";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { createMcpServer } from "./mcp.js";
import { clearCanvas, exportCanvas, setCanvas } from "./session.js";
import { addClient, broadcast } from "./ws.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "localhost";

const app = new Hono();

// ── REST fallback endpoints ──────────────────────────────────────────────────

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

// ── MCP (SSE) ────────────────────────────────────────────────────────────────

const mcpServer = createMcpServer();
const mcpTransports = new Map<string, SSEServerTransport>();

app.get("/mcp", async (c) => {
  // Access raw Node.js req/res via @hono/node-server bindings.
  const { incoming: req, outgoing: res } = c.env as {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };

  const transport = new SSEServerTransport("/mcp/message", res);
  const sessionId = transport.sessionId;
  mcpTransports.set(sessionId, transport);
  transport.onclose = () => mcpTransports.delete(sessionId);

  await mcpServer.connect(transport);

  // Keep the connection open — signal Hono not to close the response.
  return new Promise<never>(() => {
    req.on("close", () => mcpTransports.delete(sessionId));
  });
});

app.post("/mcp/message", async (c) => {
  const sessionId = c.req.query("sessionId");
  if (!sessionId) return c.json({ error: "missing sessionId" }, 400);
  const transport = mcpTransports.get(sessionId);
  if (!transport) return c.json({ error: "session not found" }, 404);

  const { incoming: req, outgoing: res } = c.env as {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };
  await transport.handlePostMessage(req, res);

  // Response is handled by the transport; return a no-op to Hono.
  return new Promise<never>(() => undefined);
});

// ── Start ────────────────────────────────────────────────────────────────────

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`agent-whiteboard running at http://${HOST}:${PORT}`);
  console.log(`MCP endpoint:  http://${HOST}:${PORT}/mcp`);
  console.log(`WebSocket:     ws://${HOST}:${PORT}/stream`);
});

// Attach WebSocket server for /stream to the same HTTP server.
const wss = new WebSocketServer({ server: server as Server, path: "/stream" });
wss.on("connection", (ws) => {
  addClient(ws);
});
