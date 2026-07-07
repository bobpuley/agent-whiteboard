import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPersistTrigger, persistContent } from "../../../server/persist.js";
import { saveSnapshot } from "../../../server/snapshot.js";

vi.mock("../../../server/snapshot.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/snapshot.js")>();
  return { ...actual, saveSnapshot: vi.fn() };
});

describe("persist — trigger registry (v0.25, D2 in docs/04_architecture.md §9.3)", () => {
  beforeEach(() => {
    vi.mocked(saveSnapshot).mockClear();
  });

  it.each([
    ["render", "immediate"],
    ["append_frame", "transient"],
    ["commit_step_frames", "on-finalize"],
    ["slideshow-end", "on-finalize"],
    ["step", "never"],
    ["seek", "never"],
    ["clear", "never"],
    ["history-load", "never"],
  ] as const)("declares %s as %s", (command, trigger) => {
    expect(getPersistTrigger(command)).toBe(trigger);
  });

  it("throws loudly for an undeclared command instead of silently never persisting (FR20/B15)", () => {
    expect(() => getPersistTrigger("some-new-feature")).toThrow(
      /no trigger declared for command "some-new-feature"/
    );
  });

  it("persistContent throws for an undeclared command before touching disk", () => {
    expect(() =>
      persistContent("some-new-feature", { type: "svg", payload: "<svg/>", workspace: "ws" })
    ).toThrow(/no trigger declared/);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});

describe("persist — persistContent write behavior per trigger", () => {
  beforeEach(() => {
    vi.mocked(saveSnapshot).mockClear();
    vi.mocked(saveSnapshot).mockReturnValue("generated-id");
  });

  it("immediate: writes now and returns the snapshot id", () => {
    const result = persistContent("render", {
      type: "mermaid",
      payload: "graph TD; A",
      title: "T",
      workspace: "ws",
      id: "pregenerated-id",
    });
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    expect(saveSnapshot).toHaveBeenCalledWith(
      "mermaid",
      "graph TD; A",
      { title: "T", node_to_frame: undefined, workspace: "ws" },
      "pregenerated-id"
    );
    expect(result).toEqual({ id: "generated-id" });
  });

  it("on-finalize: writes now, same as immediate", () => {
    const result = persistContent("commit_step_frames", {
      type: "step-frames",
      payload: '{"frame_type":"mermaid","frames":[]}',
      workspace: "ws",
    });
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "generated-id" });
  });

  it("transient: never touches disk", () => {
    const result = persistContent("append_frame", {
      type: "step-frames",
      payload: "graph TD; A",
      workspace: "ws",
    });
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("never: never touches disk", () => {
    const result = persistContent("clear", { type: "svg", payload: "<svg/>", workspace: "ws" });
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("F10 backstop: a saveSnapshot throw is swallowed, not propagated", () => {
    vi.mocked(saveSnapshot).mockImplementation(() => {
      throw new Error("disk full");
    });
    const result = persistContent("render", { type: "svg", payload: "<svg/>", workspace: "ws" });
    expect(result).toEqual({});
  });
});
