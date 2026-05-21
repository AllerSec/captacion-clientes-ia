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
  // Quita las URLs href="https://..." y luego busca "https" como palabra suelta.
  const stripped = body.replace(/href="https?:\/\/[^"]*"/gi, '');
  return /\bhttps\b/i.test(stripped);
}

const SIGNATURE_RX = /unaxaller\.com/i;
// Subject debe mencionar "Presencia en Google" y "{NOMBRE_NEGOCIO}" o "competencia" (fallback).
const EXPECTED_SUBJECT_RX = /presencia en google/i;

export function validateGeneratedEmail(input: ValidateInput): ValidateResult {
  const errors: string[] = [];
  const subj = input.subject.trim();
  const body = input.body;
  const detailsMentionMobile = input.details.some(d => /móvil/i.test(d));

  if (subj.length === 0) errors.push('subject: vacío');
  if (!EXPECTED_SUBJECT_RX.test(subj)) errors.push('subject: debe contener "Presencia en Google"');
  if (/móvil/i.test(subj)) errors.push('subject: contiene "móvil" (prohibido)');

  for (const rx of FORBIDDEN_TECH) {
    if (rx.test(body)) {
      errors.push(`body: afirmación técnica prohibida (${rx.source})`);
    }
  }
  if (bodyMentionsHttpsAsWord(body)) {
    errors.push('body: contiene "HTTPS" como palabra suelta');
  }

  if (/móvil/i.test(body) && !detailsMentionMobile) {
    errors.push('body: contiene "móvil" pero details no lo justifica');
  }

  // El nuevo formato Renting Web tiene 3 bullets en negrita + posiblemente "Renting Web"
  // + competidor en negrita. Pedimos al menos los tres anchors de la oferta.
  if (!/<b>0€ de pago inicial:?<\/b>/i.test(body)) {
    errors.push('body: falta el bullet "<b>0€ de pago inicial:</b>"');
  }
  if (!/<b>Cuota fija de 149€\/mes/i.test(body)) {
    errors.push('body: falta el bullet "<b>Cuota fija de 149€/mes..."');
  }
  if (!/<b>Garantía de 30 días:?<\/b>/i.test(body)) {
    errors.push('body: falta el bullet "<b>Garantía de 30 días:</b>"');
  }

  if (!SIGNATURE_RX.test(body)) errors.push('body: firma no encontrada');

  // El body DEBE empezar con el saludo. No se permiten líneas antes (preguntas
  // tipo "¿Cuánta gente os busca?" que Claude se inventa).
  const trimmedBody = body.trimStart();
  if (!/^<p[^>]*>Hola, equipo de /i.test(trimmedBody)) {
    errors.push('body: debe empezar con "<p>Hola, equipo de ..." (sin líneas extra antes)');
  }

  // Solo UN párrafo de caso de éxito. Si el modelo lo duplica ("Hace poco trabajé..."
  // dos veces, una inventada y otra del template), rechazar.
  const caseStudyMatches = body.match(/Hace poco trabaj[eé]/gi) ?? [];
  if (caseStudyMatches.length > 1) {
    errors.push(`body: aparece "Hace poco trabajé" ${caseStudyMatches.length} veces (debe ser 1)`);
  }

  // Frases inventadas conocidas que Claude tiende a meter — bloquear.
  const FORBIDDEN_PHRASES = [
    /¿Cu[aá]nta gente os busca/i,
    /He montado web a otr/i,
    /s[eé] qu[eé] tipo de cosas mueven la aguja/i,
    /s[eé] qu[eé] cosas mueven la aguja/i,
  ];
  for (const rx of FORBIDDEN_PHRASES) {
    if (rx.test(body)) {
      errors.push(`body: contiene frase inventada (${rx.source})`);
    }
  }

  if (input.requiredExampleUrl) {
    const escaped = input.requiredExampleUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(escaped, 'i').test(body)) {
      errors.push(`body: no menciona la URL de ejemplo "${input.requiredExampleUrl}"`);
    }
  }

  if (input.requiredCompetitorName) {
    const escaped = input.requiredCompetitorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(escaped, 'i').test(body)) {
      errors.push(`body: no menciona al competidor "${input.requiredCompetitorName}"`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
