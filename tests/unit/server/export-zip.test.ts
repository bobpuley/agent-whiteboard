import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { generateExportZip } from "../../../server/export-zip.js";

let root: string;

function writeSnapshot(workspace: string, filename: string, content: Record<string, unknown>) {
  const dir = join(root, workspace);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), JSON.stringify(content), "utf-8");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "export-zip-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("generateExportZip (F36)", () => {
  it("produces a zip containing the raw snapshot JSON files plus a manifest.json", async () => {
    writeSnapshot("ws-1", "a_screen.json", {
      id: "id-a",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws-1",
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
    });
    writeSnapshot("ws-1", "b_screen.json", {
      id: "id-b",
      timestamp: "2026-01-02T00:00:00.000Z",
      workspace: "ws-1",
      cursor: 0,
      frames: [{ type: "svg", payload: "<svg></svg>" }],
    });

    const result = await generateExportZip([
      { workspace: "ws-1", id: "id-a" },
      { workspace: "ws-1", id: "id-b" },
    ], root);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const zip = await JSZip.loadAsync(result.zip);
    expect(Object.keys(zip.files).sort()).toEqual(["a_screen.json", "b_screen.json", "manifest.json"]);

    const aContent = JSON.parse(await zip.files["a_screen.json"].async("string"));
    expect(aContent.id).toBe("id-a");
    const bContent = JSON.parse(await zip.files["b_screen.json"].async("string"));
    expect(bContent.id).toBe("id-b");

    const manifest = JSON.parse(await zip.files["manifest.json"].async("string"));
    expect(manifest).toMatchObject({
      formatVersion: 1,
      workspace: "ws-1",
      snapshots: expect.arrayContaining(["a_screen.json", "b_screen.json"]),
    });
    expect(typeof manifest.exportedAt).toBe("string");
    expect(new Date(manifest.exportedAt).toISOString()).toBe(manifest.exportedAt);
    expect(typeof manifest.appVersion).toBe("string");
    expect(manifest.appVersion).not.toBe("unknown");
  });

  it("excludes any viewport-cache data — only the raw snapshot files and manifest are present", async () => {
    writeSnapshot("ws-1", "a_screen.json", {
      id: "id-a",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws-1",
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
    });

    const result = await generateExportZip([{ workspace: "ws-1", id: "id-a" }], root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const zip = await JSZip.loadAsync(result.zip);
    for (const name of Object.keys(zip.files)) {
      expect(name).not.toMatch(/viewport/i);
    }
  });

  it("rejects a mixed-workspace item list", async () => {
    writeSnapshot("ws-1", "a_screen.json", {
      id: "id-a",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws-1",
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
    });
    writeSnapshot("ws-2", "b_screen.json", {
      id: "id-b",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws-2",
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
    });

    const result = await generateExportZip([
      { workspace: "ws-1", id: "id-a" },
      { workspace: "ws-2", id: "id-b" },
    ], root);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("same workspace") });
  });

  it("rejects an empty item list", async () => {
    const result = await generateExportZip([], root);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("errors when none of the requested ids resolve to a file on disk", async () => {
    const result = await generateExportZip([{ workspace: "ws-1", id: "missing" }], root);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("skips ids that don't resolve but still exports the ones that do", async () => {
    writeSnapshot("ws-1", "a_screen.json", {
      id: "id-a",
      timestamp: "2026-01-01T00:00:00.000Z",
      workspace: "ws-1",
      cursor: 0,
      frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
    });

    const result = await generateExportZip([
      { workspace: "ws-1", id: "id-a" },
      { workspace: "ws-1", id: "missing" },
    ], root);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const zip = await JSZip.loadAsync(result.zip);
    expect(Object.keys(zip.files).sort()).toEqual(["a_screen.json", "manifest.json"]);
  });
});
