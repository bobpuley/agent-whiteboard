import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// client/vite.config.ts reads CLIENT_PORT/PORT from process.env at module-load
// time (NF47) — each test resets modules and re-imports so its own env
// values are picked up fresh, instead of a cached first-import snapshot.

describe("client/vite.config.ts — CLIENT_PORT/PORT env overrides (NF47)", () => {
  const originalClientPort = process.env.CLIENT_PORT;
  const originalPort = process.env.PORT;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalClientPort === undefined) delete process.env.CLIENT_PORT;
    else process.env.CLIENT_PORT = originalClientPort;
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  });

  it("defaults to port 5173 and proxies to localhost:3000 when no env vars are set", async () => {
    delete process.env.CLIENT_PORT;
    delete process.env.PORT;

    const { default: config } = await import("../../../client/vite.config.ts");

    expect(config.server?.port).toBe(5173);
    expect(config.server?.proxy?.["/render"]).toBe("http://localhost:3000");
    expect((config.server?.proxy?.["/stream"] as { target: string }).target).toBe("ws://localhost:3000");
  });

  it("uses PORT for every HTTP and WS proxy target when set", async () => {
    process.env.PORT = "4000";
    delete process.env.CLIENT_PORT;

    const { default: config } = await import("../../../client/vite.config.ts");

    expect(config.server?.proxy?.["/render"]).toBe("http://localhost:4000");
    expect(config.server?.proxy?.["/mcp"]).toBe("http://localhost:4000");
    expect((config.server?.proxy?.["/stream"] as { target: string }).target).toBe("ws://localhost:4000");
    // CLIENT_PORT unaffected by PORT.
    expect(config.server?.port).toBe(5173);
  });

  it("uses CLIENT_PORT for the dev server's own port when set", async () => {
    process.env.CLIENT_PORT = "5555";
    delete process.env.PORT;

    const { default: config } = await import("../../../client/vite.config.ts");

    expect(config.server?.port).toBe(5555);
    // PORT unaffected by CLIENT_PORT.
    expect(config.server?.proxy?.["/render"]).toBe("http://localhost:3000");
  });
});
