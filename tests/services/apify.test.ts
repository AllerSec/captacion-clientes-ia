import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListItems = vi.fn();
const mockCall = vi.fn();
vi.mock('apify-client', () => ({
  ApifyClient: class {
    actor() { return { call: mockCall }; }
    dataset() { return { listItems: mockListItems }; }
  },
}));
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({ APIFY_TOKEN: 't' }),
}));

describe('apify service', () => {
  beforeEach(() => { mockCall.mockReset(); mockListItems.mockReset(); });

  it('searchBusinesses returns mapped places', async () => {
    mockCall.mockResolvedValue({ defaultDatasetId: 'd1' });
    mockListItems.mockResolvedValue({ items: [
      { placeId: 'p1', title: 'Clínica X', categoryName: 'Dental clinic',
        address: 'A', city: 'Bilbao', countryCode: 'ES',
        phone: '+34 600', website: 'https://x.com', emails: ['a@b.com'],
        totalScore: 4.7, reviewsCount: 130 },
    ]});
    const { searchBusinesses } = await import('../../src/services/apify.js');
    const out = await searchBusinesses('clínica dental Bilbao', 50);
    expect(out).toHaveLength(1);
    expect(out[0].place_id).toBe('p1');
    expect(out[0].email).toBe('a@b.com');
    expect(out[0].rating).toBe(4.7);
  });
});
