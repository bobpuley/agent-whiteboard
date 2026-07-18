// Static guard for F26 (v0.33): board-chrome theme variables must never be
// read by rendered content (Html/Mermaid/etc. renderers, mounted inside the
// @scope-wrapped #html-renderer-root — see client/src/lib/scopeCss.ts and
// docs/04_architecture.md §1). Since --board-* custom properties are
// declared on :root and CSS custom properties inherit through the DOM
// regardless of @scope boundaries, isolation depends on renderer code never
// referencing var(--board-*) itself — this test catches a future regression
// that would violate that.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const THEME_CSS = readFileSync(join(__dirname, "../../../client/src/theme.css"), "utf-8");
const RENDERERS_DIR = join(__dirname, "../../../client/src/renderers");

describe("board theme / rendered-content isolation (F26)", () => {
  it("declares every custom property under the --board- namespace", () => {
    const declared = [...THEME_CSS.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) {
      expect(name.startsWith("--board-")).toBe(true);
    }
  });

  it("no renderer source references a --board- theme variable", () => {
    const files = readdirSync(RENDERERS_DIR, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile() && (f.name.endsWith(".svelte") || f.name.endsWith(".ts")))
      .map((f) => join(f.parentPath ?? f.path, f.name));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      expect(source).not.toMatch(/var\(--board-/);
    }
  });
});
