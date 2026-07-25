// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import DeleteExportModal from "../../../client/src/DeleteExportModal.svelte";

const ONE_WORKSPACE = [
  { name: "ws-1", isCurrent: true, snapshots: [{ filename: "a.json", timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", title: "First" }] },
];

const ONE_WORKSPACE_WITH_ID = [
  {
    name: "ws-1",
    isCurrent: true,
    snapshots: [{ filename: "a.json", timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", title: "First", id: "uuid-1" }],
  },
];

const TWO_WORKSPACES = [
  ...ONE_WORKSPACE,
  { name: "ws-2", isCurrent: false, snapshots: [{ filename: "b.json", timestamp: "2026-01-02T00:00:00.000Z", type: "svg", title: "Second" }] },
];

const TWO_WORKSPACES_NO_CURRENT = [
  { name: "ws-1", isCurrent: false, snapshots: [{ filename: "a.json", timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", title: "First" }] },
  { name: "ws-2", isCurrent: false, snapshots: [{ filename: "b.json", timestamp: "2026-01-02T00:00:00.000Z", type: "svg", title: "Second" }] },
];

describe("DeleteExportModal.svelte", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips step 1 and opens directly on step 2 when exactly one workspace has snapshots (U7i)", () => {
    const { queryByText, getByText } = render(DeleteExportModal, {
      props: { mode: "delete", open: true, workspaces: ONE_WORKSPACE, loadError: null },
    });
    expect(queryByText("Delete — choose a workspace")).toBeNull();
    expect(getByText("ws-1")).toBeTruthy();
  });

  it("skips step 1 and opens directly on step 2 for the current workspace when there are multiple workspaces (FR29)", async () => {
    const { getByText, queryByText, queryByLabelText } = render(DeleteExportModal, {
      props: { mode: "delete", open: true, workspaces: TWO_WORKSPACES, loadError: null },
    });
    expect(queryByText("Delete — choose a workspace")).toBeNull();
    expect(getByText("ws-1")).toBeTruthy(); // step-2 title, auto-selected because ws-1.isCurrent

    expect(queryByLabelText("Back")).toBeTruthy();
  });

  it("still reaches the picker via Back and can switch to a non-current workspace (FR29)", async () => {
    const { getByText, queryByLabelText } = render(DeleteExportModal, {
      props: { mode: "delete", open: true, workspaces: TWO_WORKSPACES, loadError: null },
    });

    await fireEvent.click(queryByLabelText("Back")!);
    expect(getByText("Delete — choose a workspace")).toBeTruthy();

    await fireEvent.click(getByText(/^ws-2/));
    expect(getByText("ws-2")).toBeTruthy(); // now the step-2 title
  });

  it("opens on step 1 (workspace picker) when no workspace is flagged current", async () => {
    const { getByText } = render(DeleteExportModal, {
      props: { mode: "delete", open: true, workspaces: TWO_WORKSPACES_NO_CURRENT, loadError: null },
    });
    expect(getByText("Delete — choose a workspace")).toBeTruthy();

    await fireEvent.click(getByText(/^ws-1/));
    expect(getByText("ws-1")).toBeTruthy(); // now the step-2 title
  });

  it("skips step 1 and opens directly on step 2 for the current workspace in export mode too (FR29)", () => {
    const { getByText, queryByText } = render(DeleteExportModal, {
      props: { mode: "export", open: true, workspaces: TWO_WORKSPACES, loadError: null },
    });
    expect(queryByText("Export — choose a workspace")).toBeNull();
    expect(getByText("ws-1")).toBeTruthy();
  });

  it("exports the whole workspace using snapshot ids, not filenames (F4/NF21)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="export.html"' }),
      blob: async () => new Blob(["<html></html>"], { type: "text/html" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const { getByText } = render(DeleteExportModal, {
      props: { mode: "export", open: true, workspaces: ONE_WORKSPACE_WITH_ID, loadError: null },
    });

    await fireEvent.click(getByText(/Export entire workspace/));

    expect(fetchMock).toHaveBeenCalledWith(
      "/export-html",
      expect.objectContaining({
        body: JSON.stringify({ items: [{ workspace: "ws-1", id: "uuid-1" }] }),
      })
    );
  });

  it("shows an error instead of exporting when the workspace has no id-bearing snapshots (pre-migration edge case)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { getByText } = render(DeleteExportModal, {
      props: { mode: "export", open: true, workspaces: ONE_WORKSPACE, loadError: null },
    });

    await fireEvent.click(getByText(/Export entire workspace/));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getByText(/no exportable snapshots/)).toBeTruthy();
  });
});
