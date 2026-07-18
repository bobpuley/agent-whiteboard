// Board-chrome theme selection (F24/F25, v0.33) — persists to localStorage
// and drives the `data-theme` attribute on <html> that theme.css keys off.
// Never touches rendered content (see theme.css header comment).
import { writable } from "svelte/store";

export type Theme = "light" | "dark";

const STORAGE_KEY = "agent-whiteboard:theme";

function readInitial(): Theme {
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

function createThemeStore() {
  const state = writable<Theme>(readInitial());

  state.subscribe((theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  });

  function toggle() {
    state.update((t) => (t === "light" ? "dark" : "light"));
  }

  return { subscribe: state.subscribe, toggle };
}

export const themeStore = createThemeStore();
