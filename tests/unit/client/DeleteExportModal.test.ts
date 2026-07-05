// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import DeleteExportModal from "../../../client/src/DeleteExportModal.svelte";

const ONE_WORKSPACE = [
  { name: "ws-1", isCurrent: true, snapshots: [{ filename: "a.json", timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", title: "First" }] },
];

const TWO_WORKSPACES = [
  ...ONE_WORKSPACE,
  { name: "ws-2", isCurrent: false, snapshots: [{ filename: "b.json", timestamp: "2026-01-02T00:00:00.000Z", type: "svg", title: "Second" }] },
];

describe("DeleteExportModal.svelte", () => {
  afterEach(() => cleanup());

  it("skips step 1 and opens directly on step 2 when exactly one workspace has snapshots (U7i)", () => {
    const { queryByText, getByText } = render(DeleteExportModal, {
      props: { mode: "delete", open: true, workspaces: ONE_WORKSPACE, loadError: null },
    });
    expect(queryByText("Delete — choose a workspace")).toBeNull();
    expect(getByText("ws-1")).toBeTruthy();
  });

  it("opens on step 1 (workspace picker) when there are multiple workspaces, and back-navigates from step 2", async () => {
    const { getByText, queryByLabelText } = render(DeleteExportModal, {
      props: { mode: "delete", open: true, workspaces: TWO_WORKSPACES, loadError: null },
    });
    expect(getByText("Delete — choose a workspace")).toBeTruthy();

    await fireEvent.click(getByText(/^ws-1/));
    expect(getByText("ws-1")).toBeTruthy(); // now the step-2 title
    expect(queryByLabelText("Back")).toBeTruthy();

    await fireEvent.click(queryByLabelText("Back")!);
    expect(getByText("Delete — choose a workspace")).toBeTruthy();
  });
});
