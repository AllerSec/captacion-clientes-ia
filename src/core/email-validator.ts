export interface ValidateInput {
  subject: string;
  body: string;
  scenario: 'no_web' | 'old_website';
  details: string[];   // notableAntiquatedDetails — autoriza menciones específicas
  requiredExampleUrl?: string | null;
  requiredCompetitorName?: string | null;
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: string[] };

// Mencionar "HTTPS" como palabra suelta queda raro. Permitido dentro de href="https://...".
const FORBIDDEN_TECH = [
  /carga\s*lenta/i,
  /web\s*lenta/i,
  /carga\s*pesada/i,
  /no\s*responsive/i,
  /no\s*es\s*responsive/i,
  /no\s*est[áa]\s*optimi/i,
];

function bodyMentionsHttpsAsWord(body: string): boolean {
  const stripped = body.replace(/href="https?:\/\/[^"]*"/gi, '');
  return /\bhttps\b/i.test(stripped);
}

// El precio (0€ / 149€) NO debe aparecer en el email 1 ni en FU1/FU2/FU4.
// Solo se permite en el FU3 (email4_body). El email 1 va sin precio (decisión de
// diseño auditada 2026-05-31: el primer toque busca respuesta, no vender).
const PRICE_RX = /\b0\s*€|\b149\s*€|149\/mes|€\/mes/i;

export function validateGeneratedEmail(input: ValidateInput): ValidateResult {
  const errors: string[] = [];
  const subj = input.subject.trim();
  const body = input.body;
  const detailsMentionMobile = input.details.some(d => /móvil/i.test(d));

  if (subj.length === 0) errors.push('subject: vacío');
  // Asunto corto estilo interno (2-5 palabras). No debe parecer venta ni llevar precio.
  if (subj.split(/\s+/).length > 6) errors.push('subject: demasiado largo (máx ~5 palabras)');
  if (PRICE_RX.test(subj)) errors.push('subject: no debe contener precio');

  for (const rx of FORBIDDEN_TECH) {
    if (rx.test(body)) errors.push(`body: afirmación técnica prohibida (${rx.source})`);
  }
  if (bodyMentionsHttpsAsWord(body)) errors.push('body: contiene "HTTPS" como palabra suelta');
  if (/móvil/i.test(body) && !detailsMentionMobile) {
    errors.push('body: contiene "móvil" pero details no lo justifica');
  }

  // Email 1: SIN precio (va en el FU3).
  if (PRICE_RX.test(body)) {
    errors.push('body(email1): no debe mencionar precio (0€/149€); el precio va en el FU3');
  }

  // Email 1: UN solo enlace, el del caso. NO debe llevar unaxaller.com (ese va en el FU2).
  if (/unaxaller\.com/i.test(body)) {
    errors.push('body(email1): no debe llevar unaxaller.com (ese enlace va en el FU2)');
  }

  // Debe empezar con el saludo, sin líneas inventadas antes.
  const trimmedBody = body.trimStart();
  if (!/^<p[^>]*>Hola, equipo de /i.test(trimmedBody)) {
    errors.push('body: debe empezar con "<p>Hola, equipo de ..." (sin líneas extra antes)');
  }

  // Frases inventadas conocidas que Claude tiende a meter.
  const FORBIDDEN_PHRASES = [
    /¿Cu[aá]nta gente os busca/i,
    /He montado web a otr/i,
    /s[eé] qu[eé] tipo de cosas mueven la aguja/i,
    /s[eé] qu[eé] cosas mueven la aguja/i,
  ];
  for (const rx of FORBIDDEN_PHRASES) {
    if (rx.test(body)) errors.push(`body: contiene frase inventada (${rx.source})`);
  }

  // El email 1 DEBE incluir el enlace del caso (prueba) si hay ejemplo de sector.
  if (input.requiredExampleUrl) {
    const escaped = input.requiredExampleUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(escaped, 'i').test(body)) {
      errors.push(`body: no menciona la URL de ejemplo "${input.requiredExampleUrl}"`);
    }
  }

  // Y DEBE nombrar al competidor real.
  if (input.requiredCompetitorName) {
    const escaped = input.requiredCompetitorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(escaped, 'i').test(body)) {
      errors.push(`body: no menciona al competidor "${input.requiredCompetitorName}"`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export interface ValidateSequenceInput {
  subject: string;
  bodies: string[];   // [email inicial, follow-up 1..4]
  scenario: 'no_web' | 'old_website';
  requiredExampleUrl?: string | null;
  requiredCompetitorName?: string | null;
}

// Frases de "recordatorio vacío" que matan la respuesta en follow-ups.
const FORBIDDEN_FOLLOWUP_PHRASES = [
  /¿?\s*vist[ei]+s mi (correo|email|mensaje)/i,
  /¿?\s*has visto mi (correo|email|mensaje)/i,
  /haciendo seguimiento/i,
  /¿?\s*recib[ií]st[ei]+s mi/i,
  /por si (no )?lo (visteis|leísteis|recibisteis|viste|leíste)/i,
  /te escribo de nuevo/i,
];

const FOLLOWUP_MAX_WORDS = 90;

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Valida la secuencia completa: email 1 con reglas del inicial (sin precio, con caso),
// y los follow-ups con sus reglas (sin recordatorios vacíos, brevedad, precio SOLO en FU3,
// unaxaller.com presente a partir del FU2).
export function validateSequence(input: ValidateSequenceInput): ValidateResult {
  const errors: string[] = [];

  if (input.bodies.length !== 5) {
    errors.push(`secuencia: se esperaban 5 cuerpos, llegaron ${input.bodies.length}`);
    return { ok: false, errors };
  }

  const initial = validateGeneratedEmail({
    subject: input.subject,
    body: input.bodies[0],
    scenario: input.scenario,
    details: [],
    requiredExampleUrl: input.requiredExampleUrl,
    requiredCompetitorName: input.requiredCompetitorName,
  });
  if (!initial.ok) errors.push(...initial.errors.map(e => `email1: ${e}`));

  for (let i = 1; i < input.bodies.length; i++) {
    const body = input.bodies[i];
    const label = `email${i + 1}`;
    const isFU3 = i === 3; // email4_body = FU3, el único con precio

    if (bodyMentionsHttpsAsWord(body)) errors.push(`${label}: contiene "HTTPS" como palabra suelta`);
    for (const rx of FORBIDDEN_TECH) {
      if (rx.test(body)) errors.push(`${label}: afirmación técnica prohibida (${rx.source})`);
    }
    for (const rx of FORBIDDEN_FOLLOWUP_PHRASES) {
      if (rx.test(body)) errors.push(`${label}: frase de recordatorio vacío prohibida (${rx.source})`);
    }
    for (const rx of SPAM_WORDS) {
      if (rx.test(body)) errors.push(`${label}: palabra que dispara spam, evítala (${rx.source})`);
    }

    // El precio solo en el FU3.
    if (PRICE_RX.test(body) && !isFU3) {
      errors.push(`${label}: no debe mencionar precio (el precio va solo en el FU3)`);
    }
    if (isFU3 && !PRICE_RX.test(body)) {
      errors.push(`${label}(FU3): debe mencionar el precio (149€/mes)`);
    }

    const words = stripTags(body).split(' ').filter(w => w.length > 0).length;
    if (words > FOLLOWUP_MAX_WORDS) {
      errors.push(`${label}: demasiado largo (${words} palabras, máx ${FOLLOWUP_MAX_WORDS})`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
