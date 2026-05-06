import { describe, it, expect, vi, beforeEach } from 'vitest';

const scrapeMock = vi.fn();
vi.mock('@mendable/firecrawl-js', () => ({
  default: class FakeFirecrawl {
    scrape = scrapeMock;
  },
}));
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({ FIRECRAWL_API_KEY: 'fc-test-key' }),
}));

import { scrapeForLeadAnalysis, resetFirecrawlClientForTests } from '../../src/services/firecrawl.js';

beforeEach(() => {
  scrapeMock.mockReset();
  resetFirecrawlClientForTests();
});

describe('scrapeForLeadAnalysis', () => {
  it('returns ok with parsed signals on happy path', async () => {
    scrapeMock.mockResolvedValue({
      markdown: '# Clinica\n...\n© 2014 Clinica',
      links: ['https://x.com/blog'],
      screenshot: 'https://storage.firecrawl.dev/abc.png',
      json: {
        footerCopyrightYear: 2014,
        latestBlogOrNewsDate: null,
        looksAbandoned: true,
        visualEra: 'early-2010s',
        notableAntiquatedDetails: ['tipografía pequeña', 'fotos pixeladas'],
      },
      metadata: { sourceURL: 'https://x.com', url: 'https://x.com', statusCode: 200 },
    });

    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.signals.footerCopyrightYear).toBe(2014);
    expect(r.signals.notableAntiquatedDetails).toHaveLength(2);
    expect(r.screenshotUrl).toBe('https://storage.firecrawl.dev/abc.png');
    expect(r.statusCode).toBe(200);
  });

  it('returns ok with empty signals when json is malformed', async () => {
    scrapeMock.mockResolvedValue({
      markdown: '# Clinica',
      links: [],
      screenshot: null,
      json: { foo: 'bar' },
      metadata: { sourceURL: 'https://x.com', url: 'https://x.com', statusCode: 200 },
    });
    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.signals.footerCopyrightYear).toBeNull();
    expect(r.signals.notableAntiquatedDetails).toEqual([]);
    expect(r.signals.looksAbandoned).toBe(false);
  });

  it('retries once on 5xx error', async () => {
    const err5xx = Object.assign(new Error('boom'), { statusCode: 502 });
    scrapeMock.mockRejectedValueOnce(err5xx).mockResolvedValueOnce({
      markdown: '', links: [], screenshot: null,
      json: {
        footerCopyrightYear: 2010, latestBlogOrNewsDate: null,
        looksAbandoned: true, visualEra: 'pre-2010',
        notableAntiquatedDetails: [],
      },
      metadata: { sourceURL: 'https://x.com', url: 'https://x.com', statusCode: 200 },
    });
    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(scrapeMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  it('does NOT retry on 401 (auth error)', async () => {
    scrapeMock.mockRejectedValueOnce(Object.assign(new Error('unauth'), { statusCode: 401 }));
    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(scrapeMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unauth/i);
  });

  it('returns failure on persistent network error', async () => {
    scrapeMock.mockRejectedValue(new Error('ENOTFOUND'));
    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(r.ok).toBe(false);
    expect(scrapeMock).toHaveBeenCalledTimes(2);
  });
});
