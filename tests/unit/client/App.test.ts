// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/svelte";
import type { RenderCommand } from "../../../client/src/ws.js";
import App from "../../../client/src/App.svelte";

let capturedHandler: ((cmd: RenderCommand) => void) | null = null;

vi.mock("../../../client/src/ws.js", () => ({
  connectWebSocket: (handler: (cmd: RenderCommand) => void) => {
    capturedHandler = handler;
    return () => {};
  },
}));

describe("App.svelte", () => {
  afterEach(() => {
    cleanup();
    capturedHandler = null;
  });

  it("routes a WS replace/svg command through to the html renderer with the right content", async () => {
    const { container } = render(App);
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    capturedHandler!({ action: "replace", type: "svg", payload: '<svg><circle r="5"/></svg>', id: "id-1", cursor: 0, total: 1 });

    await waitFor(() => expect(container.querySelector(".html-renderer circle")).toBeTruthy());
  });

  it("theme toggle switches data-theme and its own label between light and dark", async () => {
    const { getByRole } = render(App);
    const before = document.documentElement.getAttribute("data-theme");
    const toggle = getByRole("button", { name: /switch to (dark|light) theme/i });

    await toggle.click();

    const after = document.documentElement.getAttribute("data-theme");
    expect(after).not.toBe(before);
    expect(["light", "dark"]).toContain(after);
    expect(getByRole("button", { name: after === "dark" ? /switch to light theme/i : /switch to dark theme/i })).toBeTruthy();
  });
});
