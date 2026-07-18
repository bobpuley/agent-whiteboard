# 02 — Assumptions & Risks (v0.32)

> **All prior versions complete** — full bet/risk history in their respective archives.
> **v0.31 complete** — all v0.31 bets held; risks resolved or managed.
> Archived: [`docs/v0.31/02_assumptions-and-risks.md`](v0.31/02_assumptions-and-risks.md).

---

## O. Export Delivery Model — CDN Default & Filesystem Boundary

**O1 — Supersedes L6 (`v0.31` archive): MCP `output_path` is no longer assumed safe**
> ❌ INVALIDATED: L6's rationale for leaving `output_path` unrestricted was "the calling agent already has unrestricted filesystem write access via its own Bash/Write tools, so restricting this param closes no real attack surface." That assumption breaks under an agent guardrail such as "agent may only write within project folders" — in that world, the MCP tool's own unrestricted `output_path` becomes a way to bypass a restriction the agent is otherwise bound by, on a surface the guardrail can't see into.
> ✅ DECISION (2026-07-18): remove `output_path` — and all filesystem-write capability — from the MCP `export_html` tool entirely. Fix is structural (no path parameter exists to misuse) rather than policy-based (trusting the caller not to misuse it).

**O2 — CDN-by-default reopens the "offline reading" requirement**
> ⚠️ ASSUMPTION: making CDN the default dependency-loading mode for export means a default export is *not* usable offline — a deliberate reversal of the embedded-by-default posture recorded in `L1`/`L6` (`v0.31` archive), accepted as a trade-off for removing the size/path pressure that motivated the MCP surface writing to disk in the first place.
> Risk: CDN unavailability (network down, CDN outage, firewall blocking known CDN domains) breaks default export rendering (Mermaid diagrams, Bootstrap styling) with no local fallback. Mitigated only via the opt-in `offline` mode (REST/webview only — see O3).

**O3 — Interface split: MCP vs REST/webview capabilities diverge by design**
> ✅ DECISION: MCP `export_html` — CDN mode only, returns HTML inline in the tool response instead of writing to disk (feasible now that CDN-mode output is a few KB of markup, not the ~3.3MB embedded bundle from `L1`). REST/webview `POST /export-html` — supports both `cdn` (default) and `offline` (fully embedded, today's behavior) modes, continues to stream the response as an HTTP attachment download with no server-side write (existing behavior, confirmed unaffected by this change).
> Open question carried to `03`/`04`: exact request contract for selecting `offline` mode on REST (query param vs body field) — implementation-level, deferred to architecture/dev-plan.
