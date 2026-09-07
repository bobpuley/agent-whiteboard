import { describe, expect, it } from "vitest";
import { parsePort } from "../../../server/port.js";

describe("parsePort", () => {
  it("returns the fallback when the env var is unset", () => {
    expect(parsePort(undefined, 3000, "PORT")).toBe(3000);
  });

  it("parses a valid numeric string", () => {
    expect(parsePort("4000", 3000, "PORT")).toBe(4000);
  });

  it("accepts 0 (OS-assigned ephemeral port)", () => {
    expect(parsePort("0", 3000, "PORT")).toBe(0);
  });

  it("accepts the upper bound 65535", () => {
    expect(parsePort("65535", 3000, "PORT")).toBe(65535);
  });

  it("throws a clear error for a non-numeric value", () => {
    expect(() => parsePort("abc", 3000, "PORT")).toThrow(/Invalid PORT "abc"/);
  });

  it("throws for a negative value", () => {
    expect(() => parsePort("-1", 3000, "PORT")).toThrow(/Invalid PORT/);
  });

  it("throws for a non-integer value", () => {
    expect(() => parsePort("3000.5", 3000, "PORT")).toThrow(/Invalid PORT/);
  });

  it("throws for a value above 65535", () => {
    expect(() => parsePort("65536", 3000, "CHANNEL_PORT")).toThrow(/Invalid CHANNEL_PORT "65536"/);
  });
});
