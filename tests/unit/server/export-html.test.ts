import { describe, expect, it } from "vitest";
import { generateExportHtml, scopeCss } from "../../../server/export-html.js";
import type { ValidatedExportItem } from "../../../server/export-html.js";

function vegaItem(workspace: string, marker: string, mark: string): ValidatedExportItem {
  const spec = {
    mark,
    data: { values: [{ x: marker, y: 1 }] },
    encoding: { x: { field: "x", type: "nominal" }, y: { field: "y", type: "quantitative" } },
  };
  return {
    workspace,
    filename: `${marker}_screen.json`,
    record: {
      frames: [{ type: "vega-lite", payload: JSON.stringify(spec) }],
      timestamp: new Date().toISOString(),
    },
  };
}

describe("generateExportHtml — concurrent-call safety (B14)", () => {
  it("two overlapping calls each produce correct, uncorrupted output", async () => {
    // A is short (finishes first); B is long (still mid-flight when A
    // finishes) — a non-nested overlap, the case that isn't safe unless
    // calls are serialized.
    const itemsA = [vegaItem("wsA", "AAA1", "point")];
    const itemsB = [
      vegaItem("wsB", "BBB1", "point"),
      vegaItem("wsB", "BBB2", "bar"),
      vegaItem("wsB", "BBB3", "line"),
      vegaItem("wsB", "BBB4", "point"),
      vegaItem("wsB", "BBB5", "bar"),
    ];

    const [resultA, resultB] = await Promise.all([
      generateExportHtml(itemsA),
      generateExportHtml(itemsB),
    ]);

    expect(resultA.html).toContain("AAA1");
    expect(resultA.html).not.toContain("BBB");
    for (const marker of ["BBB1", "BBB2", "BBB3", "BBB4", "BBB5"]) {
      expect(resultB.html).toContain(marker);
    }
    expect(resultB.html).not.toContain("AAA");
  });

  it("does not leave dangling global DOM state after overlapping calls settle", async () => {
    expect(typeof (global as unknown as { document?: unknown }).document).toBe("undefined");

    const itemsA = [vegaItem("wsA", "AAA1", "point")];
    const itemsB = [
      vegaItem("wsB", "BBB1", "point"),
      vegaItem("wsB", "BBB2", "bar"),
      vegaItem("wsB", "BBB3", "line"),
    ];

    await Promise.all([generateExportHtml(itemsA), generateExportHtml(itemsB)]);

    // Without serialization, the shorter call's `finally` can restore global
    // DOM state to a snapshot that still points at the longer call's
    // (later-to-be-closed) Window, leaving `global.document` non-undefined
    // even after both calls have fully settled.
    expect(typeof (global as unknown as { document?: unknown }).document).toBe("undefined");

    // A subsequent, purely sequential call must still work correctly.
    const resultC = await generateExportHtml([vegaItem("wsC", "CCC1", "point")]);
    expect(resultC.html).toContain("CCC1");
    expect(typeof (global as unknown as { document?: unknown }).document).toBe("undefined");
  });
});

