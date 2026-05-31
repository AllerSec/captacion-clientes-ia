import { describe, it, expect } from 'vitest';
import { validateGeneratedEmail, validateSequence } from '../../src/core/email-validator.js';

// Email 1 válido en el NUEVO diseño (2026-05-31): SIN precio, empieza con el saludo,
// nombra al competidor, lleva el enlace del caso, NO lleva unaxaller.com (va en el FU2).
const validInitial = [
  '<p style="margin:0 0 10px 0">Hola, Taller X:</p>',
  '<p style="margin:0 0 10px 0">Si alguien busca taller en Donostia, encuentra a <b>Competidor SL</b> y a ti no, porque no tienes web. Esas llamadas se las llevan.</p>',
  '<p style="margin:0 0 10px 0">A otro taller le hice la web (<a href="https://motosarretxe.com">motosarretxe.com</a>) y dejó de perderlas. Lo mismo haría por ti.</p>',
  '<p style="margin:0 0 10px 0">¿Te paso ese ejemplo y te cuento cómo lo haría con el tuyo?</p>',
  '<p style="margin:0 0 10px 0">Un saludo,<br>Unax</p>',
].join('\n');

const validSubject = 'taller en Donostia';

const fu1 = '<p style="margin:0 0 10px 0">Cuando alguien te busca en Google y no sales, ni te ve. Llama al primero que aparece. ¿Miro tu caso?</p><p style="margin:0 0 10px 0">Unax</p>';
const fu2 = '<p style="margin:0 0 10px 0">Mejor que contártelo, que lo veas: tienes ejemplos de talleres como el tuyo en <a href="https://unaxaller.com">unaxaller.com</a>. ¿Le echas un ojo?</p>';
const fu3 = '<p style="margin:0 0 10px 0">Lo pongo fácil: empiezas sin poner nada y son <b>149€/mes</b>, como el gestor. El primer mes va a prueba: si no te trae más llamadas, no lo pagas. ¿Te enseño cómo quedaría?</p><p style="margin:0 0 10px 0">Unax</p>';
const fu4 = '<p style="margin:0 0 10px 0">Lo dejo aquí, este es mi último correo. Respóndeme con un número:</p><p style="margin:0 0 10px 0">1 = me interesa<br>2 = ahora no<br>3 = déjalo</p><p style="margin:0 0 10px 0">Un abrazo, Unax</p>';

const validSequence = {
  subject: validSubject,
  bodies: [validInitial, fu1, fu2, fu3, fu4],
  scenario: 'no_web' as const,
  requiredExampleUrl: 'motosarretxe.com',
  requiredCompetitorName: 'Competidor SL',
};

