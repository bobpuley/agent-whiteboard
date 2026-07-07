import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("../../../server/snapshot.js", () => ({
  saveSnapshot: vi.fn(),
  generateSnapshotId: vi.fn(() => "test-uuid-generated"),
}));

vi.mock("../../../server/snapshot-reader.js", () => ({
  findSnapshotById: vi.fn(),
  findSnapshotByIdInWorkspace: vi.fn(),
  listSnapshots: vi.fn(),
}));

vi.mock("../../../server/ws.js", () => ({
  broadcast: vi.fn(),
  broadcastStepFrames: vi.fn(),
  addClient: vi.fn(),
}));

import { createMcpServer } from "../../../server/mcp.js";
import * as snapshotReaderModule from "../../../server/snapshot-reader.js";
import { broadcast, broadcastStepFrames } from "../../../server/ws.js";
import { signalClick, signalDone } from "../../../server/events.js";
import { getCanvas, resetCanvas, resetLastWorkspace } from "../../../server/session.js";

interface ToolCallResult {
  content: { type: string; text: string }[];
}

interface RegisteredToolInternal {
  handler: (args: unknown, extra: unknown) => ToolCallResult | Promise<ToolCallResult>;
}

async function callTool(server: McpServer, name: string, args: unknown): Promise<unknown> {
  const tools = (server as unknown as { _registeredTools: Record<string, RegisteredToolInternal> })
    ._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`tool not registered: ${name}`);
  const result = await tool.handler(args, {});
  return JSON.parse(result.content[0].text);
}

describe("MCP tool: list_snapshots (v0.15)", () => {
  const server = createMcpServer();

  beforeEach(() => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockReset();
  });

  it("returns an error when workspace is missing", async () => {
    const result = await callTool(server, "list_snapshots", {});
    expect(result).toEqual({ ok: false, error: "workspace is required" });
  });

  it("returns an error when workspace contains path separators", async () => {
    const result = await callTool(server, "list_snapshots", { workspace: "../evil" });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/invalid workspace/);
  });

  it("returns { ok: true, snapshots: [] } for a workspace with no snapshots", async () => {
    vi.mocked(snapshotReaderModule.listSnapshots).mockReturnValue([]);
    const result = await callTool(server, "list_snapshots", { workspace: "my-course" });
    expect(result).toEqual({ ok: true, snapshots: [] });
  });

  it("returns the snapshot list from listSnapshots(), newest-first", async () => {
    const entries = [
      { id: "uuid-2", filename: "20260609_150000_screen.json", timestamp: "2026-06-09T15:00:00.000Z", type: "mermaid", title: "Diagram 2" },
      { id: "uuid-1", filename: "20260609_140000_screen.json", timestamp: "2026-06-09T14:00:00.000Z", type: "html" },
    ];
    vi.mocked(snapshotReaderModule.listSnapshots).mockReturnValue(entries);
    const result = await callTool(server, "list_snapshots", { workspace: "my-course" });
    expect(result).toEqual({ ok: true, snapshots: entries });
    expect(snapshotReaderModule.listSnapshots).toHaveBeenCalledWith("my-course", expect.any(String));
  });
});

describe("MCP tool: render — step-frames per-frame validation (v0.17, B5 regression)", () => {
  const server = createMcpServer();

  it("rejects a frame whose payload fails validation for its effective type", async () => {
    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [
        { label: "Step 1", payload: "graph TD; A" },
        { label: "Step 2", payload: "not a valid diagram" },
      ],
    });
    const result = await callTool(server, "render", { type: "step-frames", payload, options: { workspace: "my-course" } });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/mermaid/);
  });

  it("accepts and broadcasts a mixed-type sequence using each frame's own type", async () => {
    const { broadcast } = await import("../../../server/ws.js");
    const spy = vi.mocked(broadcast);
    spy.mockClear();

    const payload = JSON.stringify({
      frame_type: "mermaid",
      frames: [
        { label: "Step 1", type: "katex", payload: "E = mc^2" },
        { label: "Step 2", payload: "graph TD; A" },
      ],
    });
    const result = await callTool(server, "render", { type: "step-frames", payload, options: { workspace: "my-course" } });
    expect(result).toMatchObject({ ok: true });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toMatchObject({ type: "katex", payload: "E = mc^2" });
  });
});

