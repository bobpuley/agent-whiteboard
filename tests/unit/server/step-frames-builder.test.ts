import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendFrame,
  builderCount,
  commitBuilder,
  createBuilder,
  resetBuilders,
} from "../../../server/step-frames-builder.js";

const FRAME_TYPE = "mermaid";
const WORKSPACE = "test-ws";
const PAYLOAD_A = "graph TD; A";
const PAYLOAD_B = "graph TD; A --> B";

afterEach(() => {
  resetBuilders();
  vi.useRealTimers();
});

describe("createBuilder", () => {
  it("returns a non-empty UUID string", () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("adds entry to the builder map", () => {
    createBuilder(FRAME_TYPE, WORKSPACE);
    expect(builderCount()).toBe(1);
  });

  it("each call produces a unique ID", () => {
    const a = createBuilder(FRAME_TYPE, WORKSPACE);
    const b = createBuilder(FRAME_TYPE, WORKSPACE);
    expect(a).not.toBe(b);
    expect(builderCount()).toBe(2);
  });
});

describe("appendFrame", () => {
  it("appends a frame and returns frame_count: 1 with partial state", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    const result = await appendFrame(id, PAYLOAD_A);
    expect(result).toMatchObject({ ok: true, frame_count: 1, frame_type: FRAME_TYPE });
    if (result.ok) {
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].payload).toBe(PAYLOAD_A);
    }
  });

  it("appends multiple frames and increments frame_count with all frames in result", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    await appendFrame(id, PAYLOAD_A);
    const result = await appendFrame(id, PAYLOAD_B, "Step 2");
    expect(result).toMatchObject({ ok: true, frame_count: 2 });
    if (result.ok) {
      expect(result.frames).toHaveLength(2);
    }
  });

  it("stores the optional label with the frame", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    await appendFrame(id, PAYLOAD_A, "First step");
    const commit = commitBuilder(id);
    expect(commit.ok).toBe(true);
    if (commit.ok) {
      expect(commit.entry.frames[0].label).toBe("First step");
    }
  });

  it("omits label key when not provided", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    await appendFrame(id, PAYLOAD_A);
    const commit = commitBuilder(id);
    expect(commit.ok).toBe(true);
    if (commit.ok) {
      expect("label" in commit.entry.frames[0]).toBe(false);
    }
  });

  it("returns error for invalid mermaid payload and does not add frame", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    const result = await appendFrame(id, "not a diagram");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/diagram keyword/);
    // Frame count should still be 0.
    const commit = commitBuilder(id);
    expect(commit.ok).toBe(false);
    if (!commit.ok) expect(commit.error).toMatch(/empty/);
  });

  it("returns error for unknown ID", async () => {
    const result = await appendFrame("does-not-exist", PAYLOAD_A);
    expect(result).toEqual({
      ok: false,
      error: "step-frames session not found or expired",
    });
  });

  it("accepts a per-frame type override that differs from the sequence's frame_type", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    const result = await appendFrame(id, "E = mc^2", undefined, "katex");
    expect(result).toMatchObject({ ok: true, frame_count: 1 });
    if (result.ok) {
      expect(result.frames[0].type).toBe("katex");
    }
  });

  it("validates against the per-frame type override, not the sequence's frame_type", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE); // frame_type: mermaid
    const result = await appendFrame(id, "not json", undefined, "vega-lite");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/vega-lite/);
  });

  it("falls back to the sequence's frame_type when no per-frame type is given", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    const result = await appendFrame(id, PAYLOAD_A);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("type" in result.frames[0]).toBe(false);
    }
  });

  it("returns error for expired ID and does not add frame", async () => {
    vi.useFakeTimers();
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    vi.advanceTimersByTime(31 * 60 * 1000);
    const result = await appendFrame(id, PAYLOAD_A);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/expired/);
    }
  });
});

describe("commitBuilder", () => {
  it("returns the assembled entry and removes it from the map", async () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE, "My title");
    await appendFrame(id, PAYLOAD_A, "Step 1");
    await appendFrame(id, PAYLOAD_B, "Step 2");

    const result = commitBuilder(id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.frame_type).toBe(FRAME_TYPE);
      expect(result.entry.workspace).toBe(WORKSPACE);
      expect(result.entry.title).toBe("My title");
      expect(result.entry.frames).toHaveLength(2);
      expect(result.entry.frames[0].payload).toBe(PAYLOAD_A);
      expect(result.entry.frames[1].payload).toBe(PAYLOAD_B);
    }
    expect(builderCount()).toBe(0);
  });

  it("returns error for empty sequence", () => {
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    const result = commitBuilder(id);
    expect(result).toEqual({
      ok: false,
      error: "cannot commit empty step-frames sequence",
    });
    // Entry is still in the map (not deleted on empty-commit error).
    expect(builderCount()).toBe(1);
  });

  it("returns error for unknown ID", () => {
    const result = commitBuilder("does-not-exist");
    expect(result).toEqual({
      ok: false,
      error: "step-frames session not found or expired",
    });
  });

  it("returns error for expired ID", async () => {
    vi.useFakeTimers();
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    await appendFrame(id, PAYLOAD_A);
    vi.advanceTimersByTime(31 * 60 * 1000);
    const result = commitBuilder(id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expired/);
  });
});

describe("TTL expiry", () => {
  it("entry is silently removed after 30 minutes", () => {
    vi.useFakeTimers();
    createBuilder(FRAME_TYPE, WORKSPACE);
    expect(builderCount()).toBe(1);
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(builderCount()).toBe(0);
  });

  it("appending a frame resets the TTL", async () => {
    vi.useFakeTimers();
    const id = createBuilder(FRAME_TYPE, WORKSPACE);
    vi.advanceTimersByTime(25 * 60 * 1000); // 25 min — not expired yet
    await appendFrame(id, PAYLOAD_A); // resets timer
    vi.advanceTimersByTime(25 * 60 * 1000); // another 25 min — still alive
    expect(builderCount()).toBe(1);
    vi.advanceTimersByTime(6 * 60 * 1000); // now 31 min since last append
    expect(builderCount()).toBe(0);
  });
});
