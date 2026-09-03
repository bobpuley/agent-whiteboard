// Static guard for F26 (v0.33): board-chrome theme variables must never be
// read by rendered content (Html/Mermaid/etc. renderers, mounted inside the
// @scope-wrapped #html-renderer-root — see client/src/lib/scopeCss.ts and
// docs/04_architecture.md §1). Since --board-* custom properties are
// declared on :root and CSS custom properties inherit through the DOM
// regardless of @scope boundaries, isolation depends on renderer code never
// referencing var(--board-*) itself — this test catches a future regression
// that would violate that.
//
// F33 (v1.2) themes a handful of app-chrome UI elements that happen to live
// in renderer files — error banners, a zoom hint, and the node-action popup
// menu — none of which are the agent-rendered payload itself (the mermaid
// SVG / katex / vega-embed output mounted into each component's own
// container ref). CHROME_EXEMPT_SELECTORS allowlists exactly those rule
// blocks; anything else in these files, and every other renderer file, must
// still stay free of var(--board-*) so a future change that actually themes
// rendered content fails this guard.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const THEME_CSS = readFileSync(join(__dirname, "../../../client/src/theme.css"), "utf-8");
const RENDERERS_DIR = join(__dirname, "../../../client/src/renderers");

const CHROME_EXEMPT_SELECTORS: Record<string, string[]> = {
  "Mermaid.svelte": [".render-error", ".zoom-hint"],
  "Katex.svelte": [".render-error"],
  "VegaLite.svelte": [".render-error"],
  "mermaid/NodeActionPopup.svelte": [
    ".node-action-popup",
    ".popup-item",
    ".popup-item:hover",
    ".popup-item + .popup-item",
  ],
};

function stripExemptChromeRules(source: string, relPath: string): string {
  const selectors = CHROME_EXEMPT_SELECTORS[relPath];
  if (!selectors) return source;
  let stripped = source;
  for (const selector of selectors) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    stripped = stripped.replace(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "g"), "");
  }
  return stripped;
}

describe("board theme / rendered-content isolation (F26)", () => {
  it("declares every custom property under the --board- namespace", () => {
    const declared = [...THEME_CSS.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) {
      expect(name.startsWith("--board-")).toBe(true);
    }
  });

  it("no renderer source references a --board- theme variable outside the F33 app-chrome exemptions", () => {
    const files = readdirSync(RENDERERS_DIR, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile() && (f.name.endsWith(".svelte") || f.name.endsWith(".ts")))
      .map((f) => join(f.parentPath ?? f.path, f.name));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const relPath = relative(RENDERERS_DIR, file);
      const source = readFileSync(file, "utf-8");
      const scrubbed = stripExemptChromeRules(source, relPath);
      expect(scrubbed).not.toMatch(/var\(--board-/);
    }
  });
});
