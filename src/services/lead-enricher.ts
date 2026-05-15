import { searchBusinessInfo } from './firecrawl.js';
import { judgeEnrichment } from './claude.js';

export interface EnrichInput {
  business_name: string;
  city: string | null;
  province: string | null;
  category: string | null;
}

export type EnrichOutcome =
  | { kind: 'has_real_website'; website_url: string; reasoning: string; durationMs: number }
  | { kind: 'email_found'; email: string; reasoning: string; durationMs: number }
  | { kind: 'nothing_found'; reasoning: string; durationMs: number }
  | { kind: 'error'; error: string; durationMs: number };

const INVALID_EMAIL_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /@google\.com$/i,
  /@example\./i,
];

function isUsableEmail(e: string | null): e is string {
  if (!e) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return !INVALID_EMAIL_PATTERNS.some(rx => rx.test(e));
}

export async function enrichLead(input: EnrichInput): Promise<EnrichOutcome> {
  const start = Date.now();
  const query = input.city ? `${input.business_name} ${input.city}` : input.business_name;

  const search = await searchBusinessInfo(query);
  if (!search.ok) {
    return { kind: 'error', error: search.error, durationMs: Date.now() - start };
  }

  let judgment;
  try {
    judgment = await judgeEnrichment({
      business_name: input.business_name,
      city: input.city,
      category: input.category,
      results: search.results,
    });
  } catch (err) {
    return {
      kind: 'error',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }

  const durationMs = Date.now() - start;

  if (judgment.has_real_website && judgment.website_url) {
    return {
      kind: 'has_real_website',
      website_url: judgment.website_url,
      reasoning: judgment.reasoning,
      durationMs,
    };
  }

  if (isUsableEmail(judgment.email)) {
    return {
      kind: 'email_found',
      email: judgment.email,
      reasoning: judgment.reasoning,
      durationMs,
    };
  }

  return { kind: 'nothing_found', reasoning: judgment.reasoning, durationMs };
}
