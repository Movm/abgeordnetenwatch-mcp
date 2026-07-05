/**
 * Core MP transparency tools: who, how they voted, what they earn on the side,
 * which committees, and a combined profile. All Germany-only (CC0 data).
 */

import { z } from 'zod';
import * as aw from '../api/abgeordnetenwatch.js';
import { nameSchema, politicianIdSchema, limitSchema, safe } from './schemas.js';

/** Resolve `{ name | politicianId }` → politician + current mandate + notes. */
async function resolveMandate({ name, politicianId }) {
  const notes = [];
  let politician = null;

  if (politicianId) {
    politician = await aw.getPolitician(politicianId).catch(() => null);
    if (!politician) politician = { id: politicianId, name: '', party: null, url: null };
  } else if (name) {
    const candidates = await aw.searchPoliticians(name, 5);
    if (candidates.length === 0) {
      return { politician: null, mandate: null, notes: [`Keine:n Abgeordnete:n zu „${name}" gefunden.`] };
    }
    politician = candidates[0];
    if (candidates.length > 1) notes.push(`${candidates.length - 1} weitere Namenstreffer (z. B. ${candidates[1].name}).`);
  } else {
    return { politician: null, mandate: null, notes: ['Bitte name oder politicianId angeben.'] };
  }

  const mandate = await aw.getCurrentMandate(politician.id);
  if (!mandate) notes.push(`Kein aktuelles Mandat für ${politician.name || `Politician ${politician.id}`} gefunden — evtl. nicht (mehr) im Parlament.`);
  else if (!politician.name) politician.name = mandate.politicianName;
  return { politician, mandate, notes };
}

async function fetchTopicVotes(mandateId, topic) {
  const polls = await aw.searchPolls({ keyword: topic, limit: 3 });
  if (polls.length === 0) return [];
  const perPoll = await Promise.all(polls.map((p) => aw.getVotes({ mandateId, pollId: p.pollId, limit: 1 })));
  return perPoll.flat();
}

export const searchPoliticiansTool = {
  name: 'aw_search_politicians',
  description: `Resolve an MP name to Abgeordnetenwatch politician candidates (id, party, profile URL). Fuzzy CONTAINS match — pick by party. Germany only. Cite the profile URL.`,
  inputSchema: { name: nameSchema, limit: z.number().int().min(1).max(20).default(5).describe('Max candidates') },
  handler: safe('aw_search_politicians', async (p) => {
    const candidates = await aw.searchPoliticians(p.name, p.limit ?? 5);
    return { success: true, source: 'abgeordnetenwatch', query: p.name, count: candidates.length, candidates };
  })
};

export const getPoliticianTool = {
  name: 'aw_get_politician',
  description: `Get an Abgeordnetenwatch politician's profile by id (party, year of birth, education). Germany only.`,
  inputSchema: { politicianId: politicianIdSchema },
  handler: safe('aw_get_politician', async (p) => {
    const politician = await aw.getPolitician(p.politicianId);
    if (!politician) return { error: true, message: `Politician ${p.politicianId} not found`, tool: 'aw_get_politician' };
    return { success: true, source: 'abgeordnetenwatch', politician };
  })
};

export const votingRecordTool = {
  name: 'aw_voting_record',
  description: `An MP's roll-call voting behaviour: current mandate, recent named votes, and — with a topic — their exact vote on matching polls. Give name or politicianId. Vote values: yes/no/abstain/no_show. Report the concrete vote + poll label + source; no motives. Germany only.`,
  inputSchema: {
    name: nameSchema.optional(),
    politicianId: politicianIdSchema.optional(),
    topic: z.string().optional().describe('Optional topic keyword to pin exact votes, e.g. "Bürgergeld"'),
    limit: limitSchema
  },
  handler: safe('aw_voting_record', async (p) => {
    const { politician, mandate, notes } = await resolveMandate(p);
    if (!politician) return { success: true, source: 'abgeordnetenwatch', found: false, notes };
    if (!mandate) return { success: true, source: 'abgeordnetenwatch', found: false, politician, notes };
    const [recentVotes, topicVotes] = await Promise.all([
      aw.getVotes({ mandateId: mandate.mandateId, limit: p.limit ?? 15 }),
      p.topic ? fetchTopicVotes(mandate.mandateId, p.topic) : Promise.resolve([])
    ]);
    return { success: true, source: 'abgeordnetenwatch', found: true, politician, mandate, topicVotes, recentVotes, notes };
  })
};

