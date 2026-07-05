// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import VegaLite from "../../../client/src/renderers/VegaLite.svelte";

const finalize = vi.fn();

vi.mock("vega-embed", () => ({
  default: vi.fn(async (container: HTMLElement) => {
    container.innerHTML = "<svg data-testid=\"vega-svg\"></svg>";
    return { view: { finalize } };
  }),
}));

describe("VegaLite.svelte", () => {
  afterEach(() => cleanup());

  it("renders the given vega-lite spec via vega-embed", async () => {
    const spec = JSON.stringify({ mark: "bar", data: { values: [] } });
    const { findByTestId } = render(VegaLite, { props: { source: spec } });
    expect(await findByTestId("vega-svg")).toBeTruthy();
  });

  it("shows an error message instead of crashing on invalid JSON", async () => {
    const { findByText } = render(VegaLite, { props: { source: "not json" } });
    expect(await findByText(/Unexpected token|not valid JSON/i)).toBeTruthy();
  });
});
