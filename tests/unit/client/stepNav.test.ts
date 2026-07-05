import { afterEach, describe, expect, it, vi } from "vitest";
import { stepNav } from "../../../client/src/stores/stepNav.js";

describe("stepNav", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the direction to /step", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await stepNav("next");

    expect(fetchMock).toHaveBeenCalledWith("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "next" }),
    });
  });

  it("supports prev direction", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await stepNav("prev");

    expect(fetchMock).toHaveBeenCalledWith(
      "/step",
      expect.objectContaining({ body: JSON.stringify({ direction: "prev" }) }),
    );
  });
});
