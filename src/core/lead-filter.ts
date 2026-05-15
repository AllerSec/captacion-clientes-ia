export interface LeadInput {
  business_name: string;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  website: string | null;
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

  // Tiene web: fuera del alcance. Solo contactamos negocios SIN web.
  if (l.website) return { qualified: false, reason: 'has_website' };

  return { qualified: true };
}

export interface PreEnrichInput {
  business_name: string;
  rating: number | null;
  review_count: number | null;
}

export function qualifyLeadPreEnrich(l: PreEnrichInput): QualifyResult {
  if (l.rating == null || l.rating < 4.0) {
    return { qualified: false, reason: 'low_rating' };
  }
  if (l.review_count == null || l.review_count < 15) {
    return { qualified: false, reason: 'few_reviews' };
  }
  if (BLACKLIST.some(rx => rx.test(l.business_name))) {
    return { qualified: false, reason: 'blacklisted' };
  }
  return { qualified: true };
}
