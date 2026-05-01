import { describe, it, expect } from 'vitest';
import { pickNextQuery, burstQueries } from '../../src/core/query-rotator.js';
import { QUERIES_BY_TIER } from '../../src/config/queries.js';

describe('pickNextQuery', () => {
  it('returns first query of tier 1 when nothing used', () => {
    const r = pickNextQuery({ recentlyUsed: new Set(), currentTier: 1 });
    expect(r.query).toBe(QUERIES_BY_TIER[1][0]);
    expect(r.tier).toBe(1);
    expect(r.jumpedTier).toBe(false);
    expect(r.exhausted).toBe(false);
  });

  it('skips used queries within tier', () => {
    const used = new Set([QUERIES_BY_TIER[1][0], QUERIES_BY_TIER[1][1]]);
    const r = pickNextQuery({ recentlyUsed: used, currentTier: 1 });
    expect(r.query).toBe(QUERIES_BY_TIER[1][2]);
    expect(r.jumpedTier).toBe(false);
  });

  it('jumps to next tier when current is exhausted', () => {
    const used = new Set(QUERIES_BY_TIER[1]);
    const r = pickNextQuery({ recentlyUsed: used, currentTier: 1 });
    expect(r.tier).toBe(2);
    expect(r.jumpedTier).toBe(true);
    expect(r.query).toBe(QUERIES_BY_TIER[2][0]);
  });

  it('returns exhausted when all tiers used', () => {
    const all = new Set<string>();
    for (let t = 1; t <= 8; t++) for (const q of QUERIES_BY_TIER[t] ?? []) all.add(q);
    const r = pickNextQuery({ recentlyUsed: all, currentTier: 1 });
    expect(r.exhausted).toBe(true);
    expect(r.query).toBeNull();
  });
});

describe('burstQueries', () => {
  it('returns all queries from tiers 1-3 by default', () => {
    const r = burstQueries(new Set());
    const expected = [...QUERIES_BY_TIER[1], ...QUERIES_BY_TIER[2], ...QUERIES_BY_TIER[3]];
    expect(r.queries.sort()).toEqual(expected.sort());
    expect(r.tier).toBe(3);
  });

  it('excludes already-used queries', () => {
    const used = new Set([QUERIES_BY_TIER[1][0]]);
    const r = burstQueries(used);
    expect(r.queries).not.toContain(QUERIES_BY_TIER[1][0]);
  });
});
