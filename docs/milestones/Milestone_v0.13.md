# Milestone v0.13 — HTML Export & Clear Workspace Removal (Sprint 26)

**Status:** planned

> Objective: (1) Remove the "Clear workspace" delete operation — it has the same high-level effect as "Workspace delete" and the empty-folder/empty-row distinction adds complexity without user value. (2) Add the ability to export selected history snapshots to a single self-contained HTML file that can be read offline with no external dependencies.

---

## Context

**Clear workspace removal (FR12 simplification):**
v0.12 shipped four delete operations. "Clear workspace" (delete files, keep folder, keep empty accordion row) and "Workspace delete" (delete folder and all contents, remove accordion row) are functionally equivalent from the user's perspective — both remove all snapshots from a workspace. The extra state (empty folder on disk, empty row in panel) is noise. This sprint removes the `POST /snapshots/clear-workspace` endpoint and the corresponding UI button.

**HTML export (FR14):**
The history panel already supports browsing, loading, and deleting snapshots. The next natural capability is exporting a selection to a durable, shareable file. The exported HTML is fully self-contained (no external network requests), renders all snapshot types as static content, and is organized with a table of contents for multi-snapshot exports. Server-side rendering is required for Mermaid (needs a DOM host via `happy-dom`) and for DOMPurify sanitization. KaTeX and Vega-Lite can run server-side without a DOM host.

---

## Requirements Addressed

- **FR12 simplification** → U7e update (three delete operations; Clear workspace removed), K2 update
- **FR14** → F17 (POST /export-html), U7g (Export selected button in select-bar), L1–L4 (export assumptions)

---

### Sprint 26 — HTML Export & Clear Workspace Removal

**Clear workspace removal:**

- [x] **T1 — `server/app.ts`:** Remove `POST /snapshots/clear-workspace` endpoint.
- [x] **T2 — `client/src/HistoryPanel.svelte`:** Remove "Clear workspace" button from selection mode. The workspace accordion header in selection mode retains only "Workspace delete" (with confirmation).
- [x] **T3 — `tests/unit/server/app.test.ts`:** Remove tests for `POST /snapshots/clear-workspace`.

**HTML export:**

- [x] **T4 — `package.json`:** Add `happy-dom` as a server-side dependency.
- [x] **T5 — `server/export-html.ts` (new file):** Implement server-side rendering pipeline and HTML assembly. Rendering strategies per snapshot type: Mermaid → SVG via `mermaid.render()` in a `happy-dom` Window; KaTeX → HTML via `katex.renderToString(source, { displayMode: true, throwOnError: false })`; Vega-Lite → SVG via `vl.compile(spec).spec` → `vega.parse()` → `new vega.View().toSVG()`; SVG payloads → DOMPurify (`USE_PROFILES: { svg: true }`); HTML payloads → DOMPurify (`USE_PROFILES: { html: true }`); step-frames → expand each frame → render each frame by `frame_type` (recursive). One `happy-dom` Window per export call, torn down after rendering. Per-item render failure: inline error message, export continues.
- [x] **T6 — `server/app.ts`:** Add `POST /export-html` endpoint. Validate workspace (safe-name check) and filename (no path traversal) per item. Skip unreadable or malformed snapshots silently. If no valid items remain: return `{ ok: false, error: "no valid items to export" }` (400). On success: stream the assembled HTML with `Content-Type: text/html; charset=utf-8` and `Content-Disposition: attachment; filename="<name>-YYYYMMDD-HHmmss.html"`.
- [x] **T7 — `client/src/HistoryPanel.svelte`:** Add a dedicated export/download icon button to the panel header, adjacent to the existing recycle bin ("Edit — enter selection/delete mode") button. Clicking it enters export mode (same checkbox-on-rows view as delete mode, tracked as `selectionMode: 'delete' | 'export' | null`). In export mode: select-bar shows "Export selected" (enabled when ≥1 items checked) and "Cancel"; each workspace accordion header shows "Export workspace" (collects all `{ workspace, filename }` pairs for that workspace and triggers export immediately, no checkbox selection required). Both actions POST to `/export-html` and trigger a browser download via a temporary `<a download>` element. Mode-switching: clicking the recycle bin while in export mode (or export icon while in delete mode) switches modes immediately. Update header layout to: `[title/spacer] [recycle-bin] [export] [lock/unlock] | [close]`.
- [x] **T8 — `tests/unit/server/app.test.ts`:** Tests for `POST /export-html`: valid single-workspace export, multi-workspace export (filename uses "export" prefix), malformed snapshot skipped, all items malformed returns 400, workspace safety check, filename safety check.

> **Implementation note (T5 — Mermaid server-side):** `mermaid.initialize({ startOnLoad: false })` must be called once before `mermaid.render()` to prevent auto-scan. Pass the `happy-dom` Window's `document` and `window` globals where required. Test with at least one `graph TD` diagram to confirm SVG output is complete.

---

## Definition of Done — v0.13

- `POST /snapshots/clear-workspace` endpoint removed from server; all server tests for it removed.
- "Clear workspace" button removed from HistoryPanel selection mode; only "Workspace delete" remains as a bulk workspace action.
- `POST /export-html` returns a valid self-contained HTML file for a single selected snapshot of each type (Mermaid, KaTeX, Vega-Lite, SVG, HTML, step-frames).
- Multi-workspace export: download filename uses the literal string `export` as the workspace segment.
- Single-workspace export: download filename uses the sanitized workspace name (truncated to 24 chars).
- Items with rendering errors show an inline error message in the output; the rest of the HTML is unaffected.
- "Export selected" button appears in HistoryPanel select-bar only when ≥1 item is checked.
- Clicking "Export selected" triggers a browser file download of the HTML.
- The downloaded HTML opens correctly offline (no external network requests).
- All existing tests pass.
