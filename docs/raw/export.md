# Export to self-contained HTML — Requirements

## Scope

Web view only. No MCP tool. The feature is triggered exclusively from the browser UI (HistoryPanel select mode).

---

## Trigger

The "Export selected" button appears in the HistoryPanel select-bar, alongside the existing "Delete selected" button. It is visible only when at least one item is selected.

Clicking it:
1. POSTs the selected `{ workspace, filename }` pairs to `POST /export-html`
2. Receives an HTML file as the response body
3. Triggers a browser download via a temporary `<a download>` element

---

## Endpoint

`POST /export-html`

**Request body:**
```json
{ "items": [{ "workspace": "my-course", "filename": "20260630_143000_screen.json" }] }
```

**Validation:** same workspace-name and filename safety checks as `POST /snapshots/load`.  
Unreadable or malformed snapshot files among the requested items are silently skipped (not an error).  
If no valid items remain after skipping, the server returns `{ ok: false, error: "no valid items to export" }` (400).

**Response on success:**
- `Content-Type: text/html; charset=utf-8`
- `Content-Disposition: attachment; filename="<workspace>-YYYYMMDD-HHmmss.html"`

---

## Download filename

Pattern: `<workspace>-YYYYMMDD-HHmmss.html`

- Timestamp: server-side at time of request (local server time, same format as snapshot filenames).
- Workspace segment:
  - If all selected items belong to the **same workspace** → use that workspace name, truncated to 24 characters, with whitespace replaced by `-`.
  - If selected items span **multiple workspaces** → use the literal string `export`.
- Characters in the workspace name that are not alphanumeric, `-`, `_`, or `.` are replaced with `-` before truncation.

Examples:
- Single workspace `"my-course"` → `my-course-20260630_143000.html`
- Single workspace `"Advanced Algorithms and Data Structures"` → `Advanced-Algorithms-and-D-20260630_143000.html`
- Multiple workspaces → `export-20260630_143000.html`

---

## Output: self-contained HTML

The file must open correctly offline with no external network requests. All CSS is inline; no external JS or CSS references.

### Document structure

```
<html>
  <head>
    <meta charset="UTF-8">
    <title>{workspace} — {date}</title>   (or "Export — {date}" for multi-workspace)
    <style>
      <!-- layout CSS -->
      <!-- KaTeX CSS, inline — only present if the export contains ≥1 katex items -->
    </style>
  </head>
  <body>
    <nav>                          <!-- table of contents -->
      <h2>Contents</h2>
      <ul>
        <li><a href="#ws-{name}">{workspace}</a>
          <ul>
            <li><a href="#item-{id}">{title or timestamp}</a></li>
            …
          </ul>
        </li>
        …
      </ul>
    </nav>

    <main>
      <section id="ws-{name}">          <!-- h1: workspace name -->

        <section id="item-{id}">        <!-- h2: item title (fallback: ISO timestamp) -->
          <p class="meta">
            <span class="badge">{type}</span>
            {formatted timestamp}
          </p>
          <!-- rendered content (non-step-frames) -->

          <!-- step-frames only: -->
          <section class="frame" id="item-{id}-frame-{n}">  <!-- h3: frame label or "Frame N" -->
            <!-- rendered content for this frame -->
          </section>
          …
        </section>

      </section>
    </main>
  </body>
</html>
```

### Ordering

- Items within each workspace: **chronological, oldest first** (ascending by `timestamp` field).
- Workspaces: ordered by their **earliest item's timestamp** (ascending).
- TOC reflects the same order.

---

## Content rendering (server-side)

All rendering happens on the server before the HTML is assembled. The output file contains only static markup — no client-side rendering scripts.

| Snapshot type | Rendering strategy | Output |
|---|---|---|
| `mermaid` | `happy-dom` globals → `mermaid.render()` | SVG string, inlined directly |
| `katex` | `katex.renderToString(source, { displayMode: true, throwOnError: false })` | HTML string |
| `vega-lite` | `vl.compile(spec).spec` → `vega.parse()` → `new vega.View().toSVG()` | SVG string, inlined directly |
| `svg` | DOMPurify (with `happy-dom` Window, `USE_PROFILES: { svg: true }`) | sanitized SVG markup |
| `html` | DOMPurify (with `happy-dom` Window, `USE_PROFILES: { html: true }`) | sanitized HTML markup |
| `step-frames` | expand frames → render each frame by its `frame_type` (recursive, same table above) | sub-sections |

If rendering a single item fails (e.g. mermaid render throws), that item's content area shows an inline error message instead of aborting the entire export.

---

## New dependency

`happy-dom` — used server-side as:
- DOM host for `mermaid.render()` (requires `document`, `window`, SVG DOM APIs)
- DOM host for `DOMPurify` when sanitizing `svg` and `html` payloads

One `happy-dom` `Window` instance is created per export call and torn down after all items are rendered.

---

## Files to create / modify

| Path | Change |
|---|---|
| `server/export-html.ts` | new — rendering logic + HTML assembly |
| `server/app.ts` | add `POST /export-html` endpoint |
| `client/src/HistoryPanel.svelte` | "Export selected" button in select-bar |
| `package.json` | add `happy-dom` dependency |
| `docs/04_architecture.md` | document `POST /export-html` endpoint |
