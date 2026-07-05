/**
 * Parliamentary structure browsing (parties, committees, constituencies, …),
 * election programs, and a bounded generic passthrough for anything else.
 */

import { z } from 'zod';
import * as aw from '../api/abgeordnetenwatch.js';
import { safe } from './schemas.js';

const STRUCTURE_ENTITIES = [
  'parties', 'fractions', 'parliaments', 'parliament-periods', 'committees',
  'constituencies', 'electoral-lists', 'topics', 'sidejob-organizations'
];

export const listStructureTool = {
  name: 'aw_list_structure',
  description: `Browse a structural Abgeordnetenwatch entity with a compact projection: parties, fractions, parliaments, parliament-periods, committees, constituencies, electoral-lists, topics, sidejob-organizations. Optional \`keyword\` filters by label. Use topics to discover a topic id for aw_search_polls. Germany only.`,
  inputSchema: {
    entity: z.enum(STRUCTURE_ENTITIES).describe('Which structural entity to list'),
    keyword: z.string().optional().describe('Optional CONTAINS filter on the label'),
    limit: z.number().int().min(1).max(100).default(20).describe('Max rows')
  },
  handler: safe('aw_list_structure', async (p) => {
    const { items, total } = await aw.listEntity(p.entity, { keyword: p.keyword, limit: p.limit ?? 20 });
    return { success: true, source: 'abgeordnetenwatch', entity: p.entity, total, count: items.length, items };
  })
};

export const electionProgramsTool = {
  name: 'aw_election_programs',
  description: `Party election programs (Wahlprogramme) with links to the source PDF, filterable by party id and/or parliament-period id. Germany only.`,
  inputSchema: {
    partyId: z.number().int().positive().optional().describe('Party id (see aw_list_structure entity=parties)'),
    parliamentPeriodId: z.number().int().positive().optional().describe('Parliament-period id'),
    limit: z.number().int().min(1).max(50).default(10).describe('Max programs')
  },
  handler: safe('aw_election_programs', async (p) => {
    const { items, total } = await aw.getElectionPrograms({ partyId: p.partyId, parliamentPeriodId: p.parliamentPeriodId, limit: p.limit ?? 10 });
    return { success: true, source: 'abgeordnetenwatch', total, count: items.length, programs: items };
  })
};

export const queryTool = {
  name: 'aw_query',
  description: `Generic bounded read of ANY Abgeordnetenwatch v2 entity when no specific tool fits — escape hatch. Provide an allow-listed \`entity\` and raw API \`filters\` (e.g. {"politician": 139064}); results are trimmed and capped by \`rangeEnd\` (max 100). Allowed entities: politicians, candidacies-mandates, votes, polls, sidejobs, sidejob-organizations, parties, fractions, parliaments, parliament-periods, committees, committee-memberships, constituencies, electoral-lists, election-program, topics. Prefer the specific tools; this has no domain shaping. Germany only.`,
  inputSchema: {
    entity: z.enum([...aw.QUERYABLE_ENTITIES]).describe('Abgeordnetenwatch v2 entity name'),
    filters: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Raw API query params, e.g. {"politician": 139064, "label[cn]": "Klima"}'),
    rangeEnd: z.number().int().min(1).max(100).default(15).describe('Max rows (bounded to 100)')
  },
  handler: safe('aw_query', async (p) => {
    const result = await aw.query({ entity: p.entity, filters: p.filters ?? {}, rangeEnd: p.rangeEnd ?? 15 });
    return { success: true, source: 'abgeordnetenwatch', ...result };
  })
};

export const structureTools = [listStructureTool, electionProgramsTool, queryTool];
