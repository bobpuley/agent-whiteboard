import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findSnapshotByIdInWorkspace, listSnapshots } from "../../../server/snapshot-reader.js";

describe("listSnapshots — id field (v0.15)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-snapshot-reader-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("includes id when the snapshot file has one", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", payload: "graph TD; A" })
    );

    const entries = listSnapshots("my-ws", root);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("uuid-1");
  });

  it("omits id for pre-v0.11 snapshot files that never had one", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", payload: "graph TD; A" })
    );

    const entries = listSnapshots("my-ws", root);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBeUndefined();
  });
});

describe("findSnapshotByIdInWorkspace (v0.15)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-snapshot-reader-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns the full record when the id matches within the given workspace", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({
        id: "uuid-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "katex",
        payload: "x^2",
        options: { title: "Quadratic" },
      })
    );

    const record = findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record).toEqual({
      type: "katex",
      payload: "x^2",
      timestamp: "2026-01-01T00:00:00.000Z",
      options: { title: "Quadratic" },
    });
  });

  it("returns null when the id exists in a different workspace (no cross-workspace scan)", () => {
    const otherDir = join(root, "other-ws");
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(
      join(otherDir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", type: "katex", payload: "x^2" })
    );
    mkdirSync(join(root, "my-ws"), { recursive: true });

    const record = findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record).toBeNull();
  });

  it("returns null when the workspace directory does not exist", () => {
    const record = findSnapshotByIdInWorkspace("does-not-exist", "uuid-1", root);
    expect(record).toBeNull();
  });

  it("returns null when no snapshot in the workspace has a matching id", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-other", timestamp: "2026-01-01T00:00:00.000Z", type: "katex", payload: "x^2" })
    );

    const record = findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record).toBeNull();
  });
});
