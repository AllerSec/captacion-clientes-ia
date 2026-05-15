import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/firecrawl.js', () => ({
  searchBusinessInfo: vi.fn(),
}));
vi.mock('../../src/services/claude.js', () => ({
  judgeEnrichment: vi.fn(),
}));

import { searchBusinessInfo } from '../../src/services/firecrawl.js';
import { judgeEnrichment } from '../../src/services/claude.js';
import { enrichLead } from '../../src/services/lead-enricher.js';

const searchMock = vi.mocked(searchBusinessInfo);
const judgeMock = vi.mocked(judgeEnrichment);

beforeEach(() => {
  searchMock.mockReset();
  judgeMock.mockReset();
});

describe('enrichLead', () => {
  it('returns has_real_website when judge finds own domain', async () => {
    searchMock.mockResolvedValue({
      ok: true, query: 'Taller X Bilbao',
      results: [{ url: 'https://tallerx.es', title: 'Taller X', description: 'Bilbao' }],
      durationMs: 1200,
    });
    judgeMock.mockResolvedValue({
      has_real_website: true,
      website_url: 'https://tallerx.es',
      email: null,
      reasoning: 'web propia con horarios',
    });

    const r = await enrichLead({
      business_name: 'Taller X', city: 'Bilbao', province: null, category: 'taller mecánico',
    });
    expect(r.kind).toBe('has_real_website');
    if (r.kind !== 'has_real_website') return;
    expect(r.website_url).toBe('https://tallerx.es');
  });

  it('returns email_found when judge finds only RRSS + email', async () => {
    searchMock.mockResolvedValue({
      ok: true, query: 'q',
      results: [{ url: 'https://instagram.com/x', description: 'info@x.es' }],
      durationMs: 800,
    });
    judgeMock.mockResolvedValue({
      has_real_website: false,
      website_url: null,
      email: 'info@x.es',
      reasoning: 'solo RRSS, email en bio',
    });

    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('email_found');
    if (r.kind !== 'email_found') return;
    expect(r.email).toBe('info@x.es');
  });

  it('returns nothing_found when judge has no email and no real website', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [], durationMs: 200 });
    judgeMock.mockResolvedValue({
      has_real_website: false, website_url: null, email: null, reasoning: 'no info',
    });
    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('nothing_found');
  });

  it('returns error when Firecrawl fails', async () => {
    searchMock.mockResolvedValue({ ok: false, query: 'q', error: 'ENOTFOUND', durationMs: 100 });
    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error).toMatch(/ENOTFOUND/);
    expect(judgeMock).not.toHaveBeenCalled();
  });

  it('returns error when Claude throws', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [{ url: 'https://a.b' }], durationMs: 500 });
    judgeMock.mockRejectedValue(new Error('claude boom'));
    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error).toMatch(/claude boom/);
  });

  it('rejects malformed email returned by Claude (noreply@)', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [{ url: 'https://a.b' }], durationMs: 500 });
    judgeMock.mockResolvedValue({
      has_real_website: false, website_url: null,
      email: 'noreply@a.b', reasoning: 'meh',
    });
    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('nothing_found');
  });

  it('builds the query as "name city" when city present', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [], durationMs: 100 });
    judgeMock.mockResolvedValue({ has_real_website: false, website_url: null, email: null, reasoning: '' });
    await enrichLead({ business_name: 'Taller X', city: 'Bilbao', province: 'Bizkaia', category: null });
    expect(searchMock).toHaveBeenCalledWith('Taller X Bilbao');
  });

  it('falls back to just name when city is null', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [], durationMs: 100 });
    judgeMock.mockResolvedValue({ has_real_website: false, website_url: null, email: null, reasoning: '' });
    await enrichLead({ business_name: 'Taller X', city: null, province: null, category: null });
    expect(searchMock).toHaveBeenCalledWith('Taller X');
  });
});
