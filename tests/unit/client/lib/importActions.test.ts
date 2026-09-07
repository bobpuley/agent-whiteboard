// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadImportZip } from "../../../../client/src/lib/importActions";

describe("uploadImportZip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POSTs a multipart form with file, targetWorkspace, and mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, workspace: "ws-1", added: 1, updated: 0, skipped: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["zip-bytes"], "export.zip", { type: "application/zip" });
    const result = await uploadImportZip(file, "ws-1", "create");

    expect(result).toEqual({ ok: true, workspace: "ws-1", added: 1, updated: 0, skipped: 0 });
    expect(fetchMock).toHaveBeenCalledWith("/import", expect.objectContaining({ method: "POST" }));
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("targetWorkspace")).toBe("ws-1");
    expect(body.get("mode")).toBe("create");
  });

  it("returns the server's error message on ok:false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ ok: false, error: "manifest.json is missing from the zip" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["zip-bytes"], "export.zip", { type: "application/zip" });
    const result = await uploadImportZip(file, "ws-1", "create");

    expect(result).toEqual({ ok: false, error: "manifest.json is missing from the zip" });
  });

  it("returns a network-error message when fetch itself throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["zip-bytes"], "export.zip", { type: "application/zip" });
    const result = await uploadImportZip(file, "ws-1", "merge");

    expect(result).toEqual({ ok: false, error: "Network error during import" });
  });
});
