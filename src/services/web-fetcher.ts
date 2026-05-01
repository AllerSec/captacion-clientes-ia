import type { FetchResult } from '../core/web-analyzer.js';

export async function fetchWebsite(url: string, opts: { timeoutMs?: number } = {}): Promise<FetchResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadAnalyzer/1.0)' },
    });
    const html = await resp.text();
    return {
      url,
      status: resp.status,
      html,
      sizeBytes: html.length,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      html: '',
      sizeBytes: 0,
      durationMs: Date.now() - start,
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
