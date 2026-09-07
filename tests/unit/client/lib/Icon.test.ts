// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import Icon from "../../../../client/src/lib/Icon.svelte";
import { ICONS } from "../../../../client/src/lib/icons.js";

describe("Icon.svelte (NF43)", () => {
  afterEach(() => cleanup());

  it("renders the shared stroke-icon attributes with the default size/stroke-width", () => {
    const { container } = render(Icon, { props: { name: "sun" } });
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("width")).toBe("15");
    expect(svg.getAttribute("height")).toBe("15");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("fill")).toBe("none");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-width")).toBe("2.2");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("overrides size and strokeWidth via props (matches App.svelte's done-btn checkmark)", () => {
    const { container } = render(Icon, { props: { name: "check", size: 16, strokeWidth: 2.5 } });
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
    expect(svg.getAttribute("stroke-width")).toBe("2.5");
  });

  it.each(Object.keys(ICONS) as Array<keyof typeof ICONS>)("renders every shape for %s unchanged", (name) => {
    const { container } = render(Icon, { props: { name } });
    const svg = container.querySelector("svg")!;
    const rendered = Array.from(svg.children).map((el) => {
      const attrs = Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]));
      return { tag: el.tagName.toLowerCase(), ...attrs };
    });

    const expected = ICONS[name].map((shape) => {
      if (shape.tag === "circle") return { tag: "circle", cx: String(shape.cx), cy: String(shape.cy), r: String(shape.r) };
      if (shape.tag === "line")
        return { tag: "line", x1: String(shape.x1), y1: String(shape.y1), x2: String(shape.x2), y2: String(shape.y2) };
      if (shape.tag === "path") return { tag: "path", d: shape.d };
      return { tag: "polyline", points: shape.points };
    });

    expect(rendered).toEqual(expected);
  });
});
