import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findSnapshotById, findSnapshotByIdInWorkspace, listSnapshots } from "../../../server/snapshot-reader.js";

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
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "mermaid", payload: "graph TD; A" }] })
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
      JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "mermaid", payload: "graph TD; A" }] })
    );

    const entries = listSnapshots("my-ws", root);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBeUndefined();
  });

  it("badges a single-frame snapshot with its own resolved type", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "katex", payload: "x^2" }] })
    );

    const entries = listSnapshots("my-ws", root);
    expect(entries[0].type).toBe("katex");
  });

  it("badges a multi-frame sequence as step-frames (v0.26 Sprint 43 — derived from frame count, no top-level type field anymore)", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({
        id: "uuid-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        cursor: 0,
        frames: [{ type: "mermaid", payload: "graph A" }, { type: "mermaid", payload: "graph B" }],
        rawPayload: '{"frame_type":"mermaid","frames":[{"payload":"graph A"},{"payload":"graph B"}]}',
      })
    );

    const entries = listSnapshots("my-ws", root);
    expect(entries[0].type).toBe("step-frames");
  });

  it("reads title from the top-level title field", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "mermaid", payload: "graph A" }], title: "My Diagram" })
    );

    const entries = listSnapshots("my-ws", root);
    expect(entries[0].title).toBe("My Diagram");
  });

  it("skips a malformed file with no frames array", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "20260101_000000_screen.json"), JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z" }));

    expect(listSnapshots("my-ws", root)).toHaveLength(0);
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
        cursor: 0,
        frames: [{ type: "katex", payload: "x^2" }],
        title: "Quadratic",
      })
    );

    const record = findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record).toEqual({
      frames: [{ type: "katex", payload: "x^2" }],
      timestamp: "2026-01-01T00:00:00.000Z",
      title: "Quadratic",
    });
  });

  it("returns nodeToFrame when present", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({
        id: "uuid-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        cursor: 0,
        frames: [{ type: "mermaid", payload: "graph TD; A" }],
        nodeToFrame: { A: 0 },
      })
    );

    const record = findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record?.nodeToFrame).toEqual({ A: 0 });
  });

  it("returns null when the id exists in a different workspace (no cross-workspace scan)", () => {
    const otherDir = join(root, "other-ws");
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(
      join(otherDir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "katex", payload: "x^2" }] })
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
      JSON.stringify({ id: "uuid-other", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "katex", payload: "x^2" }] })
    );

    const record = findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record).toBeNull();
  });
});

describe("findSnapshotById — cross-workspace, rawPayload precedence (v0.26 Sprint 43)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-snapshot-reader-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns the single frame's payload for a one-shot snapshot", () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "mermaid", payload: "graph TD; A" }] })
    );

    expect(findSnapshotById("uuid-1", root)).toBe("graph TD; A");
  });

  it("returns rawPayload (verbatim step-frames envelope) when present, not the first frame's payload", () => {
    const rawPayload = '{"frame_type":"mermaid","frames":[{"payload":"graph A"},{"payload":"graph B"}]}';
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({
        id: "uuid-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        cursor: 0,
        frames: [{ type: "mermaid", payload: "graph A" }, { type: "mermaid", payload: "graph B" }],
        rawPayload,
      })
    );

    expect(findSnapshotById("uuid-1", root)).toBe(rawPayload);
  });

  it("returns null when no snapshot anywhere has a matching id", () => {
    expect(findSnapshotById("nope", root)).toBeNull();
  });
});
