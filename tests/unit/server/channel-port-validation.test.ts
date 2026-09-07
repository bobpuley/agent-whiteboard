import { describe, expect, it, vi } from "vitest";

// Separate file from channel.test.ts because channel.ts validates CHANNEL_PORT
// at module scope — this exercises the invalid-value throw on a fresh import
// without disturbing the other suite's already-imported module instance.

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(() => ({ connect: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("node:http", () => ({
  createServer: vi.fn(() => ({ listen: vi.fn() })),
}));

describe("channel.ts CHANNEL_PORT validation (NF52)", () => {
  it("fails fast with a clear error when CHANNEL_PORT is not a valid port number", async () => {
    process.env.CHANNEL_PORT = "not-a-port";

    await expect(import("../../../server/channel.js")).rejects.toThrow(/Invalid CHANNEL_PORT "not-a-port"/);

    delete process.env.CHANNEL_PORT;
  });
});
