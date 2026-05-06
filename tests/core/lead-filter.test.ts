import { describe, it, expect } from 'vitest';
import { qualifyLead, type LeadInput } from '../../src/core/lead-filter.js';

const base: LeadInput = {
  business_name: 'Clínica X', email: 'info@x.es', rating: 4.5,
  review_count: 50, website: null, web_score: null,
};

describe('qualifyLead — gates de reputación / contacto', () => {
  it('qualifies a no-website lead with good reputation', () => {
    expect(qualifyLead(base).qualified).toBe(true);
  });

  it('rejects low rating', () => {
    expect(qualifyLead({ ...base, rating: 3.5 }).qualified).toBe(false);
  });

  it('rejects too few reviews', () => {
    expect(qualifyLead({ ...base, review_count: 10 }).qualified).toBe(false);
  });

  it('rejects missing email', () => {
    expect(qualifyLead({ ...base, email: null }).qualified).toBe(false);
  });

  it('rejects noreply emails', () => {
    expect(qualifyLead({ ...base, email: 'noreply@x.com' }).qualified).toBe(false);
  });

  it('rejects blacklist brands', () => {
    expect(qualifyLead({ ...base, business_name: 'Vital Dent Bilbao' }).qualified).toBe(false);
    expect(qualifyLead({ ...base, business_name: 'Quirónsalud' }).qualified).toBe(false);
  });
});

describe('qualifyLead — footer year gate (web antigua)', () => {
  it('qualifies website with footer year <= 2018', () => {
    const r = qualifyLead({ ...base, website: 'https://x.com', footer_year: 2014 });
    expect(r.qualified).toBe(true);
  });

  it('qualifies edge case footer year = 2018', () => {
    const r = qualifyLead({ ...base, website: 'https://x.com', footer_year: 2018 });
    expect(r.qualified).toBe(true);
  });

  it('disqualifies website with footer year > 2018', () => {
    const r = qualifyLead({ ...base, website: 'https://x.com', footer_year: 2022 });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('web_too_recent');
  });

  it('disqualifies website with no footer year proof', () => {
    const r = qualifyLead({ ...base, website: 'https://x.com', footer_year: null });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('no_year_proof');
  });

  it('no_year_proof is independent of web_score (we do not infer antiquity from tech issues)', () => {
    const r = qualifyLead({ ...base, website: 'https://x.com', web_score: 90, footer_year: null });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('no_year_proof');
  });

  it('no website beats footer year (no website always qualifies)', () => {
    const r = qualifyLead({ ...base, website: null, footer_year: 2024 });
    expect(r.qualified).toBe(true);
  });
});
