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

  it("returns undefined for an id with no cache entry", () => {
    expect(getViewport("nope")).toBeUndefined();
  });

  it("round-trips a viewport through setViewport/getViewport", () => {
    setViewport("id-1", { scale: 1.4, positionX: 0.12, positionY: -0.05 });
    expect(getViewport("id-1")).toEqual({ scale: 1.4, positionX: 0.12, positionY: -0.05 });
  });

  it("persists entries to viewport-cache.json under the snapshots root", () => {
    setViewport("id-1", { scale: 1, positionX: 0, positionY: 0 });
    const raw = readFileSync(join(root, "viewport-cache.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed["id-1"]).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("overwrites an existing entry for the same id", () => {
    setViewport("id-1", { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-1", { scale: 2, positionX: 0.5, positionY: 0.5 });
    expect(getViewport("id-1")).toEqual({ scale: 2, positionX: 0.5, positionY: 0.5 });
  });

  it("keeps entries for other ids independent", () => {
    setViewport("id-1", { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-2", { scale: 2, positionX: 0.1, positionY: 0.2 });
    expect(getViewport("id-1")).toEqual({ scale: 1, positionX: 0, positionY: 0 });
    expect(getViewport("id-2")).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
  });

  it("deleteViewport removes a single entry and leaves others intact", () => {
    setViewport("id-1", { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-2", { scale: 2, positionX: 0.1, positionY: 0.2 });
    deleteViewport("id-1");
    expect(getViewport("id-1")).toBeUndefined();
    expect(getViewport("id-2")).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
  });

  it("deleteViewports removes multiple entries at once", () => {
    setViewport("id-1", { scale: 1, positionX: 0, positionY: 0 });
    setViewport("id-2", { scale: 2, positionX: 0.1, positionY: 0.2 });
    setViewport("id-3", { scale: 3, positionX: 0.3, positionY: 0.3 });
    deleteViewports(["id-1", "id-3"]);
    expect(getViewport("id-1")).toBeUndefined();
    expect(getViewport("id-2")).toEqual({ scale: 2, positionX: 0.1, positionY: 0.2 });
    expect(getViewport("id-3")).toBeUndefined();
  });

  it("deleting an unknown id is a no-op, not an error", () => {
    setViewport("id-1", { scale: 1, positionX: 0, positionY: 0 });
    expect(() => deleteViewport("unknown-id")).not.toThrow();
    expect(getViewport("id-1")).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("deleteViewports with an empty array is a no-op", () => {
    setViewport("id-1", { scale: 1, positionX: 0, positionY: 0 });
    deleteViewports([]);
    expect(getViewport("id-1")).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });

  it("getViewport tolerates a missing cache file", () => {
    // No file has been written yet in this fresh temp dir.
    expect(getViewport("anything")).toBeUndefined();
  });

  it("getViewport tolerates a malformed cache file", () => {
    writeFileSync(join(root, "viewport-cache.json"), "not valid json{", "utf-8");
    expect(getViewport("anything")).toBeUndefined();
  });

  it("setViewport creates the snapshots root directory if absent", () => {
    rmSync(root, { recursive: true, force: true });
    expect(() => setViewport("id-1", { scale: 1, positionX: 0, positionY: 0 })).not.toThrow();
    expect(getViewport("id-1")).toEqual({ scale: 1, positionX: 0, positionY: 0 });
  });
});
