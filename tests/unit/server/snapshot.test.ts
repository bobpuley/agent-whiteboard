import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSnapshot } from "../../../server/snapshot.js";

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
    const id1 = saveSnapshot("mermaid", "graph TD; A", { workspace: "ws" });
    const id2 = saveSnapshot("mermaid", "graph TD; B", { workspace: "ws" });

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);

    const files = readdirSync(join(root, "ws")).filter((f) => f.endsWith("_screen.json"));
    expect(files).toHaveLength(2);
    expect(new Set(files).size).toBe(2);
  });

  it("filename still matches the *_screen.json pattern used by load/delete endpoints", () => {
    saveSnapshot("mermaid", "graph TD; A", { workspace: "ws" });
    const files = readdirSync(join(root, "ws"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[^/]+_screen\.json$/);
  });
});
