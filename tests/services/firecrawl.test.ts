import { describe, it, expect, vi, beforeEach } from 'vitest';

const scrapeMock = vi.fn();
const searchMock = vi.fn();
vi.mock('@mendable/firecrawl-js', () => ({
  default: class FakeFirecrawl {
    scrape = scrapeMock;
    search = searchMock;
  },
}));
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({ FIRECRAWL_API_KEY: 'fc-test-key' }),
}));

import { scrapeForLeadAnalysis, resetFirecrawlClientForTests } from '../../src/services/firecrawl.js';

beforeEach(() => {
  scrapeMock.mockReset();
  searchMock.mockReset();
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

import { searchBusinessInfo } from '../../src/services/firecrawl.js';

describe('searchBusinessInfo', () => {
  it('returns top results with their snippets and markdown', async () => {
    searchMock.mockResolvedValue({
      web: [
        {
          url: 'https://www.tallerx.es',
          title: 'Taller X — Reparación',
          description: 'Taller mecánico en Bilbao. Contacto: info@tallerx.es',
          markdown: '# Taller X\nContacto info@tallerx.es',
        },
        {
          url: 'https://www.paginasamarillas.es/taller-x',
          title: 'Taller X en Páginas Amarillas',
          description: 'Ficha del negocio',
          markdown: undefined,
        },
      ],
    });

    const r = await searchBusinessInfo('Taller X Bilbao');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results).toHaveLength(2);
    expect(r.results[0].url).toBe('https://www.tallerx.es');
    expect(r.results[0].markdown).toContain('Contacto');
  });

  it('truncates markdown to 3000 chars to limit Claude tokens', async () => {
    const huge = 'x'.repeat(10_000);
    searchMock.mockResolvedValue({
      web: [{ url: 'https://a.b', title: 't', description: 'd', markdown: huge }],
    });
    const r = await searchBusinessInfo('whatever');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results[0].markdown?.length).toBeLessThanOrEqual(3000);
  });

  it('returns ok:false on Firecrawl error', async () => {
    searchMock.mockRejectedValue(new Error('ENOTFOUND'));
    const r = await searchBusinessInfo('whatever');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/ENOTFOUND/);
  });

  it('returns empty results when Firecrawl returns no web array', async () => {
    searchMock.mockResolvedValue({});
    const r = await searchBusinessInfo('whatever');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results).toEqual([]);
  });
});
