import { afterEach, describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSnapshotsRoot } from "../../../server/paths.js";

describe("getSnapshotsRoot (F5/NF22 — canonical snapshots-root resolver)", () => {
  const originalDir = process.env.WHITEBOARD_SNAPSHOTS_DIR;

  afterEach(() => {
    if (originalDir === undefined) delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    else process.env.WHITEBOARD_SNAPSHOTS_DIR = originalDir;
  });

  it("defaults to ~/.agent-whiteboard when WHITEBOARD_SNAPSHOTS_DIR is unset", () => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    expect(getSnapshotsRoot()).toBe(join(homedir(), ".agent-whiteboard"));
  });

  it("uses WHITEBOARD_SNAPSHOTS_DIR when set", () => {
    process.env.WHITEBOARD_SNAPSHOTS_DIR = "/tmp/custom-snapshots-root";
    expect(getSnapshotsRoot()).toBe("/tmp/custom-snapshots-root");
  });
});
