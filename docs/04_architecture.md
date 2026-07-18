# 04 — Architecture (v0.32)

> **v0.31 complete** — full v0.31 architecture in
> [`docs/v0.31/04_architecture.md`](v0.31/04_architecture.md).

---

## 1. Export Delivery Model — CDN Default & Filesystem Boundary (F21–F23 in `03`, O1–O3 in `02`)

Supersedes the v0.31 architecture's "Client-side rendering (export, Mermaid only): Embedded `mermaid.js` bundle inline" decision (`docs/v0.31/04_architecture.md`, same table row) for the **default** export path. That row's reasoning (real browser text-layout needed for Mermaid; `happy-dom` can't provide it — see `L1` in `02`, archived) still holds and is unaffected — this change is about *where the library comes from* (CDN vs. embedded source), not *where it renders* (still client-side, in whatever browser opens the export).

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default dependency loading | CDN-linked (`<script src>` / `<link href>` pointing at jsdelivr) for Mermaid, Bootstrap, KaTeX | Removes the ~3.3MB (Mermaid) + ~232KB (Bootstrap) + KaTeX CSS payload from the default export, which is what made returning export content inline (rather than writing to disk) previously infeasible for the MCP surface (see `L6` in `02` v0.31 archive). Trades the "offline reading" default (accepted risk, `O2` in `02`) for closing the MCP filesystem-write vector below. |
| CDN reference format | Pinned exact version + Subresource Integrity (SRI) hash on every `<script>`/`<link>` tag, sourced from jsdelivr (current pinned versions: `mermaid@11.15.0`, `bootstrap@5.3.8`, `katex@0.17.0`, matching `package.json`) | Chosen over unpinned (`@latest`) or pinned-without-SRI. SRI means the browser refuses to execute the asset if the CDN ever serves different bytes than expected (compromised/tampered CDN, mismatched cache) — closes the integrity gap that a bare CDN link would otherwise introduce, consistent with this feature's overall security motivation. Cost: the SRI hash must be regenerated whenever `mermaid`/`bootstrap`/`katex` are version-bumped in `package.json` — this becomes a required step in the dependency-upgrade process, not automatic. |
| Offline mode (opt-in) | Keeps today's v0.31 behavior verbatim: dependencies read from `node_modules` (`mermaid/dist/mermaid.min.js`, `bootstrap/dist/css/bootstrap.min.css`, `katex/dist/katex.min.css`) and inlined as `<script>`/`<style>` blocks | No change to the existing embedding mechanism (`getMermaidBundle()`, `getBootstrapCss()`, equivalent KaTeX path in `server/export-html.ts`) — only reachable via REST/webview, never via MCP (see interface split below). |
| MCP `export_html` tool contract | Drops the `output_path` param and all filesystem-write capability. Signature becomes `export_html(workspace, ids)` — no mode/offline option. Returns the assembled (CDN-mode) HTML as string content in the tool response, not a file path. | The `output_path` param (`L6` in `02` v0.31 archive) let the calling agent choose an arbitrary write location — a way to bypass an agent-level guardrail like "write only within project folders," since the guardrail can't see into the MCP tool's own filesystem access (`O1` in `02`). Removing the parameter closes this structurally: there is nothing left to restrict. This is viable now only because CDN-mode output is small enough to return inline without exhausting the agent's context (the original reason `L6` chose to write to disk no longer applies to this mode). |
| REST `POST /export-html` contract | Adds a `mode` field (`"cdn"` \| `"offline"`, default `"cdn"`) to the existing JSON request body — same shape as the existing `{ items: [...] }` body, no new endpoint | Consistent with the existing POST-with-JSON-body convention (`03` §3, v0.31 archive) rather than a query param, since the endpoint already takes a body. No change to response mechanics: still streams `Content-Type: text/html`, `Content-Disposition: attachment` with no server-side write, for either mode. |

### Interface split (summary)

| Interface | Modes available | Delivery |
|-----------|------------------|----------|
| MCP `export_html` | CDN only | Inline string in tool response — no filesystem access at all |
| REST `POST /export-html` (webview/curl) | CDN (default) or offline | Streamed HTTP response (`Content-Disposition: attachment`) — no server-side write, unchanged from v0.31 |

No new architecture component is introduced (no new server process, no new storage) — this is a contract change on an existing endpoint/tool pair plus a change in *what* gets embedded vs. linked.
