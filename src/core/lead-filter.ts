export interface LeadInput {
  business_name: string;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  website: string | null;
  web_score: number | null;
  web_visual_dated?: boolean | null;
  web_visual_era?: string | null;
}

export interface QualifyResult {
  qualified: boolean;
  reason?: string;
}

const BLACKLIST = [
  /sanitas/i, /quirón/i, /quironsalud/i, /vital ?dent/i, /dentix/i,
  /adeslas/i, /caser/i, /mapfre/i, /asisa/i,
];

const INVALID_EMAIL_PATTERNS = [
  /^noreply@/i, /^no-reply@/i, /@google\.com$/i, /@example\./i,
];

// Detecta eras "muy antiguas" en el campo libre devuelto por Claude visión.
// Aceptamos: pre-2015, 2010s tempranos, "antes de móvil", y similares.
// NO aceptamos: 2018-2024 (eso es web razonable, no mejorable de verdad).
const ANCIENT_ERA_PATTERNS = [
  /200[0-9]/,           // "2005", "2008"...
  /201[0-5]/,           // "2010", "2013", "2015"
  /early\s*2010/i,
  /mid[\s-]?2010/i,
  /antes de (?:la era )?m[oó]vil/i,
  /pre[\s-]?responsive/i,
  /flash/i,
  /noughties/i,
  /antiguo/i,
  /obsoleto/i,
  /muy (?:vieja|antigua)/i,
];

function isAncient(era: string | null | undefined): boolean {
  if (!era) return false;
  return ANCIENT_ERA_PATTERNS.some(rx => rx.test(era));
}

export function qualifyLead(l: LeadInput): QualifyResult {
  if (!l.email) return { qualified: false, reason: 'no_email' };
  if (INVALID_EMAIL_PATTERNS.some(rx => rx.test(l.email!))) {
    return { qualified: false, reason: 'invalid_email' };
  }
  if (l.rating == null || l.rating < 4.0) {
    return { qualified: false, reason: 'low_rating' };
  }
  if (l.review_count == null || l.review_count < 15) {
    return { qualified: false, reason: 'few_reviews' };
  }
  if (BLACKLIST.some(rx => rx.test(l.business_name))) {
    return { qualified: false, reason: 'blacklisted' };
  }

  // No website: golden case. Cualifica directo.
  if (!l.website) return { qualified: true };

  // Has website. Cualifica SOLO si:
  //   - web_score >= 50 (problemas técnicos serios), O
  //   - web_visual_dated === true Y la era es claramente antigua (pre-2016).
  const hasSeriousTechIssues = (l.web_score ?? 0) >= 50;
  const isVisuallyAncient = l.web_visual_dated === true && isAncient(l.web_visual_era);

  if (!hasSeriousTechIssues && !isVisuallyAncient) {
    return { qualified: false, reason: 'web_acceptable' };
  }

  return { qualified: true };
}
