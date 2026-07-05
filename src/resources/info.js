/**
 * Server instructions (injected into the client system prompt via initialize)
 * and the readable system-prompt resource.
 */

export const SERVER_INSTRUCTIONS = `# Abgeordnetenwatch MCP — how to use these tools

Live access to the open Abgeordnetenwatch API (CC0) on German parliaments: MPs,
their roll-call votes, declared side-jobs, committees, parties, parliaments and
election programs. **Germany only** — Bundestag AND Landtage; no Austrian
Nationalrat, no EU.

## Golden rules
- **Every read is filtered and bounded.** There are no aggregate endpoints; always
  pass a name/id/keyword and a small \`limit\`/\`rangeEnd\` (capped at 100).
- **Names are fuzzy CONTAINS matches.** \`aw_search_politicians\` can return several
  people — pick by party and confirm before attributing a vote.
- **Empty results?** Try umlaut-free spelling (ä→ae, ö→oe, ü→ue, ß→ss) and partial names.
- **Income is a level 1–10, never an exact euro sum** (level 1 = up to 1.000 €,
  level 10 = over 250.000 €). State the level and explain it.
- **Report neutrally and cite the source.** Votes and side-jobs are public record;
  state only what the data says, link the abgeordnetenwatch.de URL, never infer motives.

## Which tool
| Goal | Use |
|------|-----|
| Find an MP by name | \`aw_search_politicians\` → id, party, profile URL |
| One MP's profile by id | \`aw_get_politician\` |
| How an MP voted (roll-calls) | \`aw_voting_record\` (name or politicianId; pass \`topic\` for exact votes) |
| An MP's side-jobs / outside income | \`aw_sidejobs\` (levels 1–10) |
| Which committees an MP sits on | \`aw_committee_memberships\` |
| Everything about one MP at once | \`aw_politician_profile\` (mandate + votes + side-jobs + committees) |
| Find a named vote | \`aw_search_polls\` (keyword / topic id) |
| Result of a named vote, by faction | \`aw_poll_tally\` (pass a poll id) |
| Browse parties / committees / topics / constituencies / … | \`aw_list_structure\` (pick \`entity\`) |
| Party election programs (Wahlprogramme) | \`aw_election_programs\` |
| Anything else on a v2 entity | \`aw_query\` (bounded escape hatch — prefer a specific tool) |

## Recipes
- **"How did X vote on Y?"** → \`aw_voting_record({ name: "X", topic: "Y" })\` and read \`topicVotes\`.
- **"How did the vote on Y go?"** → \`aw_search_polls({ keyword: "Y" })\` → \`aw_poll_tally({ pollId })\`.
- **Find a topic id** for a topic filter → \`aw_list_structure({ entity: "topics", keyword: "Klima" })\`.

Read the \`aw://system-prompt\` resource for the full guide.`;

export const systemPromptResource = {
  uri: 'aw://system-prompt',
  name: 'Abgeordnetenwatch MCP System Prompt',
  description: 'Usage instructions and best practices for the Abgeordnetenwatch MCP server',
  mimeType: 'text/markdown',
  async handler() {
    return `${SERVER_INSTRUCTIONS}

## Data & licence
All data comes from the Abgeordnetenwatch API v2 (parliamentwatch.org), licensed
CC0 1.0 (public domain). No API key is required. The API is fair-use rate-limited
(~30 req/min); this server enforces its own limiter and caches responses for ~10
minutes, so repeated identical asks are cheap.

## Coverage & caveats
- **Germany only.** Bundestag and Landtage. The Austrian Nationalrat is not covered.
- **DIP ↔ Abgeordnetenwatch have no shared id.** If you also use the Bundestag DIP
  MCP, bridge between the two by NAME, not by id.
- **Mandates:** an MP who has left parliament has no current mandate, so votes and
  side-jobs may be empty even though the profile resolves — say so plainly.
- **Income levels:** the official Bundestag scheme is 1 (up to 1.000 €) to 10 (over
  250.000 €). Report the level; do not fabricate an exact amount.`;
  }
};

export const infoResource = {
  uri: 'aw://info',
  name: 'Server Information',
  description: 'Abgeordnetenwatch MCP server metadata',
  mimeType: 'application/json',
  async handler() {
    return {
      name: 'Abgeordnetenwatch MCP Server',
      description: 'Open transparency data on German MPs: votes, side-jobs, committees, parties, election programs',
      dataSource: { name: 'Abgeordnetenwatch API v2', licence: 'CC0 1.0', url: 'https://www.abgeordnetenwatch.de/api' },
      coverage: 'Germany (Bundestag + Landtage)'
    };
  }
};

export const allResources = [systemPromptResource, infoResource];
