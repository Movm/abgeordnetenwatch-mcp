# CLAUDE.md — Abgeordnetenwatch MCP

Standalone MCP server (Node.js ESM) over the open Abgeordnetenwatch API v2 (CC0).
German MP transparency data. **Germany only** (Bundestag + Landtage).

## Layout
- `src/index.js` — Express + StreamableHTTP MCP server (stateless + stateful sessions), `/health`, `/info`.
- `src/config.js` — env-driven config (no secrets; public API).
- `src/api/abgeordnetenwatch.js` — the API client: low-level request/list/entity, transparency methods, structure list helpers, generic `query()`. All reads filtered + bounded.
- `src/tools/` — MCP tool objects `{ name, description, inputSchema (zod), handler }`, grouped (`transparency.js`, `polls.js`, `structure.js`) and merged in `index.js`. Add a tool → export it from its group array; registration and `/info` pick it up automatically.
- `src/resources/info.js` — `SERVER_INSTRUCTIONS` (injected into the client system prompt) + the `aw://system-prompt` resource. Update the "Which tool" table when adding a tool.
- `src/utils/` — cache / rateLimiter / retry / logger (copied from the Bundestag Wrapped MCP; keep generic).
- `tests/` — vitest.

## Conventions
- **Every API read is filtered + bounded** (`range_end`, capped at `config.api.maxRangeEnd`). No unbounded list pulls.
- **Trim before returning.** Handlers return compact DTOs, never raw nested API rows (except `aw_query`, which shallow-compacts).
- **Guardrails live in tool descriptions + `SERVER_INSTRUCTIONS`:** cite the source, income as level 1–10 (never invent a euro sum), report neutrally, names are fuzzy → surface alternatives.
- **Gotcha:** the `polls` endpoint 500s on `sort_by=id`; use `sort_by=field_poll_date`.
- Zod v4. Handlers never throw — wrap in `safe(name, fn)` (`tools/schemas.js`) so errors become structured results.

## Related
Client logic mirrors the `abgeordnetenwatch_*` tools embedded in `Movm/Bundestag_Wrapped` (`services/mcp`). DIP ↔ Abgeordnetenwatch share no id — bridge by name.
