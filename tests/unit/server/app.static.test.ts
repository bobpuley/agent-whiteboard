import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../../server/app.js";

// v1.0 NF33 — static client serving is opt-in via CreateAppOptions.staticRoot,
// so dev mode (createApp() with no args, as every other test file calls it)
// stays byte-for-byte unaffected.

const staticRoot = mkdtempSync(join(tmpdir(), "agent-whiteboard-static-test-"));
writeFileSync(join(staticRoot, "index.html"), "<html><body>hello static</body></html>");
writeFileSync(join(staticRoot, "app.js"), "console.log('asset');");

afterAll(() => {
  rmSync(staticRoot, { recursive: true, force: true });
});

describe("createApp({ staticRoot })", () => {
  it("serves index.html at / when staticRoot exists", async () => {
    const app = createApp({ staticRoot });
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hello static");
  });

  it("serves other static assets by path", async () => {
    const app = createApp({ staticRoot });
    const res = await app.request("/app.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("console.log");
  });

  it("returns 404 for a path with no matching file", async () => {
    const app = createApp({ staticRoot });
    const res = await app.request("/does-not-exist.js");
    expect(res.status).toBe(404);
  });

  it("does not shadow existing API routes", async () => {
    const app = createApp({ staticRoot });
    const res = await app.request("/clear", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("createApp() without staticRoot", () => {
  it("registers no static route — GET / still 404s as before", async () => {
    const app = createApp();
    const res = await app.request("/");
    expect(res.status).toBe(404);
  });
});

describe("createApp({ staticRoot }) when the path doesn't exist on disk", () => {
  it("silently skips mounting the static route instead of erroring", async () => {
    const app = createApp({ staticRoot: "/definitely/does/not/exist/on/this/machine" });
    const res = await app.request("/");
    expect(res.status).toBe(404);
  });
});
