import { describe, expect, it } from "vitest";
import { FRAME_TYPES, validateFrame } from "../../../server/validate.js";

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

  it("rejects a frame whose type is step-frames — not a top-level content type anymore (v0.26 Sprint 45)", async () => {
    const error = await validateFrame({ type: "step-frames", payload: "{}" });
    expect(error).toMatch(new RegExp(`type must be one of: ${FRAME_TYPES.join(", ")}`));
  });

  it("rejects an unknown type", async () => {
    const error = await validateFrame({ type: "bogus", payload: "x" });
    expect(error).toMatch(/type must be one of/);
  });
});
