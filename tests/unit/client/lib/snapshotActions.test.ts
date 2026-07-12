// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteFiles, deleteWorkspace, exportItems } from "../../../../client/src/lib/snapshotActions";

describe("snapshotActions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("deleteWorkspace", () => {
    it("POSTs the workspace name and resolves on ok:true", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      vi.stubGlobal("fetch", fetchMock);

      await expect(deleteWorkspace("ws-1")).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        "/snapshots/delete-workspace",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ workspace: "ws-1" }) })
      );
    });

    it("throws the server's error message on ok:false", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ ok: false, error: "workspace not found" }) });
      vi.stubGlobal("fetch", fetchMock);

      await expect(deleteWorkspace("ws-missing")).rejects.toThrow("workspace not found");
    });

    it("falls back to a default message when the server omits one", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ ok: false }) });
      vi.stubGlobal("fetch", fetchMock);

      await expect(deleteWorkspace("ws-1")).rejects.toThrow("Delete failed");
    });
  });

  describe("deleteFiles", () => {
    it("POSTs workspace + filenames and resolves on ok:true", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ ok: true, deleted: 2 }) });
      vi.stubGlobal("fetch", fetchMock);

      await expect(deleteFiles("ws-1", ["a.json", "b.json"])).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        "/snapshots/delete-files",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ workspace: "ws-1", filenames: ["a.json", "b.json"] }),
        })
      );
    });

    it("throws the server's error message on ok:false", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ ok: false, error: "boom" }) });
      vi.stubGlobal("fetch", fetchMock);

      await expect(deleteFiles("ws-1", ["a.json"])).rejects.toThrow("boom");
    });
  });

  describe("exportItems", () => {
    it("triggers a download on a successful response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "Content-Disposition": 'attachment; filename="export.html"' }),
        blob: async () => new Blob(["<html></html>"], { type: "text/html" }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

      await exportItems([{ workspace: "ws-1", id: "uuid-1" }]);

      expect(fetchMock).toHaveBeenCalledWith(
        "/export-html",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ items: [{ workspace: "ws-1", id: "uuid-1" }] }),
        })
      );
      expect(createUrl).toHaveBeenCalled();
    });

    it("throws the server's error message on a non-ok response", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "no valid items to export" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(exportItems([{ workspace: "ws-1", id: "uuid-1" }])).rejects.toThrow("no valid items to export");
    });

    it("falls back to a default message when the error body isn't parseable JSON", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new Error("not json")),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(exportItems([{ workspace: "ws-1", id: "uuid-1" }])).rejects.toThrow("Export failed");
    });
  });
});
