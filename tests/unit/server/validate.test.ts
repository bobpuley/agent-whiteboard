import { describe, expect, it } from "vitest";
import { FRAME_TYPES, KNOWN_TYPES, validateFrame, validatePayload } from "../../../server/validate.js";

describe("validateFrame", () => {
  it("accepts a valid mermaid frame", async () => {
    const error = await validateFrame({ type: "mermaid", payload: "graph TD; A --> B" });
    expect(error).toBeNull();
  });

  it("rejects a mermaid frame missing a diagram keyword", async () => {
    const error = await validateFrame({ type: "mermaid", payload: "not a diagram" });
    expect(error).toMatch(/diagram keyword/);
  });

  it("rejects a mermaid frame with invalid syntax", async () => {
    const error = await validateFrame({ type: "mermaid", payload: "graph TD; A --invalid-->" });
    expect(error).toMatch(/invalid mermaid syntax/);
  });

  it("accepts a valid vega-lite frame", async () => {
    const error = await validateFrame({ type: "vega-lite", payload: '{"mark":"bar"}' });
    expect(error).toBeNull();
  });

  it("rejects a vega-lite frame with invalid JSON", async () => {
    const error = await validateFrame({ type: "vega-lite", payload: "not json {" });
    expect(error).toMatch(/vega-lite payload must be valid JSON/);
  });

  it("accepts any payload for svg/html/katex (no server-side hard gate)", async () => {
    for (const type of ["svg", "html", "katex"] as const) {
      const error = await validateFrame({ type, payload: "<anything>" });
      expect(error).toBeNull();
    }
  });

  it("rejects a frame whose type is step-frames — frames don't nest", async () => {
    const error = await validateFrame({ type: "step-frames", payload: "{}" });
    expect(error).toMatch(new RegExp(`type must be one of: ${FRAME_TYPES.join(", ")}`));
  });

  it("rejects an unknown type", async () => {
    const error = await validateFrame({ type: "bogus", payload: "x" });
    expect(error).toMatch(/type must be one of/);
  });
});

describe("validatePayload — single-frame delegation", () => {
  it("delegates a non-step-frames type to validateFrame and returns the same result", async () => {
    const viaPayload = await validatePayload("mermaid", "not a diagram");
    const viaFrame = await validateFrame({ type: "mermaid", payload: "not a diagram" });
    expect(viaPayload).toBe(viaFrame);
  });

  it("rejects a type outside KNOWN_TYPES before ever reaching validateFrame", async () => {
    const error = await validatePayload("bogus", "x");
    expect(error).toBe(`type must be one of: ${KNOWN_TYPES.join(", ")}`);
  });
});

describe("validatePayload — step-frames envelope", () => {
  const envelope = (frames: unknown[], frame_type = "mermaid") =>
    JSON.stringify({ frame_type, frames });

  it("accepts a well-formed step-frames envelope with all-valid frames", async () => {
    const error = await validatePayload(
      "step-frames",
      envelope([{ payload: "graph TD; A" }, { payload: "graph TD; A --> B" }])
    );
    expect(error).toBeNull();
  });

  it("rejects malformed JSON", async () => {
    const error = await validatePayload("step-frames", "not json {");
    expect(error).toMatch(/must be valid JSON/);
  });

  it("rejects an envelope missing frame_type or frames", async () => {
    const error = await validatePayload("step-frames", JSON.stringify({ frames: [] }));
    expect(error).toMatch(/frame_type.*frames/);
  });

  it("rejects an empty frames array", async () => {
    const error = await validatePayload("step-frames", envelope([]));
    expect(error).toMatch(/non-empty array/);
  });

  it("rejects a frame missing a payload string", async () => {
    const error = await validatePayload("step-frames", envelope([{ label: "no payload" }]));
    expect(error).toMatch(/each frame must have a "payload" string/);
  });

  it("rejects and indexes the first invalid frame, validated via validateFrame", async () => {
    const error = await validatePayload(
      "step-frames",
      envelope([{ payload: "graph TD; A" }, { payload: "not a diagram" }])
    );
    expect(error).toMatch(/^frame\[1\]: /);
    expect(error).toMatch(/diagram keyword/);
  });

  it("validates each frame against its own type override, falling back to frame_type", async () => {
    const error = await validatePayload(
      "step-frames",
      envelope([{ payload: "not json {", type: "vega-lite" }])
    );
    expect(error).toMatch(/^frame\[0\]: /);
    expect(error).toMatch(/vega-lite payload must be valid JSON/);
  });
});
