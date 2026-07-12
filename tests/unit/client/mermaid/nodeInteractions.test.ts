// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeInteractions } from "../../../../client/src/renderers/mermaid/nodeInteractions";

function extractNodeId(el: Element): string | null {
  const m = el.id.match(/flowchart-(.+?)-\d+$/);
  return m ? m[1] : null;
}

function extractNodeLabel(el: Element): string {
  const label = el.querySelector(".nodeLabel") ?? el.querySelector(".label") ?? el;
  return label.textContent?.trim() ?? "";
}

function extractEdgeId(el: Element): string | null {
  const group = el.closest("[id]");
  return group ? group.id || null : null;
}

function makeSvgContainer(): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = `
    <svg viewBox="0 0 100 100">
      <g class="node" id="flowchart-A-1">
        <rect width="40" height="20"/>
        <text class="nodeLabel">Node A</text>
      </g>
      <g class="node" id="flowchart-B-2">
        <rect width="40" height="20"/>
        <text class="nodeLabel">Node B</text>
      </g>
      <g id="L_A_B_0">
        <text class="edgeLabel">edge label</text>
      </g>
    </svg>
  `;
  return div;
}

describe("createNodeInteractions", () => {
  let container: HTMLDivElement;
  let nodeActions: Record<string, string[]> | undefined;
  let popupRequests: unknown[];

  beforeEach(() => {
    container = makeSvgContainer();
    nodeActions = undefined;
    popupRequests = [];
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeInteractions() {
    return createNodeInteractions({
      getContainer: () => container,
      extractNodeId,
      extractNodeLabel,
      extractEdgeId,
      getNodeActions: () => nodeActions,
      onPopupRequest: (p) => popupRequests.push(p),
    });
  }

  it("attaches click listeners to nodes and edges, marking nodes clickable-node with pointer cursor", () => {
    const ni = makeInteractions();
    ni.attachClickListeners();

    const nodeA = container.querySelector("#flowchart-A-1") as HTMLElement;
    expect(nodeA.classList.contains("clickable-node")).toBe(true);
    expect(nodeA.style.cursor).toBe("pointer");

    const edge = container.querySelector(".edgeLabel") as HTMLElement;
    expect(edge.style.cursor).toBe("pointer");
  });

  it("plain node click (no registered actions) posts to /node-click with type node", async () => {
    const ni = makeInteractions();
    ni.attachClickListeners();

    const nodeA = container.querySelector("#flowchart-A-1") as HTMLElement;
    nodeA.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledWith(
      "/node-click",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "node", id: "A", label: "Node A" }),
      })
    );
    expect(popupRequests).toHaveLength(0);
  });

  it("node click with registered actions requests a popup instead of posting directly", async () => {
    nodeActions = { A: ["Explain", "Expand"] };
    const ni = makeInteractions();
    ni.attachClickListeners();

    const nodeA = container.querySelector("#flowchart-A-1") as HTMLElement;
    nodeA.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }));
    await Promise.resolve();

    expect(popupRequests).toEqual([{ x: 10, y: 20, nodeId: "A", nodeLabel: "Node A", actions: ["Explain", "Expand"] }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("edge click posts to /node-click with type edge", async () => {
    const ni = makeInteractions();
    ni.attachClickListeners();

    const edge = container.querySelector(".edgeLabel") as HTMLElement;
    edge.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledWith(
      "/node-click",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "edge", id: "L_A_B_0", label: "edge label" }),
      })
    );
  });

  it("detachClickListeners removes clickable-node class and click handlers", () => {
    const ni = makeInteractions();
    ni.attachClickListeners();
    ni.detachClickListeners();

    const nodeA = container.querySelector("#flowchart-A-1") as HTMLElement;
    expect(nodeA.classList.contains("clickable-node")).toBe(false);
    expect(nodeA.style.cursor).toBe("");
  });

  it("selectAction posts the chosen action for a popup request", async () => {
    const ni = makeInteractions();
    await ni.selectAction({ x: 0, y: 0, nodeId: "A", nodeLabel: "Node A", actions: ["Explain"] }, "Explain");

    expect(global.fetch).toHaveBeenCalledWith(
      "/node-click",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "node", id: "A", label: "Node A", action: "Explain" }),
      })
    );
  });

  it("attachNodeToFrameListeners only wires nodes present in the map, calling /seek with the target frame", async () => {
    const ni = makeInteractions();
    ni.attachNodeToFrameListeners({ A: 2 });

    const nodeA = container.querySelector("#flowchart-A-1") as HTMLElement;
    const nodeB = container.querySelector("#flowchart-B-2") as HTMLElement;
    expect(nodeA.style.cursor).toBe("pointer");
    expect(nodeB.style.cursor).toBe("");

    nodeA.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledWith(
      "/seek",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ frame: 2 }) })
    );
  });

  it("detachNodeToFrameListeners removes the wired listeners", () => {
    const ni = makeInteractions();
    ni.attachNodeToFrameListeners({ A: 2 });
    ni.detachNodeToFrameListeners();

    const nodeA = container.querySelector("#flowchart-A-1") as HTMLElement;
    expect(nodeA.style.cursor).toBe("");
  });

  it("no-ops when the container has no svg yet", () => {
    container = document.createElement("div");
    const ni = makeInteractions();
    expect(() => ni.attachClickListeners()).not.toThrow();
    expect(() => ni.attachNodeToFrameListeners({ A: 0 })).not.toThrow();
  });
});
