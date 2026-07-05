# Abgeordnetenwatch MCP

A [Model Context Protocol](https://modelcontextprotocol.io/) server over the open
[Abgeordnetenwatch API](https://www.abgeordnetenwatch.de/api) (CC0). It gives an AI
assistant live, source-linked **transparency data on German MPs**: roll-call voting
behaviour, declared side-jobs / outside income, committee memberships, parties,
parliaments, and election programs.

**Germany only** — Bundestag *and* Landtage. No API key required.

## Tools (11)

### Transparency (per MP)
| Tool | Description |
|------|-------------|
| `aw_search_politicians` | Resolve a name → politician candidates (id, party, URL) |
| `aw_get_politician` | One politician's profile by id |
| `aw_voting_record` | Roll-call voting behaviour (name or id; `topic` pins exact votes) |
| `aw_sidejobs` | Declared side-jobs / outside income (levels 1–10) |
| `aw_committee_memberships` | Committees an MP sits on + role |
| `aw_politician_profile` | Combined: mandate + votes + side-jobs + committees |

### Votes
| Tool | Description |
|------|-------------|
| `aw_search_polls` | Find named votes (Abstimmungen) by keyword / topic id |
| `aw_poll_tally` | Aggregated result of a named vote, by faction |

### Structure & escape hatch
| Tool | Description |
|------|-------------|
| `aw_list_structure` | Browse parties / fractions / parliaments / periods / committees / constituencies / electoral-lists / topics / sidejob-organizations |
| `aw_election_programs` | Party election programs (Wahlprogramme) with source links |
| `aw_query` | Bounded generic read of any allow-listed v2 entity |

## Run

```bash
npm install
npm start          # http://localhost:3000/mcp   (health: /health, catalog: /info)
npm test           # vitest
npm run dev        # watch mode
```

Config is env-driven (all optional) — see `.env.example`. The public CC0 API needs
no key; the server enforces its own ~30 req/min limiter and caches responses ~10 min.

## Design notes

- Every read is **filtered and bounded** (`range_end`, capped at 100). The API has no
  aggregate endpoints; roll-call tallies are the one wide read (≤1000 votes, aggregated
  server-side into counts).
- **Income is a level 1–10**, never an exact euro sum (level 1 = up to 1.000 €,
  level 10 = over 250.000 €).
- The `polls` endpoint 500s on `sort_by=id` (unlike votes/mandates) — polls are sorted
  by `field_poll_date`.
- Client logic mirrors the Abgeordnetenwatch tools embedded in the
  [Bundestag Wrapped MCP](https://github.com/Movm/Bundestag_Wrapped); this repo is the
  standalone, full-surface server. DIP and Abgeordnetenwatch share no id — bridge by name.

## Licence

Code AGPL-3.0-only. Data © Abgeordnetenwatch / parliamentwatch.org, CC0 1.0.
