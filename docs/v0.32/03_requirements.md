# 03 — Requirements (v0.32)

> **v0.31 complete** — all v0.31 requirements implemented; ACs green.
> Archived: [`docs/v0.31/03_requirements.md`](v0.31/03_requirements.md).

---

## 1. Export Delivery Model — CDN Default & Filesystem Boundary (FR26 in `01`, O1–O3 in `02`)

| ID  | Requirement | Priority |
|-----|-------------|----------|
| F21 | HTML export defaults to **CDN-linked** dependencies (Mermaid, Bootstrap, KaTeX) instead of embedding them. An explicit **offline mode** (opt-in) restores today's fully-embedded behavior for offline reading. | v0.32 |
| F22 | The MCP `export_html` tool drops the `output_path` param and all filesystem-write capability. It only supports CDN mode and returns the assembled HTML **inline** in the tool response (no disk write, no path of any kind — see O1). Offline mode is **not reachable via MCP**. | v0.32 |
| F23 | The REST/webview `POST /export-html` endpoint supports both `cdn` (default) and `offline` modes, selected by the caller. It continues to stream the assembled HTML as the HTTP response body (`Content-Disposition: attachment`) with no server-side write, regardless of mode — existing streaming behavior is unaffected (see O3). | v0.32 |

**Acceptance criteria (draft, to refine in `04`/milestone task):**
- Calling MCP `export_html` never accepts or exposes a path/directory argument in its tool schema.
- MCP `export_html` response contains CDN `<script src>`/`<link href>` references, not embedded library source.
- REST `POST /export-html` with no mode specified (or `mode=cdn`) returns CDN-linked HTML; `mode=offline` returns fully embedded HTML byte-for-byte equivalent to current (pre-v0.32) export output.
- No code path writes export HTML to a server-side directory chosen by the caller.

> Open item carried from `02` O3: exact request contract for `mode=offline` on REST (query param vs body field) — to be settled in `04_architecture.md`.
