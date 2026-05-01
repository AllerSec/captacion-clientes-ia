import { describe, it, expect } from 'vitest';
import { analyzeHtml, type FetchResult } from '../../src/core/web-analyzer.js';

const goodHtml = `<!DOCTYPE html><html><head>
  <meta name="viewport" content="width=device-width">
  <meta property="og:title" content="x">
  <link rel="icon" href="/f.ico">
  <meta name="generator" content="Next.js">
</head><body>© 2025</body></html>`;

const badHtml = `<html><head></head><body>© 2017 my old site</body></html>`;

describe('analyzeHtml', () => {
  it('clean modern site → low score', () => {
    const r = analyzeHtml({ status: 200, url: 'https://x.com', html: goodHtml, sizeBytes: 5000, durationMs: 800 });
    expect(r.score).toBeLessThan(25);
    expect(r.issues).not.toContain('not_responsive');
  });

  it('old site without viewport → high score with multiple issues', () => {
    const r = analyzeHtml({ status: 200, url: 'http://x.com', html: badHtml, sizeBytes: 5000, durationMs: 800 });
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.issues).toContain('not_responsive');
    expect(r.issues).toContain('no_https');
    expect(r.issues).toContain('old_copyright');
  });

  it('failed fetch → score 100', () => {
    const r = analyzeHtml({ status: 0, url: 'https://x.com', html: '', sizeBytes: 0, durationMs: 0, error: 'ECONNREFUSED' });
    expect(r.score).toBe(100);
    expect(r.issues).toContain('unreachable');
  });

  it('slow site → adds slow issue', () => {
    const r = analyzeHtml({ status: 200, url: 'https://x.com', html: goodHtml, sizeBytes: 5000, durationMs: 5000 });
    expect(r.issues).toContain('slow');
  });

  it('huge HTML → adds heavy issue', () => {
    const r = analyzeHtml({ status: 200, url: 'https://x.com', html: goodHtml, sizeBytes: 600_000, durationMs: 800 });
    expect(r.issues).toContain('heavy');
  });
});
