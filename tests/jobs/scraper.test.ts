import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearch = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockGetByStatus = vi.fn();

vi.mock('../../src/services/apify.js', () => ({ searchBusinesses: mockSearch }));
vi.mock('../../src/services/supabase.js', () => ({
  upsertLead: mockUpsert, updateLead: mockUpdate, getLeadsByStatus: mockGetByStatus,
  getRecentlyUsedQueries: vi.fn().mockResolvedValue(new Set()),
  recordQueryUsed: vi.fn(),
  getScraperState: vi.fn().mockResolvedValue({ current_tier: 1, last_burst_at: '2026-01-01' }),
  setScraperTier: vi.fn(),
  markBurstDone: vi.fn(),
  countReadyToSend: vi.fn().mockResolvedValue(0),
}));
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock('../../src/core/health-monitor.js', () => ({ notifyError: vi.fn() }));

describe('runScraper', () => {
  beforeEach(() => {
    mockSearch.mockReset(); mockUpsert.mockReset();
    mockUpdate.mockReset(); mockGetByStatus.mockReset();
  });

  it('end-to-end: scrape, analyze (no website), promote to READY_TO_SEND', async () => {
    mockSearch.mockResolvedValue([{
      place_id: 'p1', business_name: 'Taller X', email: 'a@b.com',
      rating: 4.7, review_count: 50, website: null,
      category: 'taller', address: '', city: 'Bilbao', province: 'Bizkaia', phone: '',
    }]);
    mockUpsert.mockResolvedValue({
      id: 'lead-1', status: 'NEW', place_id: 'p1', business_name: 'Taller X',
      email: 'a@b.com', rating: 4.7, review_count: 50, website: null,
    });
    mockGetByStatus
      .mockResolvedValueOnce([{
        id: 'lead-1', business_name: 'Taller X', website: null,
        email: 'a@b.com', rating: 4.7, review_count: 50,
      }])
      .mockResolvedValueOnce([{
        id: 'lead-1', business_name: 'Taller X', website: null,
        email: 'a@b.com', rating: 4.7, review_count: 50,
      }]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper(['taller mecánico Bilbao']);

    expect(mockSearch).toHaveBeenCalledWith('taller mecánico Bilbao', expect.any(Number));
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith('lead-1', expect.objectContaining({
      status: 'ANALYZED', web_issues: ['no_website'],
    }));
    expect(mockUpdate).toHaveBeenCalledWith('lead-1', expect.objectContaining({
      status: 'READY_TO_SEND',
    }));
  });

  it('skips lead with website immediately', async () => {
    mockSearch.mockResolvedValue([]);
    mockGetByStatus
      .mockResolvedValueOnce([{
        id: 'lead-2', business_name: 'Taller Y', website: 'https://y.com',
        email: 'a@b.com', rating: 4.5, review_count: 30,
      }])
      .mockResolvedValueOnce([]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper([]);

    expect(mockUpdate).toHaveBeenCalledWith('lead-2', expect.objectContaining({
      status: 'SKIPPED', notes: 'has_website',
    }));
  });

  it('skips lead with low rating (no web)', async () => {
    mockSearch.mockResolvedValue([]);
    mockGetByStatus
      .mockResolvedValueOnce([{
        id: 'lead-3', business_name: 'Taller Z', website: null,
        email: 'a@b.com', rating: 3.0, review_count: 50,
      }])
      .mockResolvedValueOnce([]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper([]);

    expect(mockUpdate).toHaveBeenCalledWith('lead-3', expect.objectContaining({
      status: 'SKIPPED',
    }));
  });
});
