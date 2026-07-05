/**
 * Abgeordnetenwatch API v2 client.
 *
 * Public CC0 API, ~30 req/min, NO aggregate endpoints — so every request is
 * server-side filtered and bounded with an explicit `range_end`, and every
 * response is trimmed to a compact DTO before it leaves the client. Roll-call
 * tallies are the one wide read (≤1000 votes), aggregated here into counts.
 *
 * Layout:
 *   - low level: requestRaw / fetchList / getEntity (cache → rate-limit → retry)
 *   - transparency: politicians, mandates, votes, side-jobs, polls, tallies
 *   - structure: parties, fractions, parliaments, periods, committees,
 *     memberships, constituencies, electoral lists, topics, election programs
 *   - generic: query() — bounded passthrough for any allow-listed entity
 */

import { config } from '../config.js';
import { getCachedApiResponse, cacheApiResponse, getCachedEntity, cacheEntity } from '../utils/cache.js';
import { withRetry } from '../utils/retry.js';
import { RateLimiter } from '../utils/rateLimiter.js';

const BASE_URL = config.api.baseUrl;

const limiter = new RateLimiter({
  requestsPerMinute: config.api.rateLimitPerMinute,
  burstSize: config.api.burstSize,
  maxWaitTime: 20000
});

const KNOWN_VOTES = ['yes', 'no', 'abstain', 'no_show'];

// Entities the generic query() tool may touch (all confirmed live on v2).
export const QUERYABLE_ENTITIES = new Set([
  'politicians', 'candidacies-mandates', 'votes', 'polls', 'sidejobs',
  'sidejob-organizations', 'parties', 'fractions', 'parliaments',
  'parliament-periods', 'committees', 'committee-memberships',
  'constituencies', 'electoral-lists', 'election-program', 'topics'
]);

function emptyCounts() {
  return { yes: 0, no: 0, abstain: 0, no_show: 0 };
}

