import { describe, it, expect } from 'vitest';
import { buildUserPrompt, htmlToText, pickVariant } from '../../src/core/email-composer.js';

describe('buildUserPrompt', () => {
  it('contains business name, rating, and issues', () => {
    const p = buildUserPrompt({
      business_name: 'Clínica Dental García',
      category: 'clínica dental',
      city: 'Bilbao',
      rating: 4.8,
      review_count: 130,
      website: 'https://x.com',
      web_issues: ['not_responsive', 'slow'],
    });
    expect(p).toContain('Clínica Dental García');
    expect(p).toContain('4.8');
    expect(p).toContain('130');
    expect(p).toContain('not_responsive');
  });

  it('flags no_website case', () => {
    const p = buildUserPrompt({
      business_name: 'X', category: null, city: null,
      rating: 4.5, review_count: 30, website: null, web_issues: ['no_website'],
    });
    expect(p.toLowerCase()).toContain('no tienen web');
  });
});

describe('htmlToText', () => {
  it('strips tags and decodes basic entities', () => {
    expect(htmlToText('<p>Hola <b>mundo</b></p>')).toBe('Hola mundo');
  });
});

describe('pickVariant', () => {
  it('picks weighted variant deterministically with seed', () => {
    const variants = [
      { id: '1', name: 'a', prompt_snippet: '', weight: 1 },
      { id: '2', name: 'b', prompt_snippet: '', weight: 9 },
    ];
    const counts: Record<string, number> = { '1': 0, '2': 0 };
    for (let i = 0; i < 1000; i++) counts[pickVariant(variants)!.id]++;
    expect(counts['2']).toBeGreaterThan(800);
  });

  it('returns null on empty list', () => {
    expect(pickVariant([])).toBeNull();
  });
});
