import { describe, it, expect } from 'vitest';
import { aggregateTally, QUERYABLE_ENTITIES } from '../src/api/abgeordnetenwatch.js';

describe('aggregateTally', () => {
  it('counts totals + per-faction, ignores unknown votes, buckets missing fraction', () => {
    const rows = [
      { vote: 'yes', fraction: { label: 'SPD' } },
      { vote: 'yes', fraction: { label: 'SPD' } },
      { vote: 'no', fraction: { label: 'CDU/CSU' } },
      { vote: 'abstain', fraction: { label: 'SPD' } },
      { vote: 'no_show', fraction: null },
      { vote: 'garbage', fraction: { label: 'SPD' } }
    ];
    const { total, byFraction } = aggregateTally(rows);
    expect(total).toEqual({ yes: 2, no: 1, abstain: 1, no_show: 1 });
    expect(byFraction.find((f) => f.fraction === 'SPD')).toMatchObject({ yes: 2, no: 0, abstain: 1 });
    expect(byFraction.find((f) => f.fraction === 'fraktionslos').no_show).toBe(1);
    expect(byFraction[0].fraction).toBe('SPD'); // sorted by cast votes desc
  });

  it('returns empty counts for no rows', () => {
    expect(aggregateTally([])).toEqual({ total: { yes: 0, no: 0, abstain: 0, no_show: 0 }, byFraction: [] });
  });
});

describe('queryable entity allow-list', () => {
  it('includes the core transparency + structure entities and excludes bogus ones', () => {
    expect(QUERYABLE_ENTITIES.has('politicians')).toBe(true);
    expect(QUERYABLE_ENTITIES.has('committee-memberships')).toBe(true);
    expect(QUERYABLE_ENTITIES.has('election-program')).toBe(true);
    expect(QUERYABLE_ENTITIES.has('questions')).toBe(false); // not in v2
    expect(QUERYABLE_ENTITIES.has('__proto__')).toBe(false);
  });
});
