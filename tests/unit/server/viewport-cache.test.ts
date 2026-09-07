import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// NF49: getViewport/setViewport/deleteViewport(s) are now async, and writes
// are coalesced (debounced) instead of a synchronous rewrite per call. Each
// test resets modules and re-imports the module fresh (instead of a
// top-level import) so the module's in-memory cache/flush-timer state never
// leaks between tests. Assertions on disk content use `flushViewportCacheNow()`
// (a deterministic test-only escape hatch) rather than advancing fake timers
// — the debounce timer is real-clock `setTimeout`, but the flush it triggers
// awaits real fs/promises I/O, so faking the timer doesn't make the I/O
// resolve any faster and races the assertion against the real write.
describe("viewport-cache (async, in-memory cache + coalesced writes — NF49)", () => {
  let root: string;
  const originalDir = process.env.WHITEBOARD_SNAPSHOTS_DIR;
  let vc: typeof import("../../../server/viewport-cache.js");

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-viewport-"));
    process.env.WHITEBOARD_SNAPSHOTS_DIR = root;
    vi.resetModules();
    vc = await import("../../../server/viewport-cache.js");
  });

  afterEach(() => {
    if (originalDir === undefined) delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    else process.env.WHITEBOARD_SNAPSHOTS_DIR = originalDir;
    rmSync(root, { recursive: true, force: true });
  });

  async function flush(): Promise<void> {
    await vc.flushViewportCacheNow();
  }

  it("returns undefined for an id/frame with no cache entry", async () => {
    expect(await vc.getViewport("nope", 0)).toBeUndefined();
  });

  it("round-trips a viewport through setViewport/getViewport before any flush happens", async () => {
    await vc.setViewport("id-1", 0, { scale: 1.4, positionX: 0.12, positionY: -0.05 });
    expect(await vc.getViewport("id-1", 0)).toEqual({ scale: 1.4, positionX: 0.12, positionY: -0.05 });
  });

  it("persists entries to viewport-cache.json under the snapshots root, keyed by id:frameIndex, once the flush fires", async () => {
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await flush();
    const raw = readFileSync(join(root, "viewport-cache.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed["id-1:0"]).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("coalesces rapid successive updates into a single delayed disk write instead of one per update (NF49)", async () => {
    for (let i = 0; i < 5; i++) {
      await vc.setViewport("id-1", 0, { scale: i, positionX: 0, positionY: 0 });
    }
    // Nothing hits disk until the debounce window elapses — proves the 5
    // updates didn't each trigger their own synchronous rewrite.
    expect(existsSync(join(root, "viewport-cache.json"))).toBe(false);

    await flush();

    const raw = readFileSync(join(root, "viewport-cache.json"), "utf-8");
    // Only the final value made it to disk, in one write.
    expect(JSON.parse(raw)["id-1:0"]).toEqual({ scale: 4, positionX: 0, positionY: 0 });
  });

  it("overwrites an existing entry for the same id+frame", async () => {
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await vc.setViewport("id-1", 0, { scale: 2, positionX: 0.5, positionY: 0.5 });
    expect(await vc.getViewport("id-1", 0)).toEqual({ scale: 2, positionX: 0.5, positionY: 0.5 });
  });

  it("keeps entries for other ids independent", async () => {
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await vc.setViewport("id-2", 0, { scale: 2, positionX: 0.1, positionY: 0.2 });
    expect(await vc.getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
    expect(await vc.getViewport("id-2", 0)).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
  });

  it("keeps entries for different frames of the same id independent (bug B19/FR21 — per-frame persistence)", async () => {
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await vc.setViewport("id-1", 1, { scale: 2, positionX: 0.5, positionY: 0.5 });
    expect(await vc.getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
    expect(await vc.getViewport("id-1", 1)).toEqual({ scale: 2, positionX: 0.5, positionY: 0.5 });
  });

  it("deleteViewport removes every frame entry for a single id and leaves others intact", async () => {
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await vc.setViewport("id-1", 1, { scale: 1.5, positionX: 0.2, positionY: 0.2 });
    await vc.setViewport("id-2", 0, { scale: 2, positionX: 0.1, positionY: 0.2 });
    await vc.deleteViewport("id-1");
    expect(await vc.getViewport("id-1", 0)).toBeUndefined();
    expect(await vc.getViewport("id-1", 1)).toBeUndefined();
    expect(await vc.getViewport("id-2", 0)).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
  });

  it("deleteViewports removes every frame entry for multiple ids at once", async () => {
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await vc.setViewport("id-1", 1, { scale: 1.1, positionX: 0, positionY: 0 });
    await vc.setViewport("id-2", 0, { scale: 2, positionX: 0.1, positionY: 0.2 });
    await vc.setViewport("id-3", 0, { scale: 3, positionX: 0.3, positionY: 0.3 });
    await vc.deleteViewports(["id-1", "id-3"]);
    expect(await vc.getViewport("id-1", 0)).toBeUndefined();
    expect(await vc.getViewport("id-1", 1)).toBeUndefined();
    expect(await vc.getViewport("id-2", 0)).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
    expect(await vc.getViewport("id-3", 0)).toBeUndefined();
  });

  it("deleteViewports does not remove an unrelated id whose name happens to be a prefix of another id's key", async () => {
    // "id-1" must not match "id-10:0" — the prefix match is on "<id>:", not a bare startsWith(id).
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await vc.setViewport("id-10", 0, { scale: 2, positionX: 0.1, positionY: 0.2 });
    await vc.deleteViewports(["id-1"]);
    expect(await vc.getViewport("id-1", 0)).toBeUndefined();
    expect(await vc.getViewport("id-10", 0)).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
  });

  it("deleting an unknown id is a no-op, not an error", async () => {
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await expect(vc.deleteViewport("unknown-id")).resolves.toBeUndefined();
    expect(await vc.getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("deleteViewports with an empty array is a no-op", async () => {
    await vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    await vc.deleteViewports([]);
    expect(await vc.getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("getViewport tolerates a missing cache file", async () => {
    // No file has been written yet in this fresh temp dir.
    expect(await vc.getViewport("anything", 0)).toBeUndefined();
  });

  it("getViewport tolerates a malformed cache file", async () => {
    writeFileSync(join(root, "viewport-cache.json"), "not valid json{", "utf-8");
    expect(await vc.getViewport("anything", 0)).toBeUndefined();
  });

  it("setViewport creates the snapshots root directory if absent, once flushed", async () => {
    rmSync(root, { recursive: true, force: true });
    await expect(vc.setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 })).resolves.not.toThrow();
    await flush();
    expect(await vc.getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
    expect(existsSync(join(root, "viewport-cache.json"))).toBe(true);
  });
});