describe('validateGeneratedEmail (email 1)', () => {
  it('acepta un email inicial válido (sin precio, con caso y competidor)', () => {
    const r = validateGeneratedEmail({
      subject: validSubject, body: validInitial, scenario: 'no_web', details: [],
      requiredExampleUrl: 'motosarretxe.com', requiredCompetitorName: 'Competidor SL',
    });
    expect(r.ok).toBe(true);
  });

  it('rechaza precio en el email 1 (debe ir en el FU3)', () => {
    const withPrice = validInitial.replace('no tienes web.', 'no tienes web. Son 149€/mes.');
    const r = validateGeneratedEmail({ subject: validSubject, body: withPrice, scenario: 'no_web', details: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /precio/i.test(e))).toBe(true);
  });

  it('rechaza unaxaller.com en el email 1 (va en el FU2)', () => {
    const withSig = validInitial.replace('<br>Unax</p>', '<br>Unax · <a href="https://unaxaller.com">unaxaller.com</a></p>');
    const r = validateGeneratedEmail({ subject: validSubject, body: withSig, scenario: 'no_web', details: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /unaxaller/i.test(e))).toBe(true);
  });

  it('rechaza asunto con precio', () => {
    const r = validateGeneratedEmail({ subject: 'web por 149€', body: validInitial, scenario: 'no_web', details: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /subject.*precio/i.test(e))).toBe(true);
  });

  it('rechaza asunto demasiado largo', () => {
    const r = validateGeneratedEmail({
      subject: 'presencia en google para superar a la competencia local ya',
      body: validInitial, scenario: 'no_web', details: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /largo/i.test(e))).toBe(true);
  });

  it('rechaza frase inventada conocida', () => {
    const bad = validInitial.replace('porque no tienes web.', 'porque no tienes web. ¿Cuánta gente os busca?');
    const r = validateGeneratedEmail({ subject: validSubject, body: bad, scenario: 'no_web', details: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /inventada/i.test(e))).toBe(true);
  });

  it('NO confunde "automóviles" con "móvil" (falso positivo)', () => {
    const conAuto = validInitial.replace('taller en Donostia', 'taller de automóviles en Donostia');
    const r = validateGeneratedEmail({
      subject: validSubject, body: conAuto, scenario: 'no_web', details: [],
      requiredExampleUrl: 'motosarretxe.com', requiredCompetitorName: 'Competidor SL',
    });
    expect(r.ok).toBe(true);
  });

  it('rechaza "móvil" (teléfono) sin justificación en details', () => {
    const bad = validInitial.replace('no tienes web.', 'tu web no se ve bien en el móvil.');
    const r = validateGeneratedEmail({ subject: validSubject, body: bad, scenario: 'no_web', details: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /móvil/i.test(e))).toBe(true);
  });

  it('rechaza HTTPS como palabra suelta', () => {
    const bad = validInitial.replace('no tienes web', 'no tienes HTTPS');
    const r = validateGeneratedEmail({ subject: validSubject, body: bad, scenario: 'no_web', details: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /HTTPS/i.test(e))).toBe(true);
  });

  it('rechaza si no menciona al competidor requerido', () => {
    const noComp = validInitial.replace('<b>Competidor SL</b>', 'los primeros');
    const r = validateGeneratedEmail({
      subject: validSubject, body: noComp, scenario: 'no_web', details: [],
      requiredCompetitorName: 'Competidor SL',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /competidor/i.test(e))).toBe(true);
  });

  it('rechaza si no menciona la URL del caso', () => {
    const noUrl = validInitial.replace('<a href="https://motosarretxe.com">motosarretxe.com</a>', 'una web');
    const r = validateGeneratedEmail({
      subject: validSubject, body: noUrl, scenario: 'no_web', details: [],
      requiredExampleUrl: 'motosarretxe.com',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /URL de ejemplo/i.test(e))).toBe(true);
  });

  it('rechaza body que no empieza con el saludo', () => {
    const bad = '<p>¿Sabías algo?</p>' + validInitial;
    const r = validateGeneratedEmail({ subject: validSubject, body: bad, scenario: 'no_web', details: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /empezar con/i.test(e))).toBe(true);
  });
});

describe('validateSequence', () => {
  it('acepta una secuencia válida de 5 cuerpos', () => {
    const r = validateSequence(validSequence);
    expect(r.ok).toBe(true);
  });

  it('rechaza si no hay 5 cuerpos', () => {
    const r = validateSequence({ ...validSequence, bodies: validSequence.bodies.slice(0, 3) });
    expect(r.ok).toBe(false);
  });

  it('rechaza recordatorio vacío en un follow-up', () => {
    const badFu = '<p style="margin:0 0 10px 0">Hola otra vez, ¿visteis mi correo? Un saludo.</p><p>Unax</p>';
    const r = validateSequence({ ...validSequence, bodies: [validInitial, badFu, fu2, fu3, fu4] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /recordatorio vacío/i.test(e))).toBe(true);
  });

  it('rechaza precio fuera del FU3', () => {
    const fu1WithPrice = '<p style="margin:0 0 10px 0">Son 149€/mes, una ganga. ¿Miro tu caso?</p><p>Unax</p>';
    const r = validateSequence({ ...validSequence, bodies: [validInitial, fu1WithPrice, fu2, fu3, fu4] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /precio/i.test(e))).toBe(true);
  });

  it('rechaza FU3 sin precio', () => {
    const fu3NoPrice = '<p style="margin:0 0 10px 0">Va con garantía, probarlo no cuesta nada. ¿Lo hablamos?</p><p>Unax</p>';
    const r = validateSequence({ ...validSequence, bodies: [validInitial, fu1, fu2, fu3NoPrice, fu4] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /FU3.*precio/i.test(e))).toBe(true);
  });

  it('rechaza follow-up demasiado largo', () => {
    const longFu = '<p style="margin:0 0 10px 0">' + 'palabra '.repeat(95) + '</p><p>Unax</p>';
    const r = validateSequence({ ...validSequence, bodies: [validInitial, longFu, fu2, fu3, fu4] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /largo/i.test(e))).toBe(true);
  });
});
