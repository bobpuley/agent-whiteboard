// Entry point — starts HTTP + WebSocket + MCP servers.

import { serve } from "@hono/node-server";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { createMcpServer } from "./mcp.js";
import { addClient } from "./ws.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "localhost";

const app = createApp();

// ── MCP (SSE) ────────────────────────────────────────────────────────────────

const mcpServer = createMcpServer();
const mcpTransports = new Map<string, SSEServerTransport>();

app.get("/mcp", async (c) => {
  const { incoming: req, outgoing: res } = c.env as {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };

  const transport = new SSEServerTransport("/mcp/message", res);
  const sessionId = transport.sessionId;
  mcpTransports.set(sessionId, transport);
  transport.onclose = () => mcpTransports.delete(sessionId);

  await mcpServer.connect(transport);

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

  return new Promise<never>(() => undefined);
});

// ── Start ────────────────────────────────────────────────────────────────────

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`agent-whiteboard running at http://${HOST}:${PORT}`);
  console.log(`MCP endpoint:  http://${HOST}:${PORT}/mcp`);
  console.log(`WebSocket:     ws://${HOST}:${PORT}/stream`);
});

const wss = new WebSocketServer({ server: server as Server, path: "/stream" });
wss.on("connection", (ws) => {
  addClient(ws);
});
