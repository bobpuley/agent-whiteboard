// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import ImportExportMenu from "../../../../client/src/lib/ImportExportMenu.svelte";

function setup() {
  const r = render(ImportExportMenu);
  const onExport = vi.fn();
  const onImport = vi.fn();
  r.component.$on("export", onExport);
  r.component.$on("import", onImport);
  const button = r.getByRole("button", { name: "Import / export" });
  return { ...r, button, onExport, onImport };
}

describe("ImportExportMenu.svelte (F41/F42, NF56)", () => {
  afterEach(() => cleanup());

  it("is closed by default with ARIA attributes on the button", () => {
    const { button, queryByRole } = setup();
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(queryByRole("menu")).toBeNull();
  });

  it("click opens the menu with exactly Export… and Import… and focuses the first", async () => {
    const { button, getAllByRole } = setup();
    await fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const items = getAllByRole("menuitem");
    expect(items.map((i) => i.textContent?.trim())).toEqual(["Export…", "Import…"]);
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
  });

  it("click on the button again closes the menu", async () => {
    const { button, queryByRole } = setup();
    await fireEvent.click(button);
    await fireEvent.click(button);
    expect(queryByRole("menu")).toBeNull();
  });

  it("Arrow keys move focus and wrap", async () => {
    const { button, getAllByRole, getByRole } = setup();
    await fireEvent.click(button);
    const items = getAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    const menu = getByRole("menu");
    await fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    await fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    await fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("ArrowDown on the closed button opens the menu", async () => {
    const { button, getAllByRole } = setup();
    button.focus();
    await fireEvent.keyDown(button, { key: "ArrowDown" });
    const items = getAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
  });

  it("Escape closes the menu and returns focus to the button", async () => {
    const { button, getByRole, queryByRole } = setup();
    await fireEvent.click(button);
    await fireEvent.keyDown(getByRole("menu"), { key: "Escape" });
    expect(queryByRole("menu")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("clicking outside closes the menu", async () => {
    const { button, queryByRole } = setup();
    await fireEvent.click(button);
    await fireEvent.mouseDown(document.body);
    expect(queryByRole("menu")).toBeNull();
  });

  it("Tab closes the menu without trapping focus", async () => {
    const { button, getByRole, queryByRole } = setup();
    await fireEvent.click(button);
    await fireEvent.keyDown(getByRole("menu"), { key: "Tab" });
    expect(queryByRole("menu")).toBeNull();
  });

  it("choosing Export… dispatches export and closes", async () => {
    const { button, getByRole, queryByRole, onExport, onImport } = setup();
    await fireEvent.click(button);
    await fireEvent.click(getByRole("menuitem", { name: /export/i }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onImport).not.toHaveBeenCalled();
    expect(queryByRole("menu")).toBeNull();
  });

  it("choosing Import… dispatches import and closes", async () => {
    const { button, getByRole, queryByRole, onExport, onImport } = setup();
    await fireEvent.click(button);
    await fireEvent.click(getByRole("menuitem", { name: /import/i }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onExport).not.toHaveBeenCalled();
    expect(queryByRole("menu")).toBeNull();
  });
});
