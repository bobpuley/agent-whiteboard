// Client-side counterpart of server/export-html.ts's scopeCss() (v0.31
// Sprint 69/71) — duplicated rather than shared, since client and server are
// separate builds with no shared-module convention in this codebase. Keep
// the two in sync by hand if either changes.
export function scopeCss(css: string, anchorIds: string[]): string {
  const selectorList = anchorIds.map((id) => `#${id}`).join(", ");
  return `@scope (${selectorList}) {\n${css}\n}`;
}
