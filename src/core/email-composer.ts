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
}

export function buildUserPrompt(input: ComposerInput): string {
  const lines: string[] = [
    `Negocio: ${input.business_name}`,
    `Categoría: ${input.category ?? 'desconocida'}`,
    `Ciudad: ${input.city ?? 'no indicada'}`,
    `Rating: ${input.rating ?? 'n/a'} (${input.review_count ?? 0} reseñas)`,
  ];
  if (input.website) {
    lines.push(`Web: ${input.website}`);
    lines.push(`Problemas técnicos detectados: ${JSON.stringify(input.web_issues)}`);
    if (input.web_visual_notes) {
      lines.push(`Análisis visual del diseño: ${input.web_visual_notes}`);
      if (input.web_visual_era) lines.push(`Época estimada del diseño: ${input.web_visual_era}`);
      if (input.web_visual_dated) lines.push(`Veredicto visual: la web parece ANTICUADA.`);
    }
  } else {
    lines.push(`No tienen web propia (no aparece en su ficha de Google).`);
  }
  lines.push('');
  lines.push('Genera el email siguiendo todas las reglas del system prompt. Devuelve SOLO el JSON.');
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

export function pickVariant(variants: VariantInfo[]): VariantInfo | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total === 0) return variants[0];
  let r = Math.random() * total;
  for (const v of variants) {
    r -= v.weight;
    if (r <= 0) return v;
  }
  return variants[variants.length - 1];
}
