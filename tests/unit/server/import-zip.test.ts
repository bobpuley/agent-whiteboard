import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { importZip } from "../../../server/import-zip.js";

let root: string;

function writeSnapshot(workspace: string, filename: string, content: Record<string, unknown>) {
  const dir = join(root, workspace);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), JSON.stringify(content), "utf-8");
}

async function buildZipBuffer(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [filename, content] of Object.entries(entries)) {
    zip.file(filename, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

function manifest(workspace: string, snapshots: string[]): string {
  return JSON.stringify({
    formatVersion: 1,
    workspace,
    exportedAt: "2026-01-01T00:00:00.000Z",
    appVersion: "1.1.0",
    snapshots,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "import-zip-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("importZip — create mode (F39)", () => {
  it("creates the destination workspace and copies every manifest-listed file", async () => {
    const zip = await buildZipBuffer({
      "manifest.json": manifest("new-ws", ["a_screen.json", "b_screen.json"]),
      "a_screen.json": JSON.stringify({ id: "id-a", timestamp: "2026-01-01T00:00:00.000Z" }),
      "b_screen.json": JSON.stringify({ id: "id-b", timestamp: "2026-01-02T00:00:00.000Z" }),
    });

    const result = await importZip(zip, "new-ws", "create", root);
    expect(result).toEqual({ ok: true, workspace: "new-ws", added: 2, updated: 0, skipped: 0 });

    const files = readdirSync(join(root, "new-ws")).sort();
    expect(files).toEqual(["a_screen.json", "b_screen.json"]);
    expect(JSON.parse(readFileSync(join(root, "new-ws", "a_screen.json"), "utf-8")).id).toBe("id-a");
  });

  it("rejects create mode when the destination workspace already exists", async () => {
    writeSnapshot("existing-ws", "x_screen.json", { id: "id-x", timestamp: "2026-01-01T00:00:00.000Z" });
    const zip = await buildZipBuffer({ "manifest.json": manifest("existing-ws", []) });

    const result = await importZip(zip, "existing-ws", "create", root);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("already exists") });
  });
});

describe("importZip — merge mode dedup logic (F39)", () => {
  it("rejects merge mode when the destination workspace does not exist", async () => {
    const zip = await buildZipBuffer({ "manifest.json": manifest("nope", []) });
    const result = await importZip(zip, "nope", "merge", root);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("does not exist") });
  });

  it("adds an incoming snapshot whose id has no match in the destination", async () => {
    writeSnapshot("ws", "existing_screen.json", { id: "id-existing", timestamp: "2026-01-01T00:00:00.000Z" });
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["new_screen.json"]),
      "new_screen.json": JSON.stringify({ id: "id-new", timestamp: "2026-01-05T00:00:00.000Z" }),
    });

    const result = await importZip(zip, "ws", "merge", root);
    expect(result).toEqual({ ok: true, workspace: "ws", added: 1, updated: 0, skipped: 0 });
    expect(readdirSync(join(root, "ws")).sort()).toEqual(["existing_screen.json", "new_screen.json"]);
  });

  it("skips a true duplicate (same id, same timestamp) and writes no new file", async () => {
    writeSnapshot("ws", "orig_screen.json", { id: "id-1", timestamp: "2026-01-01T00:00:00.000Z" });
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["orig_screen.json"]),
      "orig_screen.json": JSON.stringify({ id: "id-1", timestamp: "2026-01-01T00:00:00.000Z" }),
    });

    const result = await importZip(zip, "ws", "merge", root);
    expect(result).toEqual({ ok: true, workspace: "ws", added: 0, updated: 0, skipped: 1 });
    expect(readdirSync(join(root, "ws"))).toEqual(["orig_screen.json"]);
  });

  it("overwrites the older file when the incoming snapshot has the same id but a newer timestamp", async () => {
    writeSnapshot("ws", "old_screen.json", { id: "id-1", timestamp: "2026-01-01T00:00:00.000Z" });
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["new_screen.json"]),
      "new_screen.json": JSON.stringify({ id: "id-1", timestamp: "2026-02-01T00:00:00.000Z" }),
    });

    const result = await importZip(zip, "ws", "merge", root);
    expect(result).toEqual({ ok: true, workspace: "ws", added: 0, updated: 1, skipped: 0 });

    const files = readdirSync(join(root, "ws"));
    expect(files).toEqual(["new_screen.json"]);
    expect(JSON.parse(readFileSync(join(root, "ws", "new_screen.json"), "utf-8")).timestamp).toBe("2026-02-01T00:00:00.000Z");
  });

  it("keeps the destination's file when it is already the newer one for that id", async () => {
    writeSnapshot("ws", "newer_screen.json", { id: "id-1", timestamp: "2026-03-01T00:00:00.000Z" });
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["older_screen.json"]),
      "older_screen.json": JSON.stringify({ id: "id-1", timestamp: "2026-01-01T00:00:00.000Z" }),
    });

    const result = await importZip(zip, "ws", "merge", root);
    expect(result).toEqual({ ok: true, workspace: "ws", added: 0, updated: 0, skipped: 1 });
    expect(readdirSync(join(root, "ws"))).toEqual(["newer_screen.json"]);
  });

  it("always adds an id-less legacy snapshot, never matching it against anything", async () => {
    writeSnapshot("ws", "existing_screen.json", { id: "id-1", timestamp: "2026-01-01T00:00:00.000Z" });
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["legacy_screen.json"]),
      "legacy_screen.json": JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z" }),
    });

    const result = await importZip(zip, "ws", "merge", root);
    expect(result).toEqual({ ok: true, workspace: "ws", added: 1, updated: 0, skipped: 0 });
    expect(readdirSync(join(root, "ws")).sort()).toEqual(["existing_screen.json", "legacy_screen.json"]);
  });

  it("re-importing the exact same zip a second time reports everything as skipped and writes no new files", async () => {
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["a_screen.json"]),
      "a_screen.json": JSON.stringify({ id: "id-1", timestamp: "2026-01-01T00:00:00.000Z" }),
    });

    const first = await importZip(zip, "ws", "create", root);
    expect(first).toEqual({ ok: true, workspace: "ws", added: 1, updated: 0, skipped: 0 });

    const second = await importZip(zip, "ws", "merge", root);
    expect(second).toEqual({ ok: true, workspace: "ws", added: 0, updated: 0, skipped: 1 });
    expect(readdirSync(join(root, "ws"))).toEqual(["a_screen.json"]);
  });
});

