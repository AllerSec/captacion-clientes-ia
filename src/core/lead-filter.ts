export interface LeadInput {
  business_name: string;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  website: string | null;
  web_score: number | null;
  web_visual_dated?: boolean | null;
  web_visual_era?: string | null;
  footer_year?: number | null;
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

// Umbral de antigüedad: footer copyright year debe ser <= este año
// para que la web cuente como "antigua de verdad".
export const OLD_WEBSITE_YEAR_CUTOFF = 2018;

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

  // Tiene web. Solo cualifica si hay PRUEBA HONESTA de antigüedad:
  // footer copyright year <= 2018. Sin año, no enviamos (evita afirmaciones falsas).
  if (l.footer_year == null) {
    return { qualified: false, reason: 'no_year_proof' };
  }
  if (l.footer_year > OLD_WEBSITE_YEAR_CUTOFF) {
    return { qualified: false, reason: 'web_too_recent' };
  }

  return { qualified: true };
}
