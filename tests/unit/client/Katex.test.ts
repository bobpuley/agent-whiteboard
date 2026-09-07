// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/svelte";

// KaTeX checks `document.compatMode` at module-evaluation time and disables
// rendering (throws unconditionally) if it isn't "CSS1Compat" — vitest's
// jsdom environment already reports "CSS1Compat" by default, unlike the
// previous happy-dom environment which didn't implement compatMode at all
// (and required patching it in before katex's first evaluation). A dynamic
// import (rather than the usual static import) is kept regardless, since
// katex's module-load-time check makes import order load-bearing.
let Katex: typeof import("../../../client/src/renderers/Katex.svelte").default;

describe("Katex.svelte", () => {
  beforeAll(async () => {
    ({ default: Katex } = await import("../../../client/src/renderers/Katex.svelte"));
  });

  afterEach(() => cleanup());

  it("renders the given source as KaTeX markup", async () => {
    const { container } = render(Katex, { props: { source: "x^2 + y^2 = z^2" } });
    await waitFor(() => expect(container.querySelector(".katex")).toBeTruthy());
  });

  it("shows an error message for invalid LaTeX instead of throwing", async () => {
    const { getByText } = render(Katex, { props: { source: "\\notarealcommand{" } });
    await waitFor(() => expect(getByText(/notarealcommand/)).toBeTruthy());
  });
});
