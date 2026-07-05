// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import Html from "../../../client/src/renderers/Html.svelte";

describe("Html.svelte", () => {
  afterEach(() => cleanup());

  it("renders sanitized html/svg source into the DOM", () => {
    const { container } = render(Html, { props: { source: "<p>hello</p>", type: "html" } });
    expect(container.querySelector("p")?.textContent).toBe("hello");
  });

  it("strips a <script> payload (F6 — DOMPurify sanitization)", () => {
    const { container } = render(Html, {
      props: { source: '<p>safe</p><script>window.pwned = true</script>', type: "html" },
    });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("safe");
  });

  it("strips a dangerous onerror attribute from svg payloads", () => {
    const { container } = render(Html, {
      props: { source: '<svg><circle onerror="window.pwned = true" r="5"/></svg>', type: "svg" },
    });
    expect(container.querySelector("circle")?.hasAttribute("onerror")).toBe(false);
  });
});
