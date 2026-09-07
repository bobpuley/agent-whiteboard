import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findSnapshotById, findSnapshotByIdInWorkspace, findSnapshotFileByIdInWorkspace, listSnapshots } from "../../../server/snapshot-reader.js";

describe("listSnapshots — id field (v0.15)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-snapshot-reader-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("includes id when the snapshot file has one", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "mermaid", payload: "graph TD; A" }] })
    );

    const entries = await listSnapshots("my-ws", root);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("uuid-1");
  });

  it("omits id for pre-v0.11 snapshot files that never had one", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "mermaid", payload: "graph TD; A" }] })
    );

    const entries = await listSnapshots("my-ws", root);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBeUndefined();
  });

  it("badges a single-frame snapshot with its own resolved type", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "katex", payload: "x^2" }] })
    );

    const entries = await listSnapshots("my-ws", root);
    expect(entries[0].type).toBe("katex");
  });

  it("badges a multi-frame sequence as step-frames (v0.26 Sprint 43 — derived from frame count, no top-level type field anymore)", async () => {
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

    const entries = await listSnapshots("my-ws", root);
    expect(entries[0].type).toBe("step-frames");
  });

  it("reads title from the top-level title field", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "mermaid", payload: "graph A" }], title: "My Diagram" })
    );

    const entries = await listSnapshots("my-ws", root);
    expect(entries[0].title).toBe("My Diagram");
  });

  it("skips a malformed file with no frames array", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "20260101_000000_screen.json"), JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z" }));

    expect(await listSnapshots("my-ws", root)).toHaveLength(0);
  });

  it("yields to the event loop between file reads instead of blocking it for the whole scan (NF49)", async () => {
    const dir = join(root, "big-ws");
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 300; i++) {
      writeFileSync(
        join(dir, `snap-${String(i).padStart(4, "0")}_screen.json`),
        JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", frames: [{ type: "mermaid", payload: "graph TD; A" }] })
      );
    }

    const listPromise = listSnapshots("big-ws", root);
    let tickResolvedFirst = false;
    // setImmediate fires on the very next event-loop iteration — if it wins
    // a race against a 300-file async scan, the scan must be yielding
    // control between reads rather than running the whole loop synchronously.
    const tickPromise = new Promise<void>((resolve) => {
      setImmediate(() => {
        tickResolvedFirst = true;
        resolve();
      });
    });

    await Promise.race([listPromise, tickPromise]);
    expect(tickResolvedFirst).toBe(true);

    await listPromise; // drain it so it can't leak into a later test
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

  it("returns the full record when the id matches within the given workspace", async () => {
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

    const record = await findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record).toEqual({
      frames: [{ type: "katex", payload: "x^2" }],
      timestamp: "2026-01-01T00:00:00.000Z",
      title: "Quadratic",
    });
  });

  it("returns nodeToFrame when present", async () => {
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

    const record = await findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record?.nodeToFrame).toEqual({ A: 0 });
  });

  it("drops a hand-edited non-numeric nodeToFrame value instead of returning it unchecked (NF45)", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({
        id: "uuid-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        cursor: 0,
        frames: [{ type: "mermaid", payload: "graph TD; A" }],
        nodeToFrame: { A: "not-a-number" },
      })
    );

    const record = await findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record?.nodeToFrame).toBeUndefined();
  });

  it("returns null when the id exists in a different workspace (no cross-workspace scan)", async () => {
    const otherDir = join(root, "other-ws");
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(
      join(otherDir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "katex", payload: "x^2" }] })
    );
    mkdirSync(join(root, "my-ws"), { recursive: true });

    const record = await findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record).toBeNull();
  });

  it("returns null when the workspace directory does not exist", async () => {
    const record = await findSnapshotByIdInWorkspace("does-not-exist", "uuid-1", root);
    expect(record).toBeNull();
  });

  it("returns null when no snapshot in the workspace has a matching id", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-other", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "katex", payload: "x^2" }] })
    );

    const record = await findSnapshotByIdInWorkspace("my-ws", "uuid-1", root);
    expect(record).toBeNull();
  });
});

describe("findSnapshotFileByIdInWorkspace (v1.6, F36)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-snapshot-reader-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns the filename and verbatim raw file contents when the id matches", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    const raw = JSON.stringify({
      id: "uuid-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      cursor: 0,
      frames: [{ type: "katex", payload: "x^2" }],
      title: "Quadratic",
    });
    writeFileSync(join(dir, "20260101_000000_screen.json"), raw);

    const result = await findSnapshotFileByIdInWorkspace("my-ws", "uuid-1", root);
    expect(result).toEqual({ filename: "20260101_000000_screen.json", raw });
  });

  it("returns null when the id exists in a different workspace (no cross-workspace scan)", async () => {
    const otherDir = join(root, "other-ws");
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(
      join(otherDir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "katex", payload: "x^2" }] })
    );
    mkdirSync(join(root, "my-ws"), { recursive: true });

    expect(await findSnapshotFileByIdInWorkspace("my-ws", "uuid-1", root)).toBeNull();
  });

  it("returns null when the workspace directory does not exist", async () => {
    expect(await findSnapshotFileByIdInWorkspace("does-not-exist", "uuid-1", root)).toBeNull();
  });

  it("returns null when no snapshot in the workspace has a matching id", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-other", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "katex", payload: "x^2" }] })
    );

    expect(await findSnapshotFileByIdInWorkspace("my-ws", "uuid-1", root)).toBeNull();
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

  it("returns the single frame's payload for a one-shot snapshot", async () => {
    const dir = join(root, "my-ws");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "20260101_000000_screen.json"),
      JSON.stringify({ id: "uuid-1", timestamp: "2026-01-01T00:00:00.000Z", cursor: 0, frames: [{ type: "mermaid", payload: "graph TD; A" }] })
    );

    expect(await findSnapshotById("uuid-1", root)).toBe("graph TD; A");
  });

  it("returns rawPayload (verbatim step-frames envelope) when present, not the first frame's payload", async () => {
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

    expect(await findSnapshotById("uuid-1", root)).toBe(rawPayload);
  });

  it("returns null when no snapshot anywhere has a matching id", async () => {
    expect(await findSnapshotById("nope", root)).toBeNull();
  });
});
