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
