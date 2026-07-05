import { beforeAll, describe, expect, it, vi } from "vitest";

// server/channel.ts is a stdio-MCP + tiny-HTTP-relay experiment (see docs/04
// System Architecture, "Channels API experiment") with side effects at module
// scope (mcp.connect(), relay.listen()) and no exports — mock its two external
// dependencies so importing it doesn't actually bind a port or connect stdio,
// then drive the captured HTTP request handler directly.

const notification = vi.fn().mockResolvedValue(undefined);
const connect = vi.fn().mockResolvedValue(undefined);

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(() => ({ connect, notification })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

let requestHandler: (req: unknown, res: unknown) => void;
const listen = vi.fn((_port: number, _host: string, cb: () => void) => cb());

vi.mock("node:http", () => ({
  createServer: vi.fn((handler: (req: unknown, res: unknown) => void) => {
    requestHandler = handler;
    return { listen };
  }),
}));

function fakeReqRes(method: string, url: string) {
  const chunks: string[] = [];
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res.statusCode = status;
      if (headers) Object.assign(res.headers, headers);
    },
    end(body?: string) {
      if (body !== undefined) chunks.push(body);
    },
  };
  return { req: { method, url }, res, body: () => chunks.join("") };
}

describe("channel", () => {
  beforeAll(async () => {
    await import("../../../server/channel.js");
  });

  it("connects the MCP server over stdio and starts the HTTP relay", () => {
    expect(connect).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledWith(3001, "127.0.0.1", expect.any(Function));
  });

  it("POST /user-done sends a claude/channel notification and returns ok", () => {
    const { req, res, body } = fakeReqRes("POST", "/user-done");
    requestHandler(req, res);

    expect(notification).toHaveBeenCalledWith({
      method: "notifications/claude/channel",
      params: {
        content: "User has finished exploring the whiteboard and is ready for you to continue.",
        meta: { event: "user_done" },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(body())).toEqual({ ok: true });
  });

  it("any other method/path returns 404", () => {
    const { req, res, body } = fakeReqRes("GET", "/nope");
    requestHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(body()).toBe("");
  });
});
