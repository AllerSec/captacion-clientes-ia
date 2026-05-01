import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearch = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockGetByStatus = vi.fn();
const mockFetch = vi.fn();

vi.mock('../../src/services/apify.js', () => ({ searchBusinesses: mockSearch }));
vi.mock('../../src/services/supabase.js', () => ({
  upsertLead: mockUpsert, updateLead: mockUpdate, getLeadsByStatus: mockGetByStatus,
}));
vi.mock('../../src/services/web-fetcher.js', () => ({ fetchWebsite: mockFetch }));
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

describe('runScraper', () => {
  beforeEach(() => {
    mockSearch.mockReset(); mockUpsert.mockReset(); mockUpdate.mockReset();
    mockGetByStatus.mockReset(); mockFetch.mockReset();
  });

  it('end-to-end: scrape, analyze (no website), filter, promote', async () => {
    mockSearch.mockResolvedValue([
      {
        place_id: 'p1', business_name: 'Clínica X', email: 'a@b.com',
        rating: 4.7, review_count: 50, website: null,
        category: 'd', address: '', city: 'Bilbao', province: 'Bizkaia', phone: '',
      },
    ]);
    mockUpsert.mockResolvedValue({
      id: 'lead-1', status: 'NEW',
      place_id: 'p1', business_name: 'Clínica X', email: 'a@b.com',
      rating: 4.7, review_count: 50, website: null,
    });
    // Two getLeadsByStatus calls: first for NEW (after upsert), then for ANALYZED (after analyze)
    mockGetByStatus
      .mockResolvedValueOnce([
        { id: 'lead-1', business_name: 'Clínica X', website: null,
          email: 'a@b.com', rating: 4.7, review_count: 50 },
      ])
      .mockResolvedValueOnce([
        { id: 'lead-1', business_name: 'Clínica X', website: null,
          email: 'a@b.com', rating: 4.7, review_count: 50, web_score: 100 },
      ]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper(['clínica dental Bilbao']);

    expect(mockSearch).toHaveBeenCalledWith('clínica dental Bilbao', expect.any(Number));
    expect(mockUpsert).toHaveBeenCalled();
    // Lead with no website → web_score=100 set on ANALYZED step
    expect(mockUpdate).toHaveBeenCalledWith('lead-1', expect.objectContaining({
      status: 'ANALYZED', web_score: 100,
    }));
    // After filter, qualified → READY_TO_SEND
    expect(mockUpdate).toHaveBeenCalledWith('lead-1', expect.objectContaining({
      status: 'READY_TO_SEND',
    }));
  });

  it('marks unqualified lead as SKIPPED', async () => {
    mockSearch.mockResolvedValue([]);
    mockGetByStatus
      .mockResolvedValueOnce([])  // no NEW leads to analyze
      .mockResolvedValueOnce([
        // Pre-existing ANALYZED lead with low rating → should SKIP
        { id: 'lead-2', business_name: 'X', website: null, email: 'a@b.com',
          rating: 3.0, review_count: 50, web_score: 100 },
      ]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper([]);

    expect(mockUpdate).toHaveBeenCalledWith('lead-2', expect.objectContaining({
      status: 'SKIPPED',
    }));
  });

  it('analyzes lead with website by fetching and scoring', async () => {
    mockSearch.mockResolvedValue([]);
    mockGetByStatus
      .mockResolvedValueOnce([
        { id: 'lead-3', business_name: 'Y', website: 'https://y.com',
          email: 'a@b.com', rating: 4.5, review_count: 30 },
      ])
      .mockResolvedValueOnce([]);
    mockFetch.mockResolvedValue({
      url: 'https://y.com', status: 200, html: '<html><body>old</body></html>',
      sizeBytes: 100, durationMs: 800,
    });

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper([]);

    expect(mockFetch).toHaveBeenCalledWith('https://y.com');
    // Should set ANALYZED with some web_score (web is bad → high score)
    expect(mockUpdate).toHaveBeenCalledWith('lead-3', expect.objectContaining({
      status: 'ANALYZED',
    }));
  });
});
