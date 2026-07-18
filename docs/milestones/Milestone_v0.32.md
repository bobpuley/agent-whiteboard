# Milestone v0.32 — Export Delivery Model: CDN Default & Filesystem Boundary (Sprint 73)

**Status:** pending

### Sprint 73 — CDN-default export + MCP filesystem-boundary fix
- [ ] Add a CDN-mode HTML assembly path in `server/export-html.ts`: emit `<script src>`/`<link href>` tags for Mermaid, Bootstrap, KaTeX pointing at jsdelivr, pinned to the exact versions in `package.json` (currently `mermaid@11.15.0`, `bootstrap@5.3.8`, `katex@0.17.0`), each with a computed SRI hash.
- [ ] Add a `mode: "cdn" | "offline"` parameter threaded through `generateExportHtml()`/`assembleHtml()`; `cdn` is the default and uses the new CDN path; `offline` reproduces today's fully-embedded output (no behavior change to that path).
- [ ] Remove the `output_path` parameter — and all filesystem-write code — from the MCP `export_html` tool definition (`server/mcp.ts`). New signature: `export_html(workspace, ids)`. The tool always runs in `cdn` mode and returns the assembled HTML as inline string content in the tool response.
- [ ] Add a `mode` field to the REST `POST /export-html` JSON body (default `"cdn"`, optional `"offline"`); wire to the corresponding assembly path. No change to response streaming (`Content-Type: text/html`, `Content-Disposition: attachment`, no server-side write) for either mode.
- [ ] Document the SRI-hash regeneration step as part of the dependency-upgrade process (whenever `mermaid`/`bootstrap`/`katex` are version-bumped).
- [ ] Update/add tests: both export modes produce correct output; MCP tool schema no longer exposes any path/output_path/mode-selection parameter; REST endpoint defaults to `cdn` when `mode` is omitted and honors `offline` when requested.

> **Implementation note:** this does not change *where* Mermaid renders (still client-side in the browser that opens the export — `happy-dom` still cannot do real text-layout, see `02` L1 in the `v0.31` archive). It only changes where the library source comes from (CDN vs. embedded) and removes the MCP tool's ability to write to an arbitrary filesystem path.

---

## Definition of Done — v0.32
- MCP `export_html` tool schema has no path/`output_path`/mode parameter of any kind; it always returns CDN-mode HTML inline in the tool response, never writes to disk.
- REST `POST /export-html` accepts `mode: "cdn" | "offline"`, defaults to `cdn` when omitted, and continues to stream the response with no server-side write in either mode.
- CDN-mode HTML includes pinned-version, SRI-hashed `<script>`/`<link>` tags for Mermaid, Bootstrap, and KaTeX.
- Offline-mode HTML is unchanged (byte-for-byte equivalent) from the pre-v0.32 embedded export output.
- All existing export tests pass; new tests cover both modes and assert the MCP tool schema no longer accepts a filesystem path.