describe("MCP tool: append_frame — per-frame type (v0.17)", () => {
  const server = createMcpServer();

  it("accepts an optional per-frame type override", async () => {
    const init = (await callTool(server, "init_step_frames", { frame_type: "mermaid", workspace: "my-course" })) as { id: string };
    const result = await callTool(server, "append_frame", { id: init.id, payload: "E = mc^2", type: "katex" });
    expect(result).toMatchObject({ ok: true, frame_count: 1 });
  });

  it("rejects a frame whose type override fails validation, even though frame_type would pass", async () => {
    const init = (await callTool(server, "init_step_frames", { frame_type: "mermaid", workspace: "my-course" })) as { id: string };
    const result = await callTool(server, "append_frame", { id: init.id, payload: "not json", type: "vega-lite" });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/vega-lite/);
  });
});

describe("MCP tool: export_html (v0.15)", () => {
  const server = createMcpServer();
  let tmpRoot: string;

  const VALID_KATEX_RECORD = {
    type: "katex",
    payload: "x^2 + y^2 = r^2",
    timestamp: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-whiteboard-mcp-export-"));
    process.env.WHITEBOARD_SNAPSHOTS_DIR = tmpRoot;
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace).mockReset();
  });

  afterEach(() => {
    delete process.env.WHITEBOARD_SNAPSHOTS_DIR;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns an error when workspace is missing", async () => {
    const result = await callTool(server, "export_html", { ids: ["uuid-1"] });
    expect(result).toEqual({ ok: false, error: "workspace is required" });
  });

  it("returns an error when workspace is invalid", async () => {
    const result = await callTool(server, "export_html", { workspace: "..", ids: ["uuid-1"] });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/invalid workspace/);
  });

  it("returns an error when ids is an empty array", async () => {
    const result = await callTool(server, "export_html", { workspace: "my-course", ids: [] });
    expect(result).toEqual({ ok: false, error: "ids must be a non-empty array" });
  });

  it("returns 'no valid items to export' when no id resolves in the workspace", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace).mockReturnValue(null);
    const result = await callTool(server, "export_html", { workspace: "my-course", ids: ["uuid-missing"] });
    expect(result).toEqual({ ok: false, error: "no valid items to export" });
  });

  it("skips unresolvable ids but still exports the ones that resolve", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(VALID_KATEX_RECORD);

    const result = await callTool(server, "export_html", {
      workspace: "my-course",
      ids: ["uuid-missing", "uuid-1"],
    });

    expect(result).toMatchObject({ ok: true });
    const path = (result as { path: string }).path;
    expect(existsSync(path)).toBe(true);
  });

  it("writes to the default path <root>/<workspace>/exports/<name>-*.html when output_path is omitted", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace).mockReturnValue(VALID_KATEX_RECORD);

    const result = await callTool(server, "export_html", { workspace: "my-course", ids: ["uuid-1"] });

    expect(result).toMatchObject({ ok: true });
    const path = (result as { path: string }).path;
    expect(path).toContain(join(tmpRoot, "my-course", "exports"));
    expect(path.endsWith(".html")).toBe(true);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toContain("<!DOCTYPE html>");
  });

  it("writes to a custom output_path, creating parent directories as needed", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotByIdInWorkspace).mockReturnValue(VALID_KATEX_RECORD);
    const customPath = join(tmpRoot, "nested", "dir", "custom-export.html");

    const result = await callTool(server, "export_html", {
      workspace: "my-course",
      ids: ["uuid-1"],
      output_path: customPath,
    });

    expect(result).toEqual({ ok: true, path: customPath });
    expect(existsSync(customPath)).toBe(true);
    expect(readFileSync(customPath, "utf-8")).toContain("<!DOCTYPE html>");
  });
});

