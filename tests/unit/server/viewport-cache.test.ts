import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteViewport, deleteViewports, getViewport, setViewport } from "../../../server/viewport-cache.js";

describe("viewport-cache", () => {
  let root: string;
  const originalDir = process.env.WHITEBOARD_SNAPSHOTS_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-viewport-"));
    process.env.WHITEBOARD_SNAPSHOTS_DIR = root;
  });

  afterEach(() => {
    if (originalDir === undefined) delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    else process.env.WHITEBOARD_SNAPSHOTS_DIR = originalDir;
    rmSync(root, { recursive: true, force: true });
  });

  it("returns undefined for an id/frame with no cache entry", () => {
    expect(getViewport("nope", 0)).toBeUndefined();
  });

  it("round-trips a viewport through setViewport/getViewport", () => {
    setViewport("id-1", 0, { scale: 1.4, positionX: 0.12, positionY: -0.05 });
    expect(getViewport("id-1", 0)).toEqual({ scale: 1.4, positionX: 0.12, positionY: -0.05 });
  });

  it("persists entries to viewport-cache.json under the snapshots root, keyed by id:frameIndex", () => {
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    const raw = readFileSync(join(root, "viewport-cache.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed["id-1:0"]).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("overwrites an existing entry for the same id+frame", () => {
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-1", 0, { scale: 2, positionX: 0.5, positionY: 0.5 });
    expect(getViewport("id-1", 0)).toEqual({ scale: 2, positionX: 0.5, positionY: 0.5 });
  });

  it("keeps entries for other ids independent", () => {
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-2", 0, { scale: 2, positionX: 0.1, positionY: 0.2 });
    expect(getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
    expect(getViewport("id-2", 0)).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
  });

  it("keeps entries for different frames of the same id independent (bug B19/FR21 — per-frame persistence)", () => {
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-1", 1, { scale: 2, positionX: 0.5, positionY: 0.5 });
    expect(getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
    expect(getViewport("id-1", 1)).toEqual({ scale: 2, positionX: 0.5, positionY: 0.5 });
  });

  it("deleteViewport removes every frame entry for a single id and leaves others intact", () => {
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-1", 1, { scale: 1.5, positionX: 0.2, positionY: 0.2 });
    setViewport("id-2", 0, { scale: 2, positionX: 0.1, positionY: 0.2 });
    deleteViewport("id-1");
    expect(getViewport("id-1", 0)).toBeUndefined();
    expect(getViewport("id-1", 1)).toBeUndefined();
    expect(getViewport("id-2", 0)).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
  });

  it("deleteViewports removes every frame entry for multiple ids at once", () => {
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-1", 1, { scale: 1.1, positionX: 0, positionY: 0 });
    setViewport("id-2", 0, { scale: 2, positionX: 0.1, positionY: 0.2 });
    setViewport("id-3", 0, { scale: 3, positionX: 0.3, positionY: 0.3 });
    deleteViewports(["id-1", "id-3"]);
    expect(getViewport("id-1", 0)).toBeUndefined();
    expect(getViewport("id-1", 1)).toBeUndefined();
    expect(getViewport("id-2", 0)).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
    expect(getViewport("id-3", 0)).toBeUndefined();
  });

  it("deleteViewports does not remove an unrelated id whose name happens to be a prefix of another id's key", () => {
    // "id-1" must not match "id-10:0" — the prefix match is on "<id>:", not a bare startsWith(id).
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-10", 0, { scale: 2, positionX: 0.1, positionY: 0.2 });
    deleteViewports(["id-1"]);
    expect(getViewport("id-1", 0)).toBeUndefined();
    expect(getViewport("id-10", 0)).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
  });

  it("deleting an unknown id is a no-op, not an error", () => {
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    expect(() => deleteViewport("unknown-id")).not.toThrow();
    expect(getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("deleteViewports with an empty array is a no-op", () => {
    setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 });
    deleteViewports([]);
    expect(getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("getViewport tolerates a missing cache file", () => {
    // No file has been written yet in this fresh temp dir.
    expect(getViewport("anything", 0)).toBeUndefined();
  });

  it("getViewport tolerates a malformed cache file", () => {
    writeFileSync(join(root, "viewport-cache.json"), "not valid json{", "utf-8");
    expect(getViewport("anything", 0)).toBeUndefined();
  });

  it("setViewport creates the snapshots root directory if absent", () => {
    rmSync(root, { recursive: true, force: true });
    expect(() => setViewport("id-1", 0, { scale: 1, positionX: 0, positionY: 0 })).not.toThrow();
    expect(getViewport("id-1", 0)).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });
});
