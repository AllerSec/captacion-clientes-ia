import { describe, it, expect } from 'vitest';
import { analyzeHtml, extractFooterYear, composeVisualEra, type FetchResult } from '../../src/core/web-analyzer.js';

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

describe('extractFooterYear', () => {
  const now = new Date('2026-05-05');

  it('finds simple © 2011', () => {
    expect(extractFooterYear('<footer>© 2011 Clínica X</footer>', now)).toBe(2011);
  });

  it('finds &copy; entity', () => {
    expect(extractFooterYear('<p>&copy; 2014 todos los derechos reservados</p>', now)).toBe(2014);
  });

  it('finds range and returns oldest year', () => {
    expect(extractFooterYear('<footer>© 2008-2024 Empresa SL</footer>', now)).toBe(2008);
  });

  it('finds "Copyright 2012" without ©', () => {
    expect(extractFooterYear('<div>Copyright 2012 Asesoría Pérez</div>', now)).toBe(2012);
  });

  it('returns null when no year present', () => {
    expect(extractFooterYear('<footer>Todos los derechos reservados</footer>', now)).toBeNull();
  });

  it('ignores implausible years', () => {
    expect(extractFooterYear('<footer>© 1850 Museum</footer>', now)).toBeNull();
    expect(extractFooterYear('<footer>© 2099 Future</footer>', now)).toBeNull();
  });

  it('prefers footer-region year over a top-of-doc year', () => {
    const html = 'top © 2024 modern-banner ' + 'x'.repeat(2000) + '<footer>© 2011</footer>';
    expect(extractFooterYear(html, now)).toBe(2011);
  });

  it('returns null on empty input', () => {
    expect(extractFooterYear('', now)).toBeNull();
  });
});

describe('composeVisualEra', () => {
  it('era + year (era looks old) → era (footer: ©year)', () => {
    expect(composeVisualEra('early 2010s', 2011)).toBe('early 2010s (footer: ©2011)');
  });

  it('era + year (era looks modern) → "but footer:"', () => {
    expect(composeVisualEra('modern', 2011)).toBe('modern but footer: ©2011');
  });

  it('era only → era unchanged', () => {
    expect(composeVisualEra('early 2010s', null)).toBe('early 2010s');
  });

  it('year only → footer: ©year', () => {
    expect(composeVisualEra(null, 2011)).toBe('footer: ©2011');
  });

  it('both null → null', () => {
    expect(composeVisualEra(null, null)).toBeNull();
  });
});
