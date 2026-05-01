import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWebsite } from '../../src/services/web-fetcher.js';

describe('fetchWebsite', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns html for 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, ok: true,
      text: () => Promise.resolve('<html><body>ok</body></html>'),
    }));
    const r = await fetchWebsite('https://x.com');
    expect(r.status).toBe(200);
    expect(r.html).toContain('ok');
  });

  it('returns error on timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await fetchWebsite('https://x.com', { timeoutMs: 100 });
    expect(r.status).toBe(0);
    expect(r.error).toBeTruthy();
  });
});
