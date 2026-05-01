import { describe, it, expect } from 'vitest';
import { qualifyLead, type LeadInput } from '../../src/core/lead-filter.js';

const base: LeadInput = {
  business_name: 'Clínica X', email: 'info@x.es', rating: 4.5,
  review_count: 50, website: null, web_score: null,
};

describe('qualifyLead', () => {
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

  it('qualifies website with high web_score (serious technical issues)', () => {
    expect(qualifyLead({ ...base, website: 'https://x.com', web_score: 70 }).qualified).toBe(true);
  });

  it('rejects website with low web_score and no visual antiquity', () => {
    expect(qualifyLead({ ...base, website: 'https://x.com', web_score: 20 }).qualified).toBe(false);
  });

  it('rejects website that looks moderately dated but era is recent (2018-2020)', () => {
    expect(qualifyLead({
      ...base, website: 'https://x.com', web_score: 20,
      web_visual_dated: true, web_visual_era: '2018-2020',
    }).qualified).toBe(false);
  });

  it('qualifies website that is visually ancient (pre-2016)', () => {
    expect(qualifyLead({
      ...base, website: 'https://x.com', web_score: 20,
      web_visual_dated: true, web_visual_era: 'early 2010s',
    }).qualified).toBe(true);
  });

  it('qualifies visually ancient with descriptive era like "antes de la era móvil"', () => {
    expect(qualifyLead({
      ...base, website: 'https://x.com', web_score: 30,
      web_visual_dated: true, web_visual_era: 'antes de la era móvil',
    }).qualified).toBe(true);
  });
});