describe("MCP tool: render — basic types", () => {
  const server = createMcpServer();

  afterEach(() => {
    resetCanvas();
    resetLastWorkspace();
    vi.mocked(broadcast).mockClear();
  });

  it("renders svg and broadcasts the replace action", async () => {
    const result = await callTool(server, "render", {
      type: "svg",
      payload: "<svg/>",
      options: { workspace: "ws1" },
    });
    expect(result).toMatchObject({ ok: true });
    expect(getCanvas()).toMatchObject({ type: "svg", payload: "<svg/>" });
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ action: "replace", type: "svg", payload: "<svg/>" }));
  });

  it("returns an error when workspace is missing", async () => {
    const result = await callTool(server, "render", { type: "svg", payload: "<svg/>", options: {} });
    expect(result).toEqual({ ok: false, error: "workspace is required" });
  });

  it("returns an error when workspace is invalid", async () => {
    const result = await callTool(server, "render", {
      type: "svg",
      payload: "<svg/>",
      options: { workspace: "../escape" },
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects mermaid payload without a diagram keyword", async () => {
    const result = await callTool(server, "render", {
      type: "mermaid",
      payload: "not a diagram",
      options: { workspace: "ws1" },
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects invalid vega-lite JSON", async () => {
    const result = await callTool(server, "render", {
      type: "vega-lite",
      payload: "{ not json",
      options: { workspace: "ws1" },
    });
    expect(result).toMatchObject({ ok: false });
  });
});

describe("MCP tool: step / seek", () => {
  const server = createMcpServer();

  afterEach(() => {
    resetCanvas();
    vi.mocked(broadcast).mockClear();
  });

  it("step returns an error when no step-frames sequence is loaded", async () => {
    const result = await callTool(server, "step", { direction: "next" });
    expect(result).toEqual({ ok: false, error: "no step-frames sequence is loaded" });
  });

  it("step advances the cursor and broadcasts the new frame", async () => {
    await callTool(server, "render", {
      type: "step-frames",
      payload: JSON.stringify({ frame_type: "mermaid", frames: [{ payload: "graph TD; A-->B" }, { payload: "graph TD; C-->D" }] }),
      options: { workspace: "ws1" },
    });
    vi.mocked(broadcast).mockClear();

    const result = await callTool(server, "step", { direction: "next" });
    expect(result).toEqual({ ok: true, current_frame: 1, total_frames: 2 });
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ currentFrame: 1, payload: "graph TD; C-->D" }));
  });

  it("seek jumps directly to a frame index", async () => {
    await callTool(server, "render", {
      type: "step-frames",
      payload: JSON.stringify({
        frame_type: "mermaid",
        frames: [{ payload: "graph TD; A-->B" }, { payload: "graph TD; C-->D" }, { payload: "graph TD; E-->F" }],
      }),
      options: { workspace: "ws1" },
    });

    const result = await callTool(server, "seek", { frame: 2 });
    expect(result).toEqual({ ok: true, current_frame: 2, total_frames: 3 });
  });

  it("seek returns an error when frame is out of range", async () => {
    await callTool(server, "render", {
      type: "step-frames",
      payload: JSON.stringify({ frame_type: "mermaid", frames: [{ payload: "graph TD; A-->B" }] }),
      options: { workspace: "ws1" },
    });

    const result = await callTool(server, "seek", { frame: 5 });
    expect(result).toEqual({ ok: false, error: "frame out of range: must be 0–0" });
  });

  it("seek returns an error when no step-frames sequence is loaded", async () => {
    const result = await callTool(server, "seek", { frame: 0 });
    expect(result).toEqual({ ok: false, error: "no step-frames sequence is loaded" });
  });
});

describe("MCP tool: clear", () => {
  const server = createMcpServer();

  afterEach(() => {
    resetCanvas();
    vi.mocked(broadcast).mockClear();
  });

  it("resets the canvas and broadcasts a clear action", async () => {
    await callTool(server, "render", { type: "svg", payload: "<svg/>", options: { workspace: "ws1" } });
    const result = await callTool(server, "clear", {});
    expect(result).toEqual({ ok: true });
    expect(getCanvas()).toEqual({ type: "empty" });
    expect(broadcast).toHaveBeenLastCalledWith({ action: "clear" });
  });
});

