import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  loadEnv: vi.fn(() => ({ SERPER_API_KEY: 'test-key' })),
}));
vi.mock('../../src/core/health-monitor.js', () => ({
  notifyError: vi.fn(),
}));

import { searchBusinessInfo } from '../../src/services/serper.js';
import { loadEnv } from '../../src/config/env.js';
import { notifyError } from '../../src/core/health-monitor.js';

const loadEnvMock = vi.mocked(loadEnv);
const notifyMock = vi.mocked(notifyError);

beforeEach(() => {
  vi.clearAllMocks();
  loadEnvMock.mockReturnValue({ SERPER_API_KEY: 'test-key' } as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Partial<Response>>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('searchBusinessInfo (serper)', () => {
  it('maps organic results to {url,title,description}', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        organic: [
          { link: 'https://facebook.com/optica', title: 'Óptica X', snippet: 'email: hola@optica.es' },
          { link: 'https://paginasamarillas.es/x', title: 'Óptica X PA', snippet: 'tel 943...' },
          { link: '', title: 'sin url', snippet: 'se descarta' },
        ],
      }),
    }));

    const r = await searchBusinessInfo('Óptica X Bilbao');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.results).toHaveLength(2); // la de url vacía se filtra
      expect(r.results[0]).toEqual({
        url: 'https://facebook.com/optica',
        title: 'Óptica X',
        description: 'email: hola@optica.es',
      });
    }
  });

  it('returns serper_quota_exhausted and alerts on 429', async () => {
    stubFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));

    const r = await searchBusinessInfo('q');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('serper_quota_exhausted');
    expect(notifyMock).toHaveBeenCalledOnce();
    expect(notifyMock.mock.calls[0][0]).toBe('warn');
  });

  it('returns serper_quota_exhausted and alerts on 403', async () => {
    stubFetch(async () => ({ ok: false, status: 403, json: async () => ({}) }));

    const r = await searchBusinessInfo('q');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('serper_quota_exhausted');
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it('returns serper_http_<code> on other non-ok statuses without alerting', async () => {
    stubFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));

    const r = await searchBusinessInfo('q');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('serper_http_500');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('returns ok:false on network error', async () => {
    stubFetch(async () => { throw new Error('network down'); });

    const r = await searchBusinessInfo('q');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network down');
  });

  it('returns serper_no_api_key when key is missing', async () => {
    loadEnvMock.mockReturnValue({ SERPER_API_KEY: undefined } as any);

    const r = await searchBusinessInfo('q');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('serper_no_api_key');
  });

  it('handles a response with no organic array', async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }));

    const r = await searchBusinessInfo('q');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.results).toEqual([]);
  });
});
