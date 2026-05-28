import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }),
}));

describe('supabase service', () => {
  beforeEach(() => mockFrom.mockReset());

  it('upsertLead returns inserted row', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'uuid', place_id: 'p1' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mockFrom.mockReturnValue({ upsert });

    const { upsertLead } = await import('../../src/services/supabase.js');
    const out = await upsertLead({ place_id: 'p1', business_name: 'X' });
    expect(out.id).toBe('uuid');
    expect(upsert).toHaveBeenCalledWith({ place_id: 'p1', business_name: 'X' }, { onConflict: 'place_id' });
  });

  it('withRetry resolves after transient failures', async () => {
    const { withRetry } = await import('../../src/services/supabase.js');
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('522 timeout');
      return 'ok';
    });
    const out = await withRetry(fn, 3, 1);
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });

  it('withRetry rethrows after exhausting retries', async () => {
    const { withRetry } = await import('../../src/services/supabase.js');
    const fn = vi.fn(async () => { throw new Error('still down'); });
    await expect(withRetry(fn, 2, 1)).rejects.toThrow('still down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('getActiveVariants survives 2 transient failures then succeeds', async () => {
    let attempts = 0;
    const eq = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('522 Connection timed out');
      return { data: [{ id: 'v1', name: 'v1', prompt_snippet: 's', weight: 1 }], error: null };
    });
    const select = vi.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const { getActiveVariants } = await import('../../src/services/supabase.js');
    const out = await getActiveVariants(3, 1);
    expect(out).toHaveLength(1);
    expect(attempts).toBe(3);
  });
});
