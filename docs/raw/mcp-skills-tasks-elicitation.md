# MCP novelties: skills over MCP, Tasks, Elicitation — applicability to Agent Whiteboard

> Raw input, not yet integrated into docs 01–05. Source: https://claude.com/it/resources/articles/skills-over-mcp-tasks-and-more (article dated 2026-11-24, "MCP servers can now ship skills, run tasks, and more with Claude"). The article is a product announcement: no wire-level details (method names, schemas, capability negotiation). Specs must be read before any implementation.

## 1. Information gathered

### Skills over MCP (public beta)
- MCP servers can ship skills alongside their tools. Tool names/descriptions say *what* a server can do; skills say *how* (best practices, workflows, playbooks).
- Skills are loaded on demand (low context use) and update together with the server — nothing separate to install.
- A server provides three layers: skills (domain knowledge), tools (actions), resources (context).
- Availability: Claude and Claude Code. On by default for Pro/Max/Ultra; Team needs admin enablement; Enterprise "coming soon".
- Partners: Shopify, HubSpot, Atlassian, Carta (coming soon).
- Spec: modelcontextprotocol.io/extensions/skills/overview — Docs: code.claude.com/docs/it/mcp#use-skills-from-mcp-servers

### Tasks (GA)
- A server can run long operations or whole agent loops in the background; Claude keeps working and picks up the result when ready (previously a tool call had to finish first).
- GA for Pro/Max/Ultra; rolling out to Team/Enterprise.
- Spec: modelcontextprotocol.io/extensions/tasks/overview — Docs: code.claude.com/docs/it/mcp#mcp-tasks-for-server-authors

### Elicitation (GA)
- A server can pause mid-call and ask the user for input via form or link, then resume. Use cases: confirm spend, confirm destructive actions, typed confirmation (e.g. GitHub repo deletion).
- Same availability as Tasks.
- Spec: modelcontextprotocol.io/specification/2026-07-28/client/elicitation — Docs: code.claude.com/docs/it/mcp#respond-to-mcp-elicitation-requests

### File uploads (rolling out soon, not GA)
- Claude can pass files (PDF, spreadsheets, images) to MCP servers without going through the context window.
- Repo: github.com/modelcontextprotocol/experimental-ext-file-uploads

### Other
- Tool search: loads tool definitions on demand (>85% context reduction in multi-server setups).
- Latest MCP spec (2026-07-28) is stateless; supported across Claude products.
- Enterprise Managed Auth extension (admins authorize servers once).
- MCP Apps extension: full interfaces inside Claude (side panel or full screen). Docs: claude.com/docs/connectors/building/mcp-apps/quickstart
- Features are part of the open MCP spec/extensions, so compatible servers should work outside Claude too.

## 2. Considerations for this project

### Skills over MCP — highest impact
- Today: 5 skills in `skills/` (`agent-whiteboard`, `whiteboard-teaching`, `whiteboard-design`, `whiteboard-analysis`, `whiteboard-assessment`), installed via `npx agent-whiteboard install-skills` (F51–F54, NF58) + session restart.
- Serving them from the MCP server would remove the install step for compatible clients and keep skills version-aligned with the 15 tools (no drift between releases).
- Keep `install-skills` as fallback for clients without support (and for non-Claude agents, `--dir`).
- Candidate for a small change; affects README "Agent skills" section and requirements F51–F54.

### Tasks — valuable but delicate
- `wait_click`, `wait_done`, `wait_quiz` currently block the call until the user acts.
- With Tasks they could run in the background: the agent could pre-render the next steps while the user reads the current one; also avoids SSE/timeout issues on long waits.
- Changes tool semantics → needs a spike to verify how Claude Code handles background waits, and a decision on backward compatibility with clients lacking Tasks support.

### Elicitation — complementary, not a replacement
- Resembles the "pause until user is ready" pattern, but our value is the browser surface (diagram clicks, quizzes), which elicitation does not replace.
- Possible use: client-side confirmations for destructive operations (overwriting snapshots, import-zip).

### MCP Apps — speculative
- Could render the whiteboard inside Claude, without a separate browser tab. Conflicts with the north-star model (CLI control plane + browser render surface); future-version idea only.

### Not relevant now
- File uploads (not GA, no current need); tool search (benefits us passively with 15 tools).

## 3. Suggested priority
1. Serve skills via MCP (small, high value, reduces install friction).
2. Spike on Tasks for `wait_*` tools.
3. Elicitation for destructive-action confirmations (optional).
4. MCP Apps as a long-term idea.

## 4. Open points / caveats
- Everything is beta/GA depending on the plan; Team requires admin enablement, Enterprise not yet available → keep fallbacks.
- Specs must be read first (skills extension, tasks extension, elicitation) — the article gives no protocol details.
- Check compatibility with the current MCP-over-SSE transport and the stateless 2026-07-28 spec.
- Not yet decided: whether to intake into docs 01–05 (`/doc-creator-driver:intake`).
