import { describe, it, expect } from 'vitest';
import { validateGeneratedEmail } from '../../src/core/email-validator.js';

const sig = `<p>¡Un saludo! Unax<br>unaxaller.com · Irún</p>`;
const offer = `<p>Os preparo una web de prueba <b>gratis y sin compromiso</b> para que veáis cómo quedaría la vuestra.</p>`;
const cta = `<p>¿Os la paso?</p>`;
const intro = `<p>Hola,</p><p>Te lo cuento muy rápido que sé que estáis liados.</p><p>Soy Unax, desarrollador web de Irún. Busqué talleres en Google Maps por la zona y no os encontré web, así que os escribo.</p>`;
const wholeBody = () => `${intro}${offer}${cta}${sig}`;

describe('validateGeneratedEmail', () => {
  it('passes a clean no_web email', () => {
    const r = validateGeneratedEmail({
      subject: 'Pregunta muy rápida',
      body: wholeBody(),
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(true);
  });

  it('fails when subject is not "Pregunta muy rápida"', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: wholeBody(),
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/pregunta muy r/i);
  });

  it('fails when subject contains "móvil"', () => {
    const r = validateGeneratedEmail({
      subject: 'web móvil',
      body: wholeBody(),
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/subject.*móvil/i);
  });

  it('fails when body claims "no HTTPS"', () => {
    const r = validateGeneratedEmail({
      subject: 'Pregunta muy rápida',
      body: `${intro}<p>Vi que no tenéis HTTPS.</p>${offer}${cta}${sig}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when more than one <b>', () => {
    const r = validateGeneratedEmail({
      subject: 'Pregunta muy rápida',
      body: `<p><b>Hola</b></p>${offer}${cta}${sig}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when signature missing', () => {
    const r = validateGeneratedEmail({
      subject: 'Pregunta muy rápida',
      body: `${intro}${offer}${cta}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when bold does not wrap "gratis y sin compromiso"', () => {
    const r = validateGeneratedEmail({
      subject: 'Pregunta muy rápida',
      body: `${intro}<p>Os preparo una web <b>gratis</b> y sin compromiso.</p>${cta}${sig}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });
});
