# 01 — Input Ideas (v0.32)

> **v0.31 complete** — archived to `docs/v0.31/` on 2026-07-18. This file now seeds v0.32 planning.

---

**FR26 — Export Delivery Model: CDN Default & Filesystem Boundary (2026-07-18)**

- Feature idea (raised in conversation): rework HTML export's dependency-loading and output-delivery model — switch the default from fully embedded deps (Mermaid ~3.3MB, Bootstrap ~232KB, KaTeX CSS) to CDN-linked deps, with an opt-in `--offline` mode that keeps today's embedded behavior. Remove the MCP `export_html` tool's `output_path` param entirely — reason given: it lets the agent specify an arbitrary filesystem write location, which can bypass an agent guardrail such as "write only within project folders" (this contradicts the rationale recorded for that param in `02` L6, archived in `v0.31`). REST/webview export keeps both modes (`cdn` default, `offline` opt-in); it already streams the response as an HTTP download with no server-side write, so it needs no path param either.
- Milestone: **v0.32**.
