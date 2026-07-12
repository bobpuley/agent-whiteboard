// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import NodeActionPopup from "../../../../client/src/renderers/mermaid/NodeActionPopup.svelte";

describe("NodeActionPopup.svelte", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when popup is null", () => {
    const { container } = render(NodeActionPopup, { props: { popup: null } });
    expect(container.querySelector(".node-action-popup")).toBeNull();
    expect(container.querySelector(".popup-backdrop")).toBeNull();
  });

  it("renders one item per action, positioned at the popup's coordinates", () => {
    const { container, getByText } = render(NodeActionPopup, {
      props: { popup: { x: 42, y: 84, nodeId: "A", nodeLabel: "Node A", actions: ["Explain", "Expand"] } },
    });
    expect(getByText("Explain")).toBeTruthy();
    expect(getByText("Expand")).toBeTruthy();
    const popupEl = container.querySelector(".node-action-popup") as HTMLElement;
    expect(popupEl.style.left).toBe("42px");
    expect(popupEl.style.top).toBe("84px");
  });

  it("dispatches 'select' with the chosen action when an item is clicked", async () => {
    const { getByText, component } = render(NodeActionPopup, {
      props: { popup: { x: 0, y: 0, nodeId: "A", nodeLabel: "Node A", actions: ["Explain", "Expand"] } },
    });
    const onSelect = vi.fn();
    component.$on("select", (e: CustomEvent<string>) => onSelect(e.detail));

    await fireEvent.click(getByText("Expand"));
    expect(onSelect).toHaveBeenCalledWith("Expand");
  });

  it("dispatches 'select' on Enter keydown for an item", async () => {
    const { getByText, component } = render(NodeActionPopup, {
      props: { popup: { x: 0, y: 0, nodeId: "A", nodeLabel: "Node A", actions: ["Explain"] } },
    });
    const onSelect = vi.fn();
    component.$on("select", (e: CustomEvent<string>) => onSelect(e.detail));

    await fireEvent.keyDown(getByText("Explain"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("Explain");
  });

  it("dispatches 'dismiss' when the backdrop is clicked", async () => {
    const { container, component } = render(NodeActionPopup, {
      props: { popup: { x: 0, y: 0, nodeId: "A", nodeLabel: "Node A", actions: ["Explain"] } },
    });
    const onDismiss = vi.fn();
    component.$on("dismiss", onDismiss);

    await fireEvent.click(container.querySelector(".popup-backdrop")!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clicking inside the popup itself does not dismiss it", async () => {
    const { container, component } = render(NodeActionPopup, {
      props: { popup: { x: 0, y: 0, nodeId: "A", nodeLabel: "Node A", actions: ["Explain"] } },
    });
    const onDismiss = vi.fn();
    component.$on("dismiss", onDismiss);

    await fireEvent.click(container.querySelector(".node-action-popup")!);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
