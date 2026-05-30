import { describe, it, expect, beforeEach } from 'vitest';
import {
  isScrapeRunning, tryAcquireScrape, releaseScrape, getScrapeStartedAt,
} from '../../src/core/scrape-lock.js';

beforeEach(() => releaseScrape());

describe('scrape-lock', () => {
  it('empieza libre', () => {
    expect(isScrapeRunning()).toBe(false);
    expect(getScrapeStartedAt()).toBe(null);
  });

  it('adquiere el candado y marca running + startedAt', () => {
    expect(tryAcquireScrape(1000)).toBe(true);
    expect(isScrapeRunning()).toBe(true);
    expect(getScrapeStartedAt()).toBe(1000);
  });

  it('no permite doble adquisición', () => {
    expect(tryAcquireScrape()).toBe(true);
    expect(tryAcquireScrape()).toBe(false); // ya ocupado
  });

  it('release libera y permite volver a adquirir', () => {
    tryAcquireScrape();
    releaseScrape();
    expect(isScrapeRunning()).toBe(false);
    expect(tryAcquireScrape()).toBe(true);
  });
});