export const sidejobsTool = {
  name: 'aw_sidejobs',
  description: `An MP's declared Nebentätigkeiten (side-jobs / outside income), highest income first. Give name or politicianId. Income is the official LEVEL 1–10 (1 = up to 1.000 €, 10 = over 250.000 €) — state and explain the level; never invent a euro sum. Neutral, public facts. Germany only.`,
  inputSchema: {
    name: nameSchema.optional(),
    politicianId: politicianIdSchema.optional(),
    limit: z.number().int().min(1).max(30).default(10).describe('Max side-jobs')
  },
  handler: safe('aw_sidejobs', async (p) => {
    const { politician, mandate, notes } = await resolveMandate(p);
    if (!politician) return { success: true, source: 'abgeordnetenwatch', found: false, notes };
    if (!mandate) return { success: true, source: 'abgeordnetenwatch', found: false, politician, notes };
    const sideJobs = await aw.getSideJobs(mandate.mandateId, p.limit ?? 10);
    return { success: true, source: 'abgeordnetenwatch', found: true, politician, mandate, sideJobs, notes };
  })
};

export const committeeMembershipsTool = {
  name: 'aw_committee_memberships',
  description: `The committees (Ausschüsse) an MP sits on and their role. Give name or politicianId. Germany only.`,
  inputSchema: {
    name: nameSchema.optional(),
    politicianId: politicianIdSchema.optional(),
    limit: z.number().int().min(1).max(30).default(20).describe('Max memberships')
  },
  handler: safe('aw_committee_memberships', async (p) => {
    const { politician, mandate, notes } = await resolveMandate(p);
    if (!politician) return { success: true, source: 'abgeordnetenwatch', found: false, notes };
    if (!mandate) return { success: true, source: 'abgeordnetenwatch', found: false, politician, notes };
    const memberships = await aw.getCommitteeMemberships(mandate.mandateId, p.limit ?? 20);
    return { success: true, source: 'abgeordnetenwatch', found: true, politician, mandate, memberships, notes };
  })
};

export const politicianProfileTool = {
  name: 'aw_politician_profile',
  description: `Combined transparency profile of one MP in a single call: mandate + recent votes + side-jobs + committees. Give name (resolved fuzzily). Watch \`notes\` for ambiguous matches. Explain income levels 1–10; cite the source. Germany only.`,
  inputSchema: {
    name: nameSchema,
    voteLimit: z.number().int().min(1).max(30).default(10).describe('Max recent votes'),
    sidejobLimit: z.number().int().min(1).max(30).default(10).describe('Max side-jobs')
  },
  handler: safe('aw_politician_profile', async (p) => {
    const { politician, mandate, notes } = await resolveMandate({ name: p.name });
    if (!politician) return { success: true, source: 'abgeordnetenwatch', found: false, notes };
    if (!mandate) return { success: true, source: 'abgeordnetenwatch', found: false, politician, notes };
    const [recentVotes, sideJobs, committees] = await Promise.all([
      aw.getVotes({ mandateId: mandate.mandateId, limit: p.voteLimit ?? 10 }),
      aw.getSideJobs(mandate.mandateId, p.sidejobLimit ?? 10),
      aw.getCommitteeMemberships(mandate.mandateId, 20)
    ]);
    return { success: true, source: 'abgeordnetenwatch', found: true, politician, mandate, recentVotes, sideJobs, committees, notes };
  })
};

export const transparencyTools = [
  searchPoliticiansTool,
  getPoliticianTool,
  votingRecordTool,
  sidejobsTool,
  committeeMembershipsTool,
  politicianProfileTool
];
