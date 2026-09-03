// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { trapFocus } from "../../../../client/src/lib/trapFocus";

function makeDialog(): { dialog: HTMLDivElement; first: HTMLButtonElement; last: HTMLButtonElement } {
  const dialog = document.createElement("div");
  const first = document.createElement("button");
  first.textContent = "First";
  const middle = document.createElement("button");
  middle.textContent = "Middle";
  const last = document.createElement("button");
  last.textContent = "Last";
  dialog.append(first, middle, last);
  document.body.appendChild(dialog);
  return { dialog, first, last };
}

function keydown(target: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("trapFocus (NF42)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("moves focus to the first focusable descendant on mount", () => {
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    const { dialog, first } = makeDialog();
    trapFocus(dialog);

    expect(document.activeElement).toBe(first);
  });

  it("falls back to focusing the node itself when it has no focusable descendants", () => {
    const dialog = document.createElement("div");
    dialog.tabIndex = -1; // still programmatically focusable despite being excluded from the Tab cycle
    document.body.appendChild(dialog);

    trapFocus(dialog);

    expect(document.activeElement).toBe(dialog);
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    const { dialog, first, last } = makeDialog();
    trapFocus(dialog);
    last.focus();

    const event = keydown(dialog, "Tab");

    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    const { dialog, first, last } = makeDialog();
    trapFocus(dialog);
    first.focus();

    const event = keydown(dialog, "Tab", true);

    expect(document.activeElement).toBe(last);
    expect(event.defaultPrevented).toBe(true);
  });

  it("calls onEscape when Escape is pressed", () => {
    const { dialog } = makeDialog();
    const onEscape = vi.fn();
    trapFocus(dialog, { onEscape });

    keydown(dialog, "Escape");

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the previously focused element on destroy()", () => {
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    const { dialog } = makeDialog();
    const action = trapFocus(dialog);
    action.destroy();

    expect(document.activeElement).toBe(outsideButton);
  });

  it("update() swaps the onEscape handler used by later Escape presses", () => {
    const { dialog } = makeDialog();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const action = trapFocus(dialog, { onEscape: firstHandler });

    action.update({ onEscape: secondHandler });
    keydown(dialog, "Escape");

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });
});
