import { getActiveVariants } from '../src/services/supabase.js';
import { generateEmail } from '../src/services/claude.js';
import { buildUserPrompt, pickVariant, htmlToText } from '../src/core/email-composer.js';
import { buildSystemPrompt } from '../src/prompts/system.js';
import { detectSector } from '../src/core/sector-detector.js';
import { validateSequence } from '../src/core/email-validator.js';
import { loadEnv } from '../src/config/env.js';

// Lead fijo con competidor nombrado, para previsualizar un email completo.
const lead = {
  id: 'preview-optica-tafalla',
  business_name: 'ÓPTICA TAFALLA',
  category: 'Optometrista',
  city: 'Tafalla',
  rating: 4.9,
  review_count: 16,
  top_competitors: [
    { name: 'Centro de Salud de Tafalla', website: 'http://www.tafalla.es/centro-de-salud-servicios/' },
  ],
};

async function main() {
  loadEnv();
  const variants = await getActiveVariants();
  const variant = pickVariant(variants, lead.id)!;
  const sectorInfo = detectSector(undefined, lead.category, lead.business_name);
  const systemPrompt = buildSystemPrompt(sectorInfo);
  const requiredCompetitorName = lead.top_competitors[0].name;

  const userPrompt = buildUserPrompt({
    business_name: lead.business_name,
    category: lead.category,
    city: lead.city,
    rating: lead.rating,
    review_count: lead.review_count,
    website: null,
    web_issues: ['no_website'],
    top_competitors: lead.top_competitors,
  });

  const generated = await generateEmail({ systemPrompt, variantSnippet: variant.prompt_snippet, userPrompt });
  const v = validateSequence({
    subject: generated.subject, bodies: generated.bodies, scenario: 'no_web',
    requiredExampleUrl: sectorInfo.exampleUrl, requiredCompetitorName,
  });

  const delays = [0, 3, 7, 14, 21];
  const labels = ['EMAIL 1 (inicial)', 'FOLLOW-UP 1', 'FOLLOW-UP 2', 'FOLLOW-UP 3', 'FOLLOW-UP 4 (despedida)'];

  console.log('\n========== LEAD ==========');
  console.log(`${lead.business_name} — ${lead.category}, ${lead.city} — ${lead.rating}★ (${lead.review_count} reseñas)`);
  console.log(`Variant: ${variant.name} | Sector: ${sectorInfo.sector} (ref ${sectorInfo.exampleUrl})`);
  console.log(`Competidor anchor: ${requiredCompetitorName}`);
  console.log(`\nASUNTO (hilo): ${generated.subject}`);
  generated.bodies.forEach((body, i) => {
    const text = htmlToText(body);
    const words = text.split(/\s+/).filter(Boolean).length;
    console.log(`\n========== ${labels[i]} · día ${delays[i]} · ${words} palabras ==========\n`);
    console.log(text);
  });
  console.log('\n========== VALIDACIÓN ==========');
  console.log(v.ok ? 'OK' : 'FAILED -> ' + v.errors.join(' | '));
  console.log('\n(sin envío, sin cambios en DB)');
}
main().catch(e => { console.error(e); process.exit(1); });
