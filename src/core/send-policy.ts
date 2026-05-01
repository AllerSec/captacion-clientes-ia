export interface PolicyContext {
  now: Date;
  sentToday: number;
  daysSinceFirstSend: number;
  minutesSinceLastSend: number;
  minIntervalMin: number;
  maxIntervalMin: number;
  quotaOverride?: number;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  quota?: number;
}

export function dailyQuotaForDay(day: number): number {
  if (day <= 7) return 10;
  if (day <= 14) return 20;
  if (day <= 21) return 35;
  return 50;
}

const WORKING_HOURS = [
  { from: 9, to: 13.5 },
  { from: 16, to: 18.5 },
];

export function canSendNow(ctx: PolicyContext): PolicyResult {
  const day = ctx.now.getDay(); // 0 sun, 1-4 mon-thu, 5 fri, 6 sat
  if (day === 0 || day === 5 || day === 6) return { allowed: false, reason: 'not_workday' };

  const hourFloat = ctx.now.getHours() + ctx.now.getMinutes() / 60;
  const inHours = WORKING_HOURS.some(w => hourFloat >= w.from && hourFloat < w.to);
  if (!inHours) return { allowed: false, reason: 'outside_hours' };

  const quota = ctx.quotaOverride ?? dailyQuotaForDay(ctx.daysSinceFirstSend);
  if (ctx.sentToday >= quota) return { allowed: false, reason: 'quota_exhausted', quota };

  if (ctx.minutesSinceLastSend < ctx.minIntervalMin) {
    return { allowed: false, reason: 'too_soon', quota };
  }

  return { allowed: true, quota };
}
