/**
 * Named roll-call votes (Abstimmungen): search + per-faction tally.
 */

import { z } from 'zod';
import * as aw from '../api/abgeordnetenwatch.js';
import { safe } from './schemas.js';

export const searchPollsTool = {
  name: 'aw_search_polls',
  description: `Find named Bundestag/Landtag roll-call votes (Abstimmungen) by keyword and/or topic id, newest first. Returns poll id, label, date, accepted/rejected, short intro. Feed a poll id into aw_poll_tally. Germany only (covers Bundestag AND Landtage).`,
  inputSchema: {
    keyword: z.string().optional().describe('Search the poll label, e.g. "Heizungsgesetz"'),
    topicId: z.number().int().positive().optional().describe('Abgeordnetenwatch policy-area topic id (see aw_list_structure entity=topics)'),
    limit: z.number().int().min(1).max(30).default(8).describe('Max polls')
  },
  handler: safe('aw_search_polls', async (p) => {
    if (!p.keyword && !p.topicId) return { error: true, message: 'Provide keyword or topicId', tool: 'aw_search_polls' };
    const polls = await aw.searchPolls({ keyword: p.keyword, topicId: p.topicId, limit: p.limit ?? 8 });
    return { success: true, source: 'abgeordnetenwatch', count: polls.length, polls };
  })
};

export const pollTallyTool = {
  name: 'aw_poll_tally',
  description: `Aggregated result of a named vote (Abstimmung): total yes/no/abstain/no_show plus a per-faction breakdown, computed over all cast votes. Pass a poll id from aw_search_polls. State whether it was accepted; cite the source. Germany only.`,
  inputSchema: { pollId: z.number().int().positive().describe('Abgeordnetenwatch poll id') },
  handler: safe('aw_poll_tally', async (p) => {
    const tally = await aw.getPollTally(p.pollId);
    return { success: true, source: 'abgeordnetenwatch', tally };
  })
};

export const pollTools = [searchPollsTool, pollTallyTool];
