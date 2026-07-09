import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSnapshotId, saveSnapshot } from "../../../server/snapshot-writer.js";

describe("saveSnapshot — filename uniqueness (B7)", () => {
  let root: string;
  const originalDir = process.env.WHITEBOARD_SNAPSHOTS_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-snapshot-"));
    process.env.WHITEBOARD_SNAPSHOTS_DIR = root;
  });

  afterEach(() => {
    if (originalDir === undefined) delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    else process.env.WHITEBOARD_SNAPSHOTS_DIR = originalDir;
    rmSync(root, { recursive: true, force: true });
  });

  it("writes two distinct files for two saves in the same wall-clock second", () => {
    const id1 = saveSnapshot([{ type: "mermaid", payload: "graph TD; A" }], { workspace: "ws" });
    const id2 = saveSnapshot([{ type: "mermaid", payload: "graph TD; B" }], { workspace: "ws" });

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);

    const files = readdirSync(join(root, "ws")).filter((f) => f.endsWith("_screen.json"));
    expect(files).toHaveLength(2);
    expect(new Set(files).size).toBe(2);
  });

  it("filename still matches the *_screen.json pattern used by load/delete endpoints", () => {
    saveSnapshot([{ type: "mermaid", payload: "graph TD; A" }], { workspace: "ws" });
    const files = readdirSync(join(root, "ws"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[^/]+_screen\.json$/);
  });
});

describe("saveSnapshot — pre-generated id (v0.19, viewport persistence)", () => {
  let root: string;
  const originalDir = process.env.WHITEBOARD_SNAPSHOTS_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-snapshot-id-"));
    process.env.WHITEBOARD_SNAPSHOTS_DIR = root;
  });

  afterEach(() => {
    if (originalDir === undefined) delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    else process.env.WHITEBOARD_SNAPSHOTS_DIR = originalDir;
    rmSync(root, { recursive: true, force: true });
  });

  it("generateSnapshotId returns a distinct UUID on each call", () => {
    const a = generateSnapshotId();
    const b = generateSnapshotId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses a pre-generated id instead of minting a new one", () => {
    const pregenerated = generateSnapshotId();
    const returned = saveSnapshot([{ type: "mermaid", payload: "graph TD; A" }], { workspace: "ws" }, undefined, pregenerated);
    expect(returned).toBe(pregenerated);

    const files = readdirSync(join(root, "ws")).filter((f) => f.endsWith("_screen.json"));
    expect(files).toHaveLength(1);
    const content = JSON.parse(readFileSync(join(root, "ws", files[0]), "utf-8"));
    expect(content.id).toBe(pregenerated);
  });

  it("still generates its own id when none is provided", () => {
    const returned = saveSnapshot([{ type: "mermaid", payload: "graph TD; A" }], { workspace: "ws" });
    expect(returned).toBeDefined();
    expect(returned).toMatch(/^[0-9a-f-]{36}$/);
  });
});
