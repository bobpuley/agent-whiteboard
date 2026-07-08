import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDirectory, migrateSnapshotFile } from "../../../server/migrate-snapshots.js";

describe("migrateSnapshotFile — pure transform", () => {
  it("migrates a one-shot mermaid snapshot to a single-frame record", () => {
    const result = migrateSnapshotFile({
      id: "id-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      type: "mermaid",
      payload: "graph TD; A --> B",
    });
    expect(result).toEqual({
      kind: "migrated",
      content: {
        id: "id-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        workspace: "ws",
        cursor: 0,
        frames: [{ type: "mermaid", payload: "graph TD; A --> B" }],
      },
    });
  });

  it.each(["svg", "html", "katex", "vega-lite"])("migrates a one-shot %s snapshot", (type) => {
    const result = migrateSnapshotFile({
      id: "id-2",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      type,
      payload: "<content/>",
    });
    expect(result.kind).toBe("migrated");
    if (result.kind !== "migrated") throw new Error("unreachable");
    expect(result.content.frames).toEqual([{ type, payload: "<content/>" }]);
    expect(result.content.rawPayload).toBeUndefined();
  });

  it("preserves options.title and options.node_to_frame on a one-shot snapshot", () => {
    const result = migrateSnapshotFile({
      id: "id-3",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      type: "mermaid",
      payload: "graph TD; A",
      options: { title: "My Diagram", node_to_frame: { A: 0 } },
    });
    expect(result.kind).toBe("migrated");
    if (result.kind !== "migrated") throw new Error("unreachable");
    expect(result.content.title).toBe("My Diagram");
    expect(result.content.nodeToFrame).toEqual({ A: 0 });
  });

  it("migrates a multi-frame step-frames snapshot, keeping rawPayload for export() parity", () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [
        { payload: "graph A", label: "Step 1" },
        { payload: "graph B", label: "Step 2" },
      ],
    });
    const result = migrateSnapshotFile({
      id: "id-4",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      type: "step-frames",
      payload,
      options: { title: "Sequence" },
    });
    expect(result.kind).toBe("migrated");
    if (result.kind !== "migrated") throw new Error("unreachable");
    expect(result.content.frames).toEqual([
      { type: "mermaid", payload: "graph A", label: "Step 1" },
      { type: "mermaid", payload: "graph B", label: "Step 2" },
    ]);
    expect(result.content.cursor).toBe(0);
    expect(result.content.title).toBe("Sequence");
    expect(result.content.rawPayload).toBe(payload);
  });

  it("resolves each frame's own type override in a mixed-type step-frames sequence", () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [
        { payload: "graph A" },
        { payload: "E = mc^2", type: "katex", label: "Formula" },
      ],
    });
    const result = migrateSnapshotFile({
      id: "id-5",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      type: "step-frames",
      payload,
    });
    expect(result.kind).toBe("migrated");
    if (result.kind !== "migrated") throw new Error("unreachable");
    expect(result.content.frames).toEqual([
      { type: "mermaid", payload: "graph A" },
      { type: "katex", payload: "E = mc^2", label: "Formula" },
    ]);
  });

  it("collapses a 1-frame step-frames sequence into a plain record with no rawPayload", () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [{ payload: "graph A", label: "Only step" }],
    });
    const result = migrateSnapshotFile({
      id: "id-6",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      type: "step-frames",
      payload,
    });
    expect(result.kind).toBe("migrated");
    if (result.kind !== "migrated") throw new Error("unreachable");
    expect(result.content.frames).toEqual([{ type: "mermaid", payload: "graph A", label: "Only step" }]);
    expect(result.content.rawPayload).toBeUndefined();
  });

  it("backfills a missing id with a freshly generated UUID", () => {
    const result = migrateSnapshotFile({
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      type: "mermaid",
      payload: "graph TD; A",
    });
    expect(result.kind).toBe("migrated");
    if (result.kind !== "migrated") throw new Error("unreachable");
    expect(result.content.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("is idempotent: a file that already has a frames array is reported as already-migrated", () => {
    const result = migrateSnapshotFile({
      id: "id-7",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A" }],
    });
    expect(result).toEqual({ kind: "already-migrated" });
  });

  it("reports an error for a non-object input", () => {
    expect(migrateSnapshotFile(null)).toEqual({ kind: "error", message: "not a JSON object" });
    expect(migrateSnapshotFile("just a string")).toEqual({ kind: "error", message: "not a JSON object" });
  });

  it("reports an error when required legacy fields are missing", () => {
    const result = migrateSnapshotFile({ timestamp: "2026-01-01T00:00:00.000Z", workspace: "ws" });
    expect(result.kind).toBe("error");
  });

  it("reports an error when a step-frames payload is not valid JSON", () => {
    const result = migrateSnapshotFile({
      id: "id-8",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws",
      type: "step-frames",
      payload: "not json",
    });
    expect(result).toEqual({ kind: "error", message: "step-frames payload is not valid JSON" });
  });
});

describe("migrateDirectory — filesystem driver", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "agent-whiteboard-migrate-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeFixture(workspace: string, filename: string, content: unknown) {
    const dir = join(root, workspace);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), JSON.stringify(content), "utf-8");
  }

  it("migrates every legacy file across every workspace subdirectory", () => {
    writeFixture("ws1", "20260101_000000_a_screen.json", {
      id: "a", timestamp: "2026-01-01T00:00:00.000Z", workspace: "ws1", type: "mermaid", payload: "graph TD; A",
    });
    writeFixture("ws2", "20260101_000000_b_screen.json", {
      id: "b", timestamp: "2026-01-01T00:00:00.000Z", workspace: "ws2", type: "svg", payload: "<svg/>",
    });

    const summary = migrateDirectory(root);

    expect(summary).toEqual({ migrated: 2, alreadyMigrated: 0, errors: [] });
    const migratedA = JSON.parse(readFileSync(join(root, "ws1", "20260101_000000_a_screen.json"), "utf-8"));
    expect(migratedA.frames).toEqual([{ type: "mermaid", payload: "graph TD; A" }]);
    const migratedB = JSON.parse(readFileSync(join(root, "ws2", "20260101_000000_b_screen.json"), "utf-8"));
    expect(migratedB.frames).toEqual([{ type: "svg", payload: "<svg/>" }]);
  });

  it("dry-run computes the summary without writing anything to disk", () => {
    writeFixture("ws1", "20260101_000000_a_screen.json", {
      id: "a", timestamp: "2026-01-01T00:00:00.000Z", workspace: "ws1", type: "mermaid", payload: "graph TD; A",
    });

    const summary = migrateDirectory(root, { dryRun: true });

    expect(summary).toEqual({ migrated: 1, alreadyMigrated: 0, errors: [] });
    const untouched = JSON.parse(readFileSync(join(root, "ws1", "20260101_000000_a_screen.json"), "utf-8"));
    expect(untouched.type).toBe("mermaid"); // still old shape — dry run never wrote
    expect(untouched.frames).toBeUndefined();
  });

  it("is safe to re-run: a second pass reports already-migrated and makes no further changes", () => {
    writeFixture("ws1", "20260101_000000_a_screen.json", {
      id: "a", timestamp: "2026-01-01T00:00:00.000Z", workspace: "ws1", type: "mermaid", payload: "graph TD; A",
    });

    migrateDirectory(root);
    const afterFirstRun = readFileSync(join(root, "ws1", "20260101_000000_a_screen.json"), "utf-8");
    const summary = migrateDirectory(root);
    const afterSecondRun = readFileSync(join(root, "ws1", "20260101_000000_a_screen.json"), "utf-8");

    expect(summary).toEqual({ migrated: 0, alreadyMigrated: 1, errors: [] });
    expect(afterSecondRun).toBe(afterFirstRun);
  });

  it("records an error for a malformed file and continues migrating the rest", () => {
    writeFixture("ws1", "20260101_000000_bad_screen.json", "not valid json{");
    writeFixture("ws1", "20260101_000001_good_screen.json", {
      id: "good", timestamp: "2026-01-01T00:00:01.000Z", workspace: "ws1", type: "html", payload: "<p>hi</p>",
    });

    const summary = migrateDirectory(root);

    expect(summary.migrated).toBe(1);
    expect(summary.alreadyMigrated).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].file).toContain("bad_screen.json");
  });

  it("returns an empty summary when the root directory does not exist", () => {
    const summary = migrateDirectory(join(root, "does-not-exist"));
    expect(summary).toEqual({ migrated: 0, alreadyMigrated: 0, errors: [] });
  });
});
