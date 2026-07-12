import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../../../../client/src/lib/formatTimestamp";

describe("formatTimestamp", () => {
  it("formats a valid ISO timestamp as a locale date/time string", () => {
    const formatted = formatTimestamp("2026-01-01T00:00:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatted).not.toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not throw for an unparseable timestamp", () => {
    expect(() => formatTimestamp("not-a-date")).not.toThrow();
  });
});