describe("generateExportHtml — layout containment (B20)", () => {
  it("gives .item-section and .frame-section their own horizontal scroll region, so an oversized table/code block can't overflow the page", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsD",
        filename: "wide.json",
        record: {
          frames: [{ type: "html", payload: "<table><tr><td>wide</td></tr></table>" }],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);
    expect(result.html).toMatch(/\.item-section\s*\{[^}]*overflow-x:\s*auto/);
    expect(result.html).toMatch(/\.frame-section\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("scopes a <style> tag embedded in an html-type payload to its own item, instead of stripping it or leaking it document-wide (B20 real root cause)", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsD2",
        filename: "leaky-style.json",
        record: {
          frames: [
            {
              type: "html",
              payload:
                "<style>body { max-width: 900px; margin: 0 auto; } td { background: #eaf6ff; }</style><table><tr><td>hi</td></tr></table>",
            },
          ],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);
    // The payload's own formatting (td background) is preserved, not discarded...
    expect(result.html).toContain("td { background: #eaf6ff; }");
    // ...but wrapped in @scope to the item's own container, so its `body {}`
    // rule can never match the real <body> (there's no <body> descendant of
    // #item-1) and can't override the export's layout.
    expect(result.html).toMatch(/<style>@scope \(#item-1\) \{[\s\S]*body \{ max-width: 900px/);
  });
});

describe("generateExportHtml — table border alignment (B21)", () => {
  it("collapses table borders so a table's outer border can't sit offset from its rows' cell borders", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsE",
        filename: "table.json",
        record: {
          frames: [{ type: "html", payload: "<table><tr><td>a</td></tr></table>" }],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);
    expect(result.html).toMatch(/table\s*\{[^}]*border-collapse:\s*collapse/);
  });
});

describe("scopeCss — generalized @scope-wrap helper (v0.31 Sprint 69)", () => {
  it("wraps a CSS string in @scope for a single anchor", () => {
    const result = scopeCss("body { color: red; }", ["item-1"]);
    expect(result).toBe("@scope (#item-1) {\nbody { color: red; }\n}");
  });

  it("wraps a CSS string in @scope for a comma-separated multi-anchor list", () => {
    const result = scopeCss("body { color: red; }", ["item-1", "item-2", "frame-3"]);
    expect(result).toBe("@scope (#item-1, #item-2, #frame-3) {\nbody { color: red; }\n}");
  });
});

describe("generateExportHtml — Bootstrap house style (v0.31 Sprint 70)", () => {
  const BOOTSTRAP_SIGNATURE = ".alert{--bs-alert-bg";

  it("includes the Bootstrap stylesheet when the export has >=1 html-type item", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsH",
        filename: "html.json",
        record: {
          frames: [{ type: "html", payload: '<div class="alert alert-info">hi</div>' }],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);
    expect(result.html).toContain(BOOTSTRAP_SIGNATURE);
  });

  it("rewrites :root to :scope so Bootstrap's CSS-variable color system actually resolves inside @scope (found via manual verification)", async () => {
    // @scope only matches elements within the scope root's own subtree —
    // :root (the <html> element) is an ancestor of the scope root, never a
    // descendant, so a bare `:root { --bs-blue: ... }` rule inside
    // `@scope (#anchor) { ... }` never matches and every color/background
    // that depends on those custom properties silently falls back to its
    // initial value (transparent/black), while non-variable properties
    // (padding, etc.) keep working with no error at all. Confirmed live in
    // a real browser: without this rewrite .alert-info rendered with
    // transparent background and black text instead of Bootstrap's blue.
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsH2",
        filename: "html.json",
        record: {
          frames: [{ type: "html", payload: '<div class="alert alert-info">hi</div>' }],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);
    const scopeMatch = result.html.match(/@scope \(([^)]*)\) \{\n@charset[\s\S]*?\n\}<\/style>/);
    expect(scopeMatch).not.toBeNull();
    const bootstrapBlock = scopeMatch![0];
    expect(bootstrapBlock).toContain(':scope,[data-bs-theme=light]{');
    expect(bootstrapBlock).not.toContain(":root");
  });

  it("ships no Bootstrap CSS for an all-Mermaid export", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsI",
        filename: "mermaid.json",
        record: {
          frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);
    expect(result.html).not.toContain(BOOTSTRAP_SIGNATURE);
  });

  it("scopes the Bootstrap stylesheet to every html-type item anchor across a multi-item, multi-workspace export, excluding non-html anchors", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsA",
        filename: "a-html.json",
        record: {
          frames: [{ type: "html", payload: '<div class="card">a</div>' }],
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      },
      {
        workspace: "wsA",
        filename: "a-mermaid.json",
        record: {
          frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
          timestamp: "2026-01-01T00:01:00.000Z",
        },
      },
      {
        workspace: "wsB",
        filename: "b-html.json",
        record: {
          frames: [{ type: "html", payload: '<div class="badge">b</div>' }],
          timestamp: "2026-01-01T00:02:00.000Z",
        },
      },
    ];

    const result = await generateExportHtml(items);
    const match = result.html.match(/@scope \(([^)]*)\) \{\n@charset/);
    expect(match).not.toBeNull();
    const selectorList = match![1];
    expect(selectorList).toBe("#item-1, #item-3");
  });

  it("does not let Bootstrap's bare-element rules leak into the export's own nav/heading chrome", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsJ",
        filename: "html.json",
        record: {
          title: "Bootstrap demo",
          frames: [{ type: "html", payload: '<table class="table"><tr><td>x</td></tr></table>' }],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);
    // The Bootstrap block is wrapped in @scope to #item-1 only — the export's
    // own <nav>/<h2>/<h3> chrome sits outside that scope root entirely.
    const scopeMatch = result.html.match(/@scope \(([^)]*)\) \{\n@charset/);
    expect(scopeMatch![1]).toBe("#item-1");
  });
});

describe("generateExportHtml — per-frame nav submenu for step-frames items (B22)", () => {
  it("gives a step-frames item one nav submenu entry per frame, with the parent link pointing at frame 0", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsF",
        filename: "steps.json",
        record: {
          title: "Chapter 2 — Sorting",
          frames: [
            { type: "mermaid", payload: "graph TD; A-->B", label: "Overview" },
            { type: "mermaid", payload: "graph TD; B-->C" },
            { type: "mermaid", payload: "graph TD; C-->D", label: "Wrap-up" },
          ],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);

    // Parent TOC entry points at frame 0's anchor, not the item's own section id.
    expect(result.html).toMatch(/<li><a href="#item-1-frame-0">Chapter 2 — Sorting<\/a><ul class="toc-frames">/);
    // One submenu entry per frame, using each frame's own label (falling back to "Frame N").
    expect(result.html).toContain('<li><a href="#item-1-frame-0">Overview</a></li>');
    expect(result.html).toContain('<li><a href="#item-1-frame-1">Frame 2</a></li>');
    expect(result.html).toContain('<li><a href="#item-1-frame-2">Wrap-up</a></li>');
    // <main>'s existing per-frame sub-sections are unaffected — anchors line up with them.
    expect(result.html).toContain('<section class="frame-section" id="item-1-frame-0">');
  });

  it("still emits a single, non-nested TOC link for a plain (non-step-frames) item", async () => {
    const items: ValidatedExportItem[] = [
      {
        workspace: "wsG",
        filename: "plain.json",
        record: {
          title: "Single diagram",
          frames: [{ type: "mermaid", payload: "graph TD; A-->B" }],
          timestamp: new Date().toISOString(),
        },
      },
    ];

    const result = await generateExportHtml(items);
    expect(result.html).toContain('<li><a href="#item-1">Single diagram</a></li>');
    expect(result.html).not.toContain('<ul class="toc-frames">');
  });
});
