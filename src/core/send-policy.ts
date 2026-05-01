export interface PolicyContext {
  now: Date;
  sentToday: number;
  daysSinceFirstSend: number;
  minutesSinceLastSend: number;
  minIntervalMin: number;
  maxIntervalMin: number;
  quotaOverride?: number;
  /** IANA timezone for working-hours / workday calculation. Defaults to Europe/Madrid. */
  timeZone?: string;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  quota?: number;
}

export function dailyQuotaForDay(day: number): number {
  if (day <= 7) return 5;
  if (day <= 14) return 20;
  if (day <= 21) return 35;
  return 50;
}

const WORKING_HOURS = [
  { from: 9, to: 13.5 },
  { from: 16, to: 18.5 },
];

interface ZonedParts {
  weekday: number; // 0 sun .. 6 sat
  hour: number;
  minute: number;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0';
  const minuteStr = parts.find(p => p.type === 'minute')?.value ?? '0';
  // hour can come back as '24' for midnight in some ICU versions; normalize
  let hour = parseInt(hourStr, 10);
  if (hour === 24) hour = 0;
  return {
    weekday: weekdayMap[weekdayStr] ?? 1,
    hour,
    minute: parseInt(minuteStr, 10),
  };
}

export function canSendNow(ctx: PolicyContext): PolicyResult {
  const tz = ctx.timeZone ?? 'Europe/Madrid';
  const { weekday, hour, minute } = getZonedParts(ctx.now, tz);

  if (weekday === 0 || weekday === 5 || weekday === 6) {
    return { allowed: false, reason: 'not_workday' };
  }

  const hourFloat = hour + minute / 60;
  const inHours = WORKING_HOURS.some(w => hourFloat >= w.from && hourFloat < w.to);
  if (!inHours) return { allowed: false, reason: 'outside_hours' };

  const quota = ctx.quotaOverride ?? dailyQuotaForDay(ctx.daysSinceFirstSend);
  if (ctx.sentToday >= quota) return { allowed: false, reason: 'quota_exhausted', quota };

  if (ctx.minutesSinceLastSend < ctx.minIntervalMin) {
    return { allowed: false, reason: 'too_soon', quota };
  }

  return { allowed: true, quota };
}
