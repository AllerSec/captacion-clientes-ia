import { describe, it, expect } from 'vitest';
import { canSendNow, dailyQuotaForDay, type PolicyContext } from '../../src/core/send-policy.js';

const tuesdayAt10 = new Date('2026-05-05T10:00:00+02:00'); // martes 10:00 ES
const saturdayAt10 = new Date('2026-05-09T10:00:00+02:00');
const tuesdayAt22 = new Date('2026-05-05T22:00:00+02:00');

describe('dailyQuotaForDay', () => {
  it('returns 5 in week 1 (cautious start)', () => expect(dailyQuotaForDay(1)).toBe(5));
  it('returns 20 in week 2', () => expect(dailyQuotaForDay(8)).toBe(20));
  it('returns 35 in week 3', () => expect(dailyQuotaForDay(15)).toBe(35));
  it('returns 50 in week 4+', () => expect(dailyQuotaForDay(22)).toBe(50));
});

describe('canSendNow', () => {
  const okCtx: PolicyContext = {
    now: tuesdayAt10,
    sentToday: 0,
    daysSinceFirstSend: 1,
    minutesSinceLastSend: 999,
    minIntervalMin: 2,
    maxIntervalMin: 5,
  };

  it('allows send in working hours with quota', () => {
    expect(canSendNow(okCtx).allowed).toBe(true);
  });

  it('blocks on weekend', () => {
    const r = canSendNow({ ...okCtx, now: saturdayAt10 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('not_workday');
  });

  it('blocks at night', () => {
    expect(canSendNow({ ...okCtx, now: tuesdayAt22 }).reason).toBe('outside_hours');
  });

  it('blocks if quota exhausted', () => {
    expect(canSendNow({ ...okCtx, sentToday: 5 }).reason).toBe('quota_exhausted');
  });

  it('blocks if last send too recent', () => {
    expect(canSendNow({ ...okCtx, minutesSinceLastSend: 1 }).reason).toBe('too_soon');
  });
});

describe('canSendNow timezone independence', () => {
  it('uses Europe/Madrid regardless of runtime TZ', () => {
    // Same Spain 10:00 expressed two ways:
    const sameInstantViaUtc = new Date('2026-05-05T08:00:00Z'); // 10:00 in CEST
    expect(canSendNow({
      now: sameInstantViaUtc,
      sentToday: 0,
      daysSinceFirstSend: 1,
      minutesSinceLastSend: 999,
      minIntervalMin: 2,
      maxIntervalMin: 5,
    }).allowed).toBe(true);
  });

  it('honors explicit timeZone override', () => {
    // 10:00 UTC = 12:00 Madrid (still in hours), but in UTC tz it's 10:00 (in hours).
    // Use a time that is in-hours in UTC but NOT in Madrid: 14:00 UTC = 16:00 Madrid (still in 2nd block).
    // So pick: 14:00 UTC = 14:00 in UTC tz (NOT in hours since gap 13:30-16). Should block.
    const date = new Date('2026-05-05T14:00:00Z');
    const r = canSendNow({
      now: date,
      sentToday: 0,
      daysSinceFirstSend: 1,
      minutesSinceLastSend: 999,
      minIntervalMin: 2,
      maxIntervalMin: 5,
      timeZone: 'UTC',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('outside_hours');
  });
});
