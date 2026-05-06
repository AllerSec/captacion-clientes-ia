export interface ComposerInput {
  business_name: string;
  category: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  website: string | null;
  web_issues: string[];
  web_visual_dated?: boolean | null;
  web_visual_era?: string | null;
  web_visual_notes?: string | null;
  footer_year?: number | null;
  notable_antiquated_details?: string[];
  visual_era?: 'pre-2010' | 'early-2010s' | 'late-2010s' | 'modern' | null;
}

export function buildUserPrompt(input: ComposerInput): string {
  const lines: string[] = [
    `NOMBRE_NEGOCIO: ${input.business_name}`,
    `CATEGORIA: ${input.category ?? 'desconocida'}`,
    `CIUDAD: ${input.city ?? 'no indicada'}`,
    `Rating: ${input.rating ?? 'n/a'} (${input.review_count ?? 0} reseñas)`,
  ];

  if (!input.website) {
    lines.push('');
    lines.push('ESCENARIO: sin web');
    lines.push('No tienen web propia (no aparece en su ficha de Google).');
  } else {
    lines.push('');
    lines.push('ESCENARIO: web antigua');
    lines.push(`Web: ${input.website}`);
    lines.push(`FOOTER_YEAR: ${input.footer_year ?? 'desconocido'}`);
    lines.push(`VISUAL_ERA: ${input.visual_era ?? 'desconocida'}`);
    const details = input.notable_antiquated_details ?? [];
    lines.push(
      `DETALLES_VISUALES: ${details.length > 0 ? details.join(', ') : '(ninguno notable)'}`
    );
    // Contexto legacy / fallback (visión por puppeteer cuando Firecrawl falla):
    if (input.web_visual_notes) {
      lines.push(`Análisis visual (fallback): ${input.web_visual_notes}`);
    }
  }

  lines.push('');
  lines.push('Genera el email siguiendo todas las reglas del system prompt. Llama a send_email_draft.');
  return lines.join('\n');
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface VariantInfo {
  id: string;
  name: string;
  prompt_snippet: string;
  weight: number;
}

// Deterministic 32-bit hash so the same seed (e.g. lead.id) maps to the same variant.
// Splits stay balanced over time even if the process restarts mid-day.
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

export function pickVariant(variants: VariantInfo[], seed?: string): VariantInfo | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total === 0) return variants[0];
  const rand = seed ? hashSeed(seed) : Math.random();
  let r = rand * total;
  for (const v of variants) {
    r -= v.weight;
    if (r <= 0) return v;
  }
  return variants[variants.length - 1];
}
