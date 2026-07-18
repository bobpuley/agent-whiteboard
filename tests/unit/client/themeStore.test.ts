// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

const STORAGE_KEY = "agent-whiteboard:theme";

async function freshThemeStore() {
  const mod = await import("../../../client/src/stores/themeStore.js");
  return mod.themeStore;
}

describe("themeStore", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to light and sets data-theme when no preference is stored", async () => {
    const themeStore = await freshThemeStore();

    expect(get(themeStore)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("restores a previously saved dark preference on load", async () => {
    localStorage.setItem(STORAGE_KEY, "dark");

    const themeStore = await freshThemeStore();

    expect(get(themeStore)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggle() flips the theme, updates data-theme, and persists to localStorage", async () => {
    const themeStore = await freshThemeStore();

    themeStore.toggle();
    expect(get(themeStore)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");

    themeStore.toggle();
    expect(get(themeStore)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });
});
