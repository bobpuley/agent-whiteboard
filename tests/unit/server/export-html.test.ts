import { describe, expect, it } from "vitest";
import { generateExportHtml } from "../../../server/export-html.js";
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
