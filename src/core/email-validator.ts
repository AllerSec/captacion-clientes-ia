export interface ValidateInput {
  subject: string;
  body: string;
  scenario: 'no_web' | 'old_website';
  details: string[];   // notableAntiquatedDetails — autoriza menciones específicas
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const FORBIDDEN_TECH = [
  /\bhttps\b/i,           // cualquier mención de HTTPS quema (no es algo natural en el cuerpo)
  /carga\s*lenta/i,
  /web\s*lenta/i,
  /carga\s*pesada/i,
  /no\s*responsive/i,
  /no\s*es\s*responsive/i,
  /no\s*est[áa]\s*optimi/i,
];

const SIGNATURE_RX = /Unax\s*<br>\s*unaxaller\.com\s*<br>\s*Irún/i;

export function validateGeneratedEmail(input: ValidateInput): ValidateResult {
  const errors: string[] = [];
  const subj = input.subject.trim();
  const body = input.body;
  const detailsMentionMobile = input.details.some(d => /móvil/i.test(d));

  if (subj.length === 0) errors.push('subject: vacío');
  if (/[A-ZÁÉÍÓÚÑ]/.test(subj)) errors.push('subject: contiene mayúsculas');
  if (subj.split(/\s+/).length > 4) errors.push('subject: más de 4 palabras');
  if (/móvil/i.test(subj)) errors.push('subject: contiene "móvil" (prohibido)');
  if (/[!¡]/.test(subj)) errors.push('subject: contiene exclamación');

  for (const rx of FORBIDDEN_TECH) {
    if (rx.test(body)) {
      errors.push(`body: afirmación técnica prohibida (${rx.source})`);
    }
  }

  if (/móvil/i.test(body) && !detailsMentionMobile) {
    errors.push('body: contiene "móvil" pero details no lo justifica');
  }

  const boldCount = (body.match(/<b>/gi) ?? []).length;
  if (boldCount !== 1) errors.push(`body: ${boldCount} <b> (debe ser exactamente 1)`);

  if (boldCount === 1 && !/<b>\s*gratis y sin compromiso\s*<\/b>/i.test(body)) {
    errors.push('body: la negrita debe envolver exactamente "gratis y sin compromiso"');
  }

  if (!SIGNATURE_RX.test(body)) errors.push('body: firma no encontrada');

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
