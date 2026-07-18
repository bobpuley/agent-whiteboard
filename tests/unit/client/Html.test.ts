// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import Html from "../../../client/src/renderers/Html.svelte";

// Vitest's default CSS handling stubs out .css imports (real content isn't
// needed for most tests and slows the suite) — including ?inline ones, so
// the real bootstrap.min.css never reaches the test. Mock it with a
// minimal-but-representative fixture (a :root custom-property block, same
// as Bootstrap's actual structure) so the :root -> :scope rewrite in
// Html.svelte's loadBootstrapCss() has real content to operate on.
vi.mock("bootstrap/dist/css/bootstrap.min.css?inline", () => ({
  default: ':root,[data-bs-theme=light]{--bs-blue:#0d6efd}.alert{padding:1rem}',
}));

describe("Html.svelte", () => {
  afterEach(() => {
    cleanup();
    // ensureBootstrapInjected() writes directly to document.head (outside the
    // testing-library container), guarded so it never injects a second time —
    // remove it between tests so each test observes injection fresh.
    document.getElementById("bootstrap-house-style")?.remove();
  });

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

  it("lazy-loads and injects the Bootstrap stylesheet, scoped via @scope, for type: html (v0.31 Sprint 71)", async () => {
    render(Html, { props: { source: "<p>hi</p>", type: "html" } });
    // The dynamic import() of the real bootstrap.min.css asset resolves over
    // several microtask/module-graph ticks — a single setTimeout(0) is not
    // reliably enough under full-suite load; poll instead.
    await vi.waitFor(() => {
      expect(document.getElementById("bootstrap-house-style")).not.toBeNull();
    });
    const styleEl = document.getElementById("bootstrap-house-style");
    expect(styleEl?.textContent).toContain("@scope (#html-renderer-root)");
  });

  it("does not load the Bootstrap stylesheet for type: svg", async () => {
    render(Html, { props: { source: "<svg></svg>", type: "svg" } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.getElementById("bootstrap-house-style")).toBeNull();
  });

  it("rewrites :root to :scope so Bootstrap's CSS-variable color system actually resolves inside @scope (found via manual verification)", async () => {
    // @scope only matches elements within the scope root's own subtree —
    // :root is an ancestor of the scope root, never a descendant, so a bare
    // `:root { --bs-blue: ... }` rule never matches there and every color
    // depending on those custom properties silently falls back to its
    // initial value. Confirmed live in a real browser: without this
    // rewrite, .alert-info rendered with a transparent background and
    // black text instead of Bootstrap's blue.
    render(Html, { props: { source: "<p>hi</p>", type: "html" } });
    await vi.waitFor(() => {
      expect(document.getElementById("bootstrap-house-style")).not.toBeNull();
    });
    const css = document.getElementById("bootstrap-house-style")!.textContent!;
    expect(css).toContain(":scope,[data-bs-theme=light]{--bs-blue:#0d6efd}");
    expect(css).not.toContain(":root");
  });
});
