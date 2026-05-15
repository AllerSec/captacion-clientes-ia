import { describe, it, expect } from 'vitest';
import { qualifyLead, type LeadInput } from '../../src/core/lead-filter.js';

const base: LeadInput = {
  business_name: 'Taller X', email: 'info@x.es', rating: 4.5,
  review_count: 50, website: null,
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

describe('qualifyLead — regla de web', () => {
  it('disqualifies any lead that has a website', () => {
    const r = qualifyLead({ ...base, website: 'https://x.com' });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('has_website');
  });

  it('qualifies lead with no website', () => {
    const r = qualifyLead({ ...base, website: null });
    expect(r.qualified).toBe(true);
  });

  it('disqualifies website regardless of rating', () => {
    const r = qualifyLead({ ...base, website: 'https://x.com', rating: 5.0, review_count: 500 });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('has_website');
  });
});
