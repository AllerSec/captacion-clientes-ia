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
});
