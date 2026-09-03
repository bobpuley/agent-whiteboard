// NF41 (v1.2) — scopeCss() is hand-duplicated between client/src/lib/scopeCss.ts
// and server/export-html.ts with no shared-module convention in this codebase
// (see the "Keep the two in sync by hand" comment on the client copy). This
// test is a regression net, not a dedup: it fails CI the moment either copy
// drifts from the other, instead of the drift only surfacing as a silent
// live-canvas-vs-exported-HTML styling mismatch (see docs/02_assumptions-and-risks.md,
// v1.2 section). Lives under tests/unit/server/ purely because that's the
// suite vitest.config.ts runs under the plain-node environment — the client
// copy has no DOM dependency, so importing it here doesn't need happy-dom.
import { describe, expect, it } from "vitest";
import { scopeCss as clientScopeCss } from "../../../client/src/lib/scopeCss.js";
import { scopeCss as serverScopeCss } from "../../../server/export-html.js";

const FIXTURES: Array<{ name: string; css: string; anchorIds: string[] }> = [
  { name: "empty css, single anchor", css: "", anchorIds: ["html-renderer-root"] },
  { name: "single rule, single anchor", css: "body { max-width: 900px; }", anchorIds: ["html-renderer-root"] },
  {
    name: "multiple rules, single anchor",
    css: "table { border-collapse: collapse; }\ncode { font-family: monospace; }",
    anchorIds: ["html-renderer-root"],
  },
  {
    name: "multiple anchors",
    css: ":root { --x: 1; }",
    anchorIds: ["html-renderer-root", "bootstrap-house-style"],
  },
  { name: "no anchors", css: "p { margin: 0; }", anchorIds: [] },
];

describe("scopeCss client/server parity (NF41)", () => {
  for (const { name, css, anchorIds } of FIXTURES) {
    it(`produces identical output for: ${name}`, () => {
      expect(clientScopeCss(css, anchorIds)).toBe(serverScopeCss(css, anchorIds));
    });
  }
});
