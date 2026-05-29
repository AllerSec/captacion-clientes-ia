import { describe, it, expect } from 'vitest';
import { validateGeneratedEmail, validateSequence } from '../../src/core/email-validator.js';

const sig = `<p style="margin:0 0 8px 0">Un saludo,<br>Unax Aller<br><a href="https://unaxaller.com">unaxaller.com</a> · Irún</p>`;
const cta = `<p style="margin:0 0 8px 0">Si os interesa y queréis que os explique, decidme qué día os va bien que os llame.</p>`;
const bullets = `<p style="margin:0 0 4px 0"><b>0€ de pago inicial:</b> No desembolsáis nada.</p><p style="margin:0 0 4px 0"><b>Cuota fija de 149€/mes (como el gestor):</b> Incluye la web, hosting, posicionamiento, reseñas y soporte WhatsApp.</p><p style="margin:0 0 8px 0"><b>Garantía de 30 días:</b> Si no os convence, os devuelvo el dinero.</p>`;
const intro = `<p style="margin:0 0 8px 0">Hola, equipo de Taller X:</p><p style="margin:0 0 8px 0">Soy Unax, desarrollador web en Irún. Buscando talleres en Bilbao he visto que <b>Taller Juanjo</b> aparece por encima.</p>`;
const offerLead = `<p style="margin:0 0 8px 0">Las agencias os piden 2.000€ de golpe. Yo trabajo con <b>Renting Web</b>:</p>`;
const wholeBody = () => `${intro}${offerLead}${bullets}${cta}${sig}`;
const validSubject = 'Presencia en Google para Taller X: Cómo superar a Taller Juanjo sin pagar miles de euros de golpe';

describe('validateGeneratedEmail', () => {
  it('passes a clean Renting Web email', () => {
    const r = validateGeneratedEmail({
      subject: validSubject,
      body: wholeBody(),
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(true);
  });

  it('fails when subject does not contain "Presencia en Google"', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: wholeBody(),
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/presencia en google/i);
  });

  it('fails when subject contains "móvil"', () => {
    const r = validateGeneratedEmail({
      subject: 'Presencia en Google web móvil',
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
      subject: validSubject,
      body: `${intro}<p>Vi que no tenéis HTTPS.</p>${offerLead}${bullets}${cta}${sig}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when 0€ bullet is missing', () => {
    const wrongBullets = bullets.replace('<b>0€ de pago inicial:</b>', '0€ de pago inicial:');
    const r = validateGeneratedEmail({
      subject: validSubject,
      body: `${intro}${offerLead}${wrongBullets}${cta}${sig}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when 149€/mes bullet is missing', () => {
    const wrongBullets = bullets.replace(/<b>Cuota fija de 149€\/mes[^<]*<\/b>/, '');
    const r = validateGeneratedEmail({
      subject: validSubject,
      body: `${intro}${offerLead}${wrongBullets}${cta}${sig}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when garantía bullet is missing', () => {
    const wrongBullets = bullets.replace('<b>Garantía de 30 días:</b>', 'Garantía de 30 días:');
    const r = validateGeneratedEmail({
      subject: validSubject,
      body: `${intro}${offerLead}${wrongBullets}${cta}${sig}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when signature missing', () => {
    const r = validateGeneratedEmail({
      subject: validSubject,
      body: `${intro}${offerLead}${bullets}${cta}`,
      scenario: 'no_web',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when requiredCompetitorName is set but body omits it', () => {
    const bodyNoCompetitor = wholeBody().replace(/Taller Juanjo/g, 'otro');
    const r = validateGeneratedEmail({
      subject: validSubject,
      body: bodyNoCompetitor,
      scenario: 'no_web',
      details: [],
      requiredCompetitorName: 'Taller Juanjo',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/competidor/i);
  });

  it('passes when requiredCompetitorName matches', () => {
    const r = validateGeneratedEmail({
      subject: validSubject,
      body: wholeBody(),
      scenario: 'no_web',
      details: [],
      requiredCompetitorName: 'Taller Juanjo',
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateSequence', () => {
  const fu = (n: number) => `<p style="margin:0 0 8px 0">Hola:</p><p style="margin:0 0 8px 0">Apunte ${n}: sin web os ven menos. Se arregla sin pagar nada. ¿Lo vemos?</p><p style="margin:0 0 8px 0">Unax · <a href="https://unaxaller.com">unaxaller.com</a></p>`;
  const goodBodies = () => [wholeBody(), fu(1), fu(2), fu(3), fu(4)];

  it('passes a clean 5-email sequence', () => {
    const r = validateSequence({ subject: validSubject, bodies: goodBodies(), scenario: 'no_web' });
    expect(r.ok).toBe(true);
  });

  it('fails if there are not exactly 5 bodies', () => {
    const r = validateSequence({ subject: validSubject, bodies: [wholeBody()], scenario: 'no_web' });
    expect(r.ok).toBe(false);
  });

  it('fails when a follow-up is missing the signature', () => {
    const bodies = goodBodies();
    bodies[2] = `<p style="margin:0 0 8px 0">Hola:</p><p>Sin firma aquí.</p>`;
    const r = validateSequence({ subject: validSubject, bodies, scenario: 'no_web' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/email3.*firma/i);
  });

  it('fails when a follow-up uses an empty-reminder phrase', () => {
    const bodies = goodBodies();
    bodies[1] = `<p style="margin:0 0 8px 0">Hola:</p><p>¿Visteis mi correo de la semana pasada?</p><p>Unax · <a href="https://unaxaller.com">unaxaller.com</a></p>`;
    const r = validateSequence({ subject: validSubject, bodies, scenario: 'no_web' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/email2.*recordatorio/i);
  });

  it('propagates strict errors from the initial email (body[0])', () => {
    const bodies = goodBodies();
    bodies[0] = bodies[0].replace('<b>0€ de pago inicial:</b>', '0€ de pago inicial:');
    const r = validateSequence({ subject: validSubject, bodies, scenario: 'no_web' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/email1/i);
  });
});
