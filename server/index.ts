// Entry point — starts HTTP + WebSocket + MCP servers.
//
// Exports startServer() so it can be called as a library (e.g. from
// bin/cli.js, the npx production entrypoint) without the auto-start-on-import
// side effect below firing twice. Auto-start only happens when this file is
// itself the process's main module (`tsx watch server/index.ts`, or a direct
// `node dist/server/index.js` invocation) — see the isMainModule() check.

import { serve } from "@hono/node-server";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { createMcpServer } from "./mcp.js";
import { addClient } from "./ws.js";

export interface StartServerOptions {
  staticRoot?: string;
  onReady?: () => void;
}

export function startServer(options: StartServerOptions = {}): Server {
  const PORT = parseInt(process.env.PORT ?? "3000", 10);
  const HOST = process.env.HOST ?? "localhost";

  const app = createApp({ staticRoot: options.staticRoot });

  // ── MCP (SSE) ──────────────────────────────────────────────────────────────

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

    // Each connection needs its own McpServer instance — the SDK only allows
    // one transport per instance and throws if connect() is called again.
    const mcpServer = createMcpServer();
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

  // ── Start ──────────────────────────────────────────────────────────────────

  const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
    console.log(`agent-whiteboard running at http://${HOST}:${PORT}`);
    console.log(`MCP endpoint:  http://${HOST}:${PORT}/mcp`);
    console.log(`WebSocket:     ws://${HOST}:${PORT}/stream`);
    options.onReady?.();
  });

  const wss = new WebSocketServer({ server: server as Server, path: "/stream" });
  wss.on("connection", (ws) => {
    addClient(ws);
  });

  return server as Server;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  startServer();
}
