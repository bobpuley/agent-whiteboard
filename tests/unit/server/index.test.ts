import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

// vitest.config.ts sets the "browser" resolve condition (required for Svelte
// component tests sharing this config) — the "ws" package's browser export
// swaps out WebSocketServer for a DOM-only stub under that condition. Stub it
// here so this server-side test exercises the real startServer() wiring
// without pulling in that browser build.
vi.mock("ws", () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
}));

const { startServer } = await import("../../../server/index.js");

// v1.0 NF33/NF34 — startServer() is what bin/cli.js calls as a library (not
// via the auto-start-on-main-module side effect in server/index.ts). Exercise
// it directly on an ephemeral port so this doesn't collide with :3000.

describe("startServer()", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  it("starts an HTTP server and calls onReady once listening", async () => {
    process.env.PORT = "0"; // OS-assigned ephemeral port
    process.env.HOST = "localhost";

    await new Promise<void>((resolve) => {
      server = startServer({ onReady: resolve });
    });

    expect(server).toBeDefined();
    const address = server?.address();
    expect(address).not.toBeNull();
    if (address !== null && typeof address === "object") {
      expect(address.port).toBeGreaterThan(0);
    }
  });
});
