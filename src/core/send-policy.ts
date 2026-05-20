export interface PolicyContext {
  killSwitch: boolean;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

export function canSendNow(ctx: PolicyContext): PolicyResult {
  if (ctx.killSwitch) return { allowed: false, reason: 'kill_switch' };
  return { allowed: true };
}
