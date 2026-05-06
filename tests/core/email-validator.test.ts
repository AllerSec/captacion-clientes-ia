import { describe, it, expect } from 'vitest';
import { validateGeneratedEmail } from '../../src/core/email-validator.js';

const sig = `<p>Unax<br>unaxaller.com<br>Irún</p>`;
const offer = `<p><b>Os preparo una propuesta visual de cómo podría quedar la web, gratis y sin compromiso</b>. Si os gusta, hablamos. Si no, ahí queda.</p>`;
const cta = `<p>¿Os interesa que os la pase? Se ve en un minuto.</p>`;
const intro = (extra = '') => `<p>Hola,</p><p>He abierto vuestra web. El footer pone ©2014.${extra}</p>`;
const wholeBody = (extra = '') => `${intro(extra)}${offer}${cta}${sig}`;

describe('validateGeneratedEmail', () => {
  it('passes a clean old_website email', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: wholeBody(),
      scenario: 'old_website',
      details: ['tipografía pequeña'],
    });
    expect(r.ok).toBe(true);
  });

  it('fails when subject contains "móvil"', () => {
    const r = validateGeneratedEmail({
      subject: 'web móvil',
      body: wholeBody(),
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/subject.*móvil/i);
  });

  it('fails when body claims "no HTTPS"', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: wholeBody(' Vi que no tenéis HTTPS y eso da mala imagen.'),
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when body claims "carga lenta"', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: wholeBody(' La carga lenta no ayuda.'),
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('allows "móvil" in body if details list mentions it', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: wholeBody(' Layout anterior al móvil.'),
      scenario: 'old_website',
      details: ['diseño anterior al móvil'],
    });
    expect(r.ok).toBe(true);
  });

  it('forbids "móvil" in body when details list does not mention it', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: wholeBody(' En móvil se ve mal.'),
      scenario: 'old_website',
      details: ['tipografía pequeña'],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when more than one <b>', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: `<p><b>Hola</b></p>${offer}${cta}${sig}`,
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when signature missing', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: `<p>Hola</p>${offer}${cta}`,
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when subject has more than 4 words', () => {
    const r = validateGeneratedEmail({
      subject: 'una propuesta rápida para vuestra web',
      body: wholeBody(),
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when subject contains uppercase', () => {
    const r = validateGeneratedEmail({
      subject: 'Vuestra web',
      body: wholeBody(),
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });
});
