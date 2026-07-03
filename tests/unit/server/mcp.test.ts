import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("../../../server/snapshot.js", () => ({
  saveSnapshot: vi.fn(),
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
