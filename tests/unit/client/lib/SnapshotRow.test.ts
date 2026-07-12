// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import SnapshotRow from "../../../../client/src/lib/SnapshotRow.svelte";

describe("SnapshotRow.svelte", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the title, type badge, and formatted timestamp", () => {
    const { getByText, container } = render(SnapshotRow, {
      props: { title: "TCP Handshake", type: "mermaid", timestamp: "2026-01-01T00:00:00.000Z" },
    });
    expect(getByText("TCP Handshake")).toBeTruthy();
    expect(getByText("mermaid")).toBeTruthy();
    expect(container.querySelector(".snapshot-title")?.textContent).toBe("TCP Handshake");
    expect(container.querySelector(".type-badge")?.textContent).toBe("mermaid");
    expect(container.querySelector(".snapshot-time")?.textContent).not.toBe("");
  });

  it("shows an em-dash placeholder when title is absent", () => {
    const { container } = render(SnapshotRow, {
      props: { title: undefined, type: "svg", timestamp: "2026-01-01T00:00:00.000Z" },
    });
    expect(container.querySelector(".snapshot-title")?.textContent).toBe("—");
  });
});
