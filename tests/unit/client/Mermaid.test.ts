// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import Mermaid from "../../../client/src/renderers/Mermaid.svelte";

const NODE_SVG =
  '<svg viewBox="0 0 100 100"><g class="node" id="flowchart-A-1"><rect width="40" height="20"/><text class="nodeLabel">Node A</text></g></svg>';

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: NODE_SVG })),
  },
}));

describe("Mermaid.svelte", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the given mermaid source into an svg without crashing", async () => {
    const { container } = render(Mermaid, { props: { source: "graph TD; A-->B" } });
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy());
  });

  it("shows a popup listing the registered actions when a node with nodeActions is clicked", async () => {
    const { container, findByText } = render(Mermaid, {
      props: { source: "graph TD; A", clickable: true, nodeActions: { A: ["Explain", "Expand"] } },
    });
    await waitFor(() => expect(container.querySelector(".node")).toBeTruthy());
    await fireEvent.click(container.querySelector(".node")!);
    expect(await findByText("Explain")).toBeTruthy();
    expect(await findByText("Expand")).toBeTruthy();
  });

  it("does not show a popup for a node with no registered actions (falls back to plain click)", async () => {
    const { container } = render(Mermaid, {
      props: { source: "graph TD; A", clickable: true, nodeActions: {} },
    });
    await waitFor(() => expect(container.querySelector(".node")).toBeTruthy());
    await fireEvent.click(container.querySelector(".node")!);
    expect(container.querySelector(".node-action-popup")).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith("/node-click", expect.objectContaining({ method: "POST" }));
  });
});