function stripHtml(html, max = 280) {
  if (!html) return null;
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function clampRange(n, fallback = 15) {
  const v = Number.parseInt(n, 10);
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(v, config.api.maxRangeEnd);
}

// Keys carry literal filter operators (e.g. `label[cn]`) — encode values only.
function buildQuery(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

async function requestRaw(path, params = {}, { useCache = true } = {}) {
  if (useCache) {
    const cached = getCachedApiResponse(`aw/${path}`, params);
    if (cached) return cached;
  }
  const url = `${BASE_URL}/${path}${buildQuery(params)}`;
  const body = await withRetry(
    async () => {
      const acquired = await limiter.acquire();
      if (!acquired) {
        const err = new Error('Abgeordnetenwatch rate limit exceeded');
        err.code = 'RATE_LIMITED';
        err.status = 429;
        throw err;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.api.timeout);
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'abgeordnetenwatch-mcp/1.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`Abgeordnetenwatch API ${res.status}: ${text.slice(0, 200)}`);
          err.status = res.status;
          throw err;
        }
        return res.json();
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    },
    { maxRetries: 2, baseDelay: 1000, maxDelay: 4000 }
  );
  if (useCache) cacheApiResponse(`aw/${path}`, params, body);
  return body;
}

async function fetchList(path, params, options = {}) {
  const raw = await requestRaw(path, params, options);
  const items = Array.isArray(raw?.data) ? raw.data : [];
  const total = raw?.meta?.result?.total ?? items.length;
  return { items, total };
}

async function getEntity(pathBase, id, options = {}) {
  const cached = getCachedEntity(pathBase, id);
  if (cached) return cached;
  const raw = await requestRaw(`${pathBase}/${id}`, {}, { useCache: false });
  const data = raw?.data ?? null;
  if (data) cacheEntity(pathBase, id, data);
  return data;
}

// Replace nested {label} objects with their label, arrays with label lists —
// keeps the generic query() output compact and context-safe.
function compact(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'api_url') continue;
    if (Array.isArray(v)) {
      out[k] = v.map((x) => (x && typeof x === 'object' ? x.label ?? x.id ?? x : x));
    } else if (v && typeof v === 'object') {
      out[k] = v.label ?? v.id ?? null;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── transparency ────────────────────────────────────────────────────────────

export async function searchPoliticians(name, limit = 5, options = {}) {
  const q = (name || '').trim();
  if (!q) return [];
  const { items } = await fetchList('politicians', { 'label[cn]': q, range_end: clampRange(limit, 5) }, options);
  return items.map((p) => ({
    id: p.id,
    name: p.label ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
    party: p.party?.label ?? null,
    url: p.abgeordnetenwatch_url ?? `${BASE_URL}/politicians/${p.id}`
  }));
}

export async function getPolitician(id, options = {}) {
  const p = await getEntity('politicians', id, options);
  if (!p) return null;
  return {
    id: p.id,
    name: p.label ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
    party: p.party?.label ?? null,
    sex: p.sex ?? null,
    yearOfBirth: p.year_of_birth ?? null,
    education: p.education ?? null,
    url: p.abgeordnetenwatch_url ?? `${BASE_URL}/politicians/${p.id}`
  };
}

export async function getCurrentMandate(politicianId, options = {}) {
  const { items } = await fetchList(
    'candidacies-mandates',
    { politician: politicianId, sort_by: 'id', sort_direction: 'desc', range_end: 5 },
    options
  );
  const mandate = items.find((m) => m.type === 'mandate') ?? items[0];
  if (!mandate) return null;
  return {
    mandateId: mandate.id,
    politicianId,
    politicianName: mandate.politician?.label ?? '',
    parliamentPeriod: mandate.parliament_period?.label ?? '',
    fraction: mandate.fraction_membership?.[0]?.fraction?.label ?? null
  };
}

export async function getVotes({ mandateId, pollId, limit = 15 }, options = {}) {
  const params = { mandate: mandateId, sort_by: 'id', sort_direction: 'desc', range_end: clampRange(limit) };
  if (pollId) params.poll = pollId;
  const { items } = await fetchList('votes', params, options);
  return items.map((v) => ({
    pollId: v.poll?.id ?? 0,
    pollLabel: v.poll?.label ?? '',
    vote: v.vote ?? 'unknown',
    fraction: v.fraction?.label ?? null,
    url: v.poll?.abgeordnetenwatch_url ?? ''
  }));
}

export async function getSideJobs(mandateId, limit = 10, options = {}) {
  const { items } = await fetchList(
    'sidejobs',
    { mandates: mandateId, sort_by: 'income', sort_direction: 'desc', range_end: clampRange(limit, 10) },
    options
  );
  return items.map((s) => ({
    label: s.label ?? '',
    organization: s.sidejob_organization?.label ?? null,
    income: s.income ?? null,
    incomeLevel: s.income_level != null ? Number.parseInt(s.income_level, 10) || null : null,
    interval: s.interval ?? null,
    year: s.job_title_extra ?? null,
    topics: (s.field_topics ?? []).map((t) => t.label ?? '').filter(Boolean)
  }));
}

export async function searchPolls({ keyword, topicId, limit = 8 }, options = {}) {
  if (!keyword && !topicId) return [];
  // polls 500s on sort_by=id (unlike votes/mandates) — sort by poll date.
  const params = { sort_by: 'field_poll_date', sort_direction: 'desc', range_end: clampRange(limit, 8) };
  if (keyword) params['label[cn]'] = keyword.trim();
  if (topicId) params.field_topics = topicId;
  const { items } = await fetchList('polls', params, options);
  return items.map((p) => ({
    pollId: p.id,
    label: p.label ?? '',
    date: p.field_poll_date ?? null,
    accepted: p.field_accepted ?? null,
    topics: (p.field_topics ?? []).map((t) => t.label ?? '').filter(Boolean),
    intro: p.field_intro ? stripHtml(p.field_intro) : null,
    url: p.abgeordnetenwatch_url ?? ''
  }));
}

export function aggregateTally(voteRows) {
  const total = emptyCounts();
  const fractions = new Map();
  for (const v of voteRows) {
    const vote = v.vote ?? '';
    if (!KNOWN_VOTES.includes(vote)) continue;
    total[vote] += 1;
    const fracName = v.fraction?.label ?? 'fraktionslos';
    const frac = fractions.get(fracName) ?? emptyCounts();
    frac[vote] += 1;
    fractions.set(fracName, frac);
  }
  const byFraction = [...fractions.entries()]
    .map(([fraction, c]) => ({ fraction, ...c }))
    .sort((a, b) => b.yes + b.no - (a.yes + a.no));
  return { total, byFraction };
}

export async function getPollTally(pollId, options = {}) {
  const [pollRaw, votesResult] = await Promise.all([
    requestRaw(`polls/${pollId}`, {}, options),
    fetchList('votes', { poll: pollId, range_end: config.api.tallyMaxVotes }, options)
  ]);
  const meta = pollRaw?.data ?? null;
  const { total, byFraction } = aggregateTally(votesResult.items);
  return {
    pollId,
    label: meta?.label ?? '',
    date: meta?.field_poll_date ?? null,
    accepted: meta?.field_accepted ?? null,
    total,
    byFraction,
    url: meta?.abgeordnetenwatch_url ?? ''
  };
}

/** Committee memberships for a mandate → committee name + role. */
export async function getCommitteeMemberships(mandateId, limit = 20, options = {}) {
  const { items } = await fetchList(
    'committee-memberships',
    { 'candidacy_mandate[entity.id]': mandateId, range_end: clampRange(limit, 20) },
    options
  );
  return items.map((m) => ({
    committee: m.committee?.label ?? '',
    role: m.committee_role ?? null,
    additionalRoles: m.committee_roles_additional ?? null
  }));
}

// ── structure (generic list helpers) ────────────────────────────────────────

const LIST_TRIM = {
  parties: (p) => ({ id: p.id, label: p.label, fullName: p.full_name ?? null, shortName: p.short_name ?? null }),
  fractions: (f) => ({ id: f.id, label: f.label, legislature: f.legislature?.label ?? null }),
  parliaments: (p) => ({ id: p.id, label: p.label, longName: p.label_external_long ?? null, currentPeriod: p.current_project?.label ?? null, url: p.abgeordnetenwatch_url ?? null }),
  'parliament-periods': (p) => ({ id: p.id, label: p.label, type: p.type ?? null, parliament: p.parliament?.label ?? null, electionDate: p.election_date ?? null, start: p.start_date_period ?? null }),
  committees: (c) => ({ id: c.id, label: c.label, legislature: c.field_legislature?.label ?? null, topics: (c.field_topics ?? []).map((t) => t.label).filter(Boolean), url: c.abgeordnetenwatch_url ?? null }),
  constituencies: (c) => ({ id: c.id, label: c.label, number: c.number ?? null, name: c.name ?? null }),
  'electoral-lists': (e) => ({ id: e.id, label: e.label, name: e.name ?? null, parliamentPeriod: e.parliament_period?.label ?? null }),
  'election-program': (e) => ({ id: e.id, label: e.label, party: e.party?.label ?? null, parliamentPeriod: e.parliament_period?.label ?? null, link: e.link ?? null, file: e.file ?? null }),
  topics: (t) => ({ id: t.id, label: t.label, parent: t.parent?.label ?? null, description: t.description ? stripHtml(t.description) : null, url: t.abgeordnetenwatch_url ?? null }),
  'sidejob-organizations': (o) => ({ id: o.id, label: o.label, city: o.field_city?.label ?? null, country: o.field_country?.label ?? null, topics: (o.field_topics ?? []).map((t) => t.label).filter(Boolean) })
};

/** List any structural entity with a trimmed projection + optional label filter. */
export async function listEntity(entity, { keyword, filters = {}, limit = 20 } = {}, options = {}) {
  const trim = LIST_TRIM[entity];
  if (!trim) throw new Error(`listEntity: unsupported entity "${entity}"`);
  const params = { range_end: clampRange(limit, 20), ...filters };
  if (keyword) params['label[cn]'] = String(keyword).trim();
  const { items, total } = await fetchList(entity, params, options);
  return { items: items.map(trim), total };
}

export async function getElectionPrograms({ partyId, parliamentPeriodId, limit = 10 } = {}, options = {}) {
  const filters = {};
  if (partyId) filters.party = partyId;
  if (parliamentPeriodId) filters.parliament_period = parliamentPeriodId;
  return listEntity('election-program', { filters, limit }, options);
}

// ── generic bounded passthrough ─────────────────────────────────────────────

export async function query({ entity, filters = {}, rangeEnd = 15 } = {}, options = {}) {
  if (!QUERYABLE_ENTITIES.has(entity)) {
    throw new Error(`query: entity "${entity}" not allowed. One of: ${[...QUERYABLE_ENTITIES].join(', ')}`);
  }
  const safeFilters = {};
  for (const [k, v] of Object.entries(filters || {})) {
    if (v !== undefined && v !== null && v !== '') safeFilters[k] = v;
  }
  const params = { range_end: clampRange(rangeEnd), ...safeFilters };
  const { items, total } = await fetchList(entity, params, options);
  return { entity, total, count: items.length, items: items.map(compact) };
}

export function getRateLimiterStats() {
  return limiter.getStats();
}
