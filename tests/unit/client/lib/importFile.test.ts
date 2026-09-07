// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { readManifestFromZip } from "../../../../client/src/lib/importFile";

async function buildZipFile(entries: Record<string, string>, name = "export.zip"): Promise<File> {
  const zip = new JSZip();
  for (const [filename, content] of Object.entries(entries)) {
    zip.file(filename, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name, { type: "application/zip" });
}

const VALID_MANIFEST = JSON.stringify({
  formatVersion: 1,
  workspace: "my-course",
  exportedAt: "2026-01-01T00:00:00.000Z",
  appVersion: "1.1.0",
  snapshots: ["a_screen.json", "b_screen.json"],
});

describe("readManifestFromZip (F37)", () => {
  it("resolves the manifest from a well-formed export zip", async () => {
    const file = await buildZipFile({
      "manifest.json": VALID_MANIFEST,
      "a_screen.json": "{}",
      "b_screen.json": "{}",
    });

    const result = await readManifestFromZip(file);
    expect(result).toEqual({
      ok: true,
      manifest: {
        formatVersion: 1,
        workspace: "my-course",
        exportedAt: "2026-01-01T00:00:00.000Z",
        appVersion: "1.1.0",
        snapshots: ["a_screen.json", "b_screen.json"],
      },
    });
  });

  it("errors when manifest.json is missing", async () => {
    const file = await buildZipFile({ "a_screen.json": "{}" });
    const result = await readManifestFromZip(file);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("manifest.json") });
  });

  it("errors when manifest.json is not valid JSON", async () => {
    const file = await buildZipFile({ "manifest.json": "not json" });
    const result = await readManifestFromZip(file);
    expect(result.ok).toBe(false);
  });

  it("errors when manifest.json has no workspace field", async () => {
    const file = await buildZipFile({
      "manifest.json": JSON.stringify({ formatVersion: 1, snapshots: [] }),
    });
    const result = await readManifestFromZip(file);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("workspace") });
  });

  it("errors when manifest.json has no snapshots array", async () => {
    const file = await buildZipFile({
      "manifest.json": JSON.stringify({ formatVersion: 1, workspace: "ws" }),
    });
    const result = await readManifestFromZip(file);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("snapshots") });
  });

  it("errors when the file isn't a valid zip at all", async () => {
    const file = new File(["not a zip"], "bad.zip", { type: "application/zip" });
    const result = await readManifestFromZip(file);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("zip") });
  });
});
