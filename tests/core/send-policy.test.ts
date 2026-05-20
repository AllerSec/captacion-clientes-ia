import { describe, it, expect } from 'vitest';
import { canSendNow } from '../../src/core/send-policy.js';

describe('canSendNow', () => {
  it('allows when killSwitch is false', () => {
    expect(canSendNow({ killSwitch: false }).allowed).toBe(true);
  });

  it('blocks when killSwitch is true', () => {
    const r = canSendNow({ killSwitch: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('kill_switch');
  });
});
