import { describe, expect, it } from "vitest";
import { scopeCss } from "../../../../client/src/lib/scopeCss";

describe("scopeCss (client, NF42)", () => {
  it("wraps the given css in an @scope block anchored to the given id", () => {
    expect(scopeCss("body { color: red; }", ["anchor-1"])).toBe("@scope (#anchor-1) {\nbody { color: red; }\n}");
  });

  it("joins multiple anchor ids into a single selector list", () => {
    expect(scopeCss("p {}", ["a", "b"])).toBe("@scope (#a, #b) {\np {}\n}");
  });

  it("produces an empty @scope selector list for no anchors", () => {
    expect(scopeCss("p {}", [])).toBe("@scope () {\np {}\n}");
  });
});
