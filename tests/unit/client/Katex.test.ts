// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";

// KaTeX checks `document.compatMode` at module-evaluation time and disables
// rendering (throws unconditionally) if it isn't "CSS1Compat" — happy-dom
// doesn't implement compatMode at all, so it must be patched in before the
// katex module is first evaluated. A dynamic import (rather than the usual
// static import) is required since static imports are hoisted ahead of this
// assignment.
(document as unknown as { compatMode: string }).compatMode = "CSS1Compat";

let Katex: typeof import("../../../client/src/renderers/Katex.svelte").default;

describe("Katex.svelte", () => {
  beforeAll(async () => {
    ({ default: Katex } = await import("../../../client/src/renderers/Katex.svelte"));
  });

  afterEach(() => cleanup());

  it("renders the given source as KaTeX markup", () => {
    const { container } = render(Katex, { props: { source: "x^2 + y^2 = z^2" } });
    expect(container.querySelector(".katex")).toBeTruthy();
  });

  it("shows an error message for invalid LaTeX instead of throwing", () => {
    const { getByText } = render(Katex, { props: { source: "\\notarealcommand{" } });
    expect(getByText(/notarealcommand/)).toBeTruthy();
  });
});
