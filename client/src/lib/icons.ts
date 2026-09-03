// Shape data for App.svelte's toolbar icons (NF43) — Icon.svelte renders
// these as real SVG elements (not {@html}, which the lint config forbids
// for XSS reasons) inside a shared wrapping <svg>.
export type IconShape =
  | { tag: "circle"; cx: number; cy: number; r: number }
  | { tag: "line"; x1: number; y1: number; x2: number; y2: number }
  | { tag: "path"; d: string }
  | { tag: "polyline"; points: string };

export const ICONS = {
  sun: [
    { tag: "circle", cx: 12, cy: 12, r: 4 },
    { tag: "line", x1: 12, y1: 2, x2: 12, y2: 4 },
    { tag: "line", x1: 12, y1: 20, x2: 12, y2: 22 },
    { tag: "line", x1: 4.93, y1: 4.93, x2: 6.34, y2: 6.34 },
    { tag: "line", x1: 17.66, y1: 17.66, x2: 19.07, y2: 19.07 },
    { tag: "line", x1: 2, y1: 12, x2: 4, y2: 12 },
    { tag: "line", x1: 20, y1: 12, x2: 22, y2: 12 },
    { tag: "line", x1: 4.93, y1: 19.07, x2: 6.34, y2: 17.66 },
    { tag: "line", x1: 17.66, y1: 6.34, x2: 19.07, y2: 4.93 },
  ],
  moon: [{ tag: "path", d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" }],
  history: [
    { tag: "line", x1: 8, y1: 6, x2: 21, y2: 6 },
    { tag: "line", x1: 8, y1: 12, x2: 21, y2: 12 },
    { tag: "line", x1: 8, y1: 18, x2: 21, y2: 18 },
    { tag: "line", x1: 3, y1: 6, x2: 3.01, y2: 6 },
    { tag: "line", x1: 3, y1: 12, x2: 3.01, y2: 12 },
    { tag: "line", x1: 3, y1: 18, x2: 3.01, y2: 18 },
  ],
  trash: [
    { tag: "polyline", points: "3 6 5 6 21 6" },
    { tag: "path", d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" },
    { tag: "path", d: "M10 11v6" },
    { tag: "path", d: "M14 11v6" },
    { tag: "path", d: "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" },
  ],
  export: [
    { tag: "path", d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" },
    { tag: "polyline", points: "7 10 12 15 17 10" },
    { tag: "line", x1: 12, y1: 15, x2: 12, y2: 3 },
  ],
  check: [{ tag: "polyline", points: "20 6 9 17 4 12" }],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof ICONS;
