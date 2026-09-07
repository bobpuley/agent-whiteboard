// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerDownload } from "../../../../client/src/lib/download";

// jsdom doesn't implement Blob URLs (github.com/jsdom/jsdom#1721) — stub the
// two methods so vi.spyOn() has something to hook onto; real browsers (and
// the previous happy-dom test environment) implement both natively.
URL.createObjectURL ??= () => "";
URL.revokeObjectURL ??= () => {};

function makeResponse(contentDisposition: string | null, blobContent = "<html></html>"): Response {
  return {
    headers: new Headers(contentDisposition ? { "Content-Disposition": contentDisposition } : {}),
    blob: async () => new Blob([blobContent], { type: "text/html" }),
  } as unknown as Response;
}

describe("triggerDownload (NF42)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads using the filename from Content-Disposition", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await triggerDownload(makeResponse('attachment; filename="my-export.html"'));

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith("blob:mock");
  });

  it("falls back to export.html when Content-Disposition is missing", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let downloadedFilename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download;
    });

    await triggerDownload(makeResponse(null));

    expect(downloadedFilename).toBe("export.html");
  });

  it("appends and removes the anchor element from the document body", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await triggerDownload(makeResponse('attachment; filename="x.html"'));

    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });
});