describe("importZip — manifest validation", () => {
  it("errors when manifest.json is missing", async () => {
    const zip = await buildZipBuffer({ "a_screen.json": "{}" });
    const result = await importZip(zip, "ws", "create", root);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("manifest.json is missing") });
  });

  it("errors when manifest.json fails schema validation", async () => {
    const zip = await buildZipBuffer({ "manifest.json": JSON.stringify({ workspace: "ws" }) });
    const result = await importZip(zip, "ws", "create", root);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("malformed") });
  });

  it("errors on invalid targetWorkspace input", async () => {
    const zip = await buildZipBuffer({ "manifest.json": manifest("ws", []) });
    const result = await importZip(zip, "../evil", "create", root);
    expect(result.ok).toBe(false);
  });
});

describe("importZip — NF55 safety", () => {
  it("rejects a zip containing a path-traversal entry (zip-slip) instead of writing outside the destination", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", manifest("ws", []));
    zip.file("../../outside_screen.json", "pwned");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const result = await importZip(buf, "ws", "create", root);
    expect(result.ok).toBe(false);

    // Nothing written outside root, and nothing left in root's parent either.
    const parentEntries = readdirSync(join(root, ".."));
    expect(parentEntries).not.toContain("outside_screen.json");
  });

  it("ignores a manifest-listed filename that attempts path traversal, rather than reading/writing outside the destination", async () => {
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["../../etc/passwd_screen.json", "good_screen.json"]),
      "good_screen.json": JSON.stringify({ id: "id-good", timestamp: "2026-01-01T00:00:00.000Z" }),
    });

    const result = await importZip(zip, "ws", "create", root);
    expect(result).toEqual({ ok: true, workspace: "ws", added: 1, updated: 0, skipped: 0 });
    expect(readdirSync(join(root, "ws"))).toEqual(["good_screen.json"]);
  });

  it("rejects a zip whose declared uncompressed entry size exceeds the configured per-entry cap", async () => {
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["big_screen.json"]),
      "big_screen.json": "x".repeat(1000),
    });

    const result = await importZip(zip, "ws", "create", root, { maxEntryUncompressedBytes: 10 });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("too large") });
  });

  it("rejects a zip whose total declared uncompressed size exceeds the configured cap", async () => {
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", ["a_screen.json", "b_screen.json"]),
      "a_screen.json": "x".repeat(100),
      "b_screen.json": "x".repeat(100),
    });

    const result = await importZip(zip, "ws", "create", root, {
      maxEntryUncompressedBytes: 1000,
      maxTotalUncompressedBytes: 150,
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("total uncompressed size") });
  });

  it("rejects a zip with more entries than the configured cap", async () => {
    const zip = await buildZipBuffer({
      "manifest.json": manifest("ws", []),
      "a_screen.json": "{}",
      "b_screen.json": "{}",
      "c_screen.json": "{}",
    });

    const result = await importZip(zip, "ws", "create", root, { maxEntries: 2 });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("too many entries") });
  });

  it("cleans up its temp directory after a successful import", async () => {
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith("agent-whiteboard-import-"));
    const zip = await buildZipBuffer({ "manifest.json": manifest("ws-cleanup", []) });

    await importZip(zip, "ws-cleanup", "create", root);

    const after = readdirSync(tmpdir()).filter((n) => n.startsWith("agent-whiteboard-import-"));
    expect(after.length).toBe(before.length);
  });
});