describe("MCP tool: slideshow / slideshow_stop", () => {
  const server = createMcpServer();

  afterEach(() => {
    resetCanvas();
    vi.mocked(broadcast).mockClear();
  });

  it("starts a slideshow and broadcasts the first slide", async () => {
    const result = await callTool(server, "slideshow", {
      slides: [{ type: "svg", payload: "<svg>1</svg>" }, { type: "svg", payload: "<svg>2</svg>" }],
      delay_ms: 1000,
      workspace: "ws1",
    });
    expect(result).toEqual({ ok: true });
    expect(broadcast).toHaveBeenCalledWith({ action: "replace", type: "svg", payload: "<svg>1</svg>", id: "test-uuid-generated" });
  });

  it("rejects a slideshow with a missing workspace", async () => {
    const result = await callTool(server, "slideshow", {
      slides: [{ type: "svg", payload: "<svg>1</svg>" }],
      delay_ms: 1000,
    });
    expect(result).toEqual({ ok: false, error: "workspace is required" });
  });

  it("rejects a slideshow with an invalid mermaid slide", async () => {
    const result = await callTool(server, "slideshow", {
      slides: [{ type: "mermaid", payload: "not a diagram" }],
      delay_ms: 1000,
      workspace: "ws1",
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("slideshow_stop is a no-op success even with nothing running", async () => {
    const result = await callTool(server, "slideshow_stop", {});
    expect(result).toEqual({ ok: true });
  });
});

describe("MCP tool: wait_click / wait_done", () => {
  const server = createMcpServer();

  afterEach(() => {
    vi.mocked(broadcast).mockClear();
  });

  it("wait_click arms the browser and resolves with the clicked event", async () => {
    const promise = callTool(server, "wait_click", {});
    expect(broadcast).toHaveBeenCalledWith({ action: "set_node_actions", node_actions: {}, enabled: true });

    signalClick({ type: "node", id: "n1", label: "Node 1", action: null });
    const result = await promise;

    expect(result).toEqual({ ok: true, type: "node", id: "n1", label: "Node 1", action: null });
    expect(broadcast).toHaveBeenCalledWith({ action: "set_node_actions", enabled: false });
  });

  it("wait_done resolves once the user signals done", async () => {
    const promise = callTool(server, "wait_done", {});
    signalDone();
    const result = await promise;
    expect(result).toEqual({ ok: true });
  });
});

describe("MCP tool: init_step_frames / append_frame / commit_step_frames", () => {
  const server = createMcpServer();

  afterEach(() => {
    resetCanvas();
    resetLastWorkspace();
    vi.mocked(broadcast).mockClear();
    vi.mocked(broadcastStepFrames).mockClear();
  });

  it("returns an error when workspace is missing", async () => {
    const result = await callTool(server, "init_step_frames", { frame_type: "mermaid", workspace: "" });
    expect(result).toEqual({ ok: false, error: "workspace is required" });
  });

  it("builds a sequence incrementally and commits it", async () => {
    const initResult = (await callTool(server, "init_step_frames", {
      frame_type: "mermaid",
      workspace: "ws1",
      title: "My Sequence",
    })) as { ok: boolean; id: string };
    expect(initResult.ok).toBe(true);
    const id = initResult.id;

    const appendResult = await callTool(server, "append_frame", { id, payload: "graph TD; A-->B", label: "Step 1" });
    expect(appendResult).toEqual({ ok: true, frame_count: 1 });
    expect(broadcastStepFrames).toHaveBeenCalledWith([{ payload: "graph TD; A-->B", label: "Step 1" }], "mermaid", 0, "My Sequence", id);

    const commitResult = await callTool(server, "commit_step_frames", { id });
    expect(commitResult).toMatchObject({ ok: true });

    const canvas = getCanvas();
    expect(canvas.type === "step-frames" && canvas.frames).toEqual([{ payload: "graph TD; A-->B", label: "Step 1" }]);
  });

  it("append_frame returns an error for an unknown id", async () => {
    const result = await callTool(server, "append_frame", { id: "nonexistent", payload: "graph TD; A-->B" });
    expect(result).toEqual({ ok: false, error: "step-frames session not found or expired" });
  });

  it("commit_step_frames returns an error for an unknown id", async () => {
    const result = await callTool(server, "commit_step_frames", { id: "nonexistent" });
    expect(result).toEqual({ ok: false, error: "step-frames session not found or expired" });
  });
});

describe("MCP tool: export", () => {
  const server = createMcpServer();

  afterEach(() => {
    resetCanvas();
  });

  it("returns the current canvas payload verbatim when no id is given", async () => {
    await callTool(server, "render", { type: "svg", payload: "<svg/>", options: { workspace: "ws1" } });
    const result = await callTool(server, "export", {});
    expect(result).toEqual({ ok: true, data: "<svg/>" });
  });

  it("returns an empty string when the canvas is blank", async () => {
    const result = await callTool(server, "export", {});
    expect(result).toEqual({ ok: true, data: "" });
  });

  it("returns an error when id is provided but no snapshot matches", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotById).mockReturnValue(null);
    const result = await callTool(server, "export", { id: "nope" });
    expect(result).toEqual({ ok: false, error: "graph not found" });
  });

  it("returns the matching snapshot's payload when id resolves", async () => {
    vi.mocked(snapshotReaderModule.findSnapshotById).mockReturnValue("graph TD; A-->B");
    const result = await callTool(server, "export", { id: "some-id" });
    expect(result).toEqual({ ok: true, data: "graph TD; A-->B" });
  });
});
