// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import HistoryPanel from "../../../client/src/HistoryPanel.svelte";

const WORKSPACES = [
  {
    name: "ws-1",
    isCurrent: true,
    snapshots: [{ filename: "a.json", timestamp: "2026-01-01T00:00:00.000Z", type: "mermaid", title: "First" }],
  },
];

describe("HistoryPanel.svelte", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("fetches and renders the snapshot list for each workspace when opened", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, workspaces: WORKSPACES }),
    });
    const { findByText } = render(HistoryPanel, { props: { open: true } });
    expect(await findByText("First")).toBeTruthy();
    expect(await findByText("ws-1")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith("/snapshots/all");
  });

  it("POSTs the workspace/filename and closes on clicking a snapshot entry", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, workspaces: WORKSPACES }),
    });
    const { findByText, component } = render(HistoryPanel, { props: { open: true } });
    const closeHandler = vi.fn();
    component.$on("close", closeHandler);

    const row = await findByText("First");
    await fireEvent.click(row);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/snapshots/load",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ workspace: "ws-1", filename: "a.json" }),
        }),
      );
    });
    await waitFor(() => expect(closeHandler).toHaveBeenCalled());
  });
});
