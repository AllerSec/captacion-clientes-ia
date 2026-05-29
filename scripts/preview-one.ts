import { getActiveVariants } from '../src/services/supabase.js';
import { generateEmail } from '../src/services/claude.js';
import { buildUserPrompt, pickVariant, htmlToText } from '../src/core/email-composer.js';
import { buildSystemPrompt } from '../src/prompts/system.js';
import { detectSector } from '../src/core/sector-detector.js';
import { validateSequence } from '../src/core/email-validator.js';
import { isValidCompetitor } from '../src/core/business-name.js';
import { loadEnv } from '../src/config/env.js';

// Lead fijo. Competidores tal cual los devolvió Apify: mezcla de uno real (Taller GTS),
// una entidad pública (Ayuntamiento) y otro real (AutoZona). El filtro debe tirar el ayto.
const lead = {
  id: 'preview-talleres-garysa',
  business_name: 'Talleres Garysa',
  category: 'Taller de reparación de automóviles',
  city: 'Burlada',
  rating: 4.9,
  review_count: 257,
  top_competitors_raw: [
    { name: 'Taller GTS motor', website: 'https://pamplonacomercial.com/trabajo/taller-gts-motor-en-burlada/' },
    { name: 'Ayuntamiento de Burlada', website: 'https://www.burlada.es/' },
    { name: 'AutoZona (Talleres AUTO-PRIX S.L.)', website: 'https://www.autozona.com/' },
  ],
};

async function main() {
  loadEnv();
  const variants = await getActiveVariants();
  const variant = pickVariant(variants, lead.id)!;
  const sectorInfo = detectSector(undefined, lead.category, lead.business_name);
  const systemPrompt = buildSystemPrompt(sectorInfo);

  // Mismo filtro que aplica el scraper: descarta ayuntamientos/directorios/franquicias.
  const filtered = lead.top_competitors_raw.filter(isValidCompetitor).slice(0, 3);
  console.log('Competidores ANTES del filtro:', lead.top_competitors_raw.map(c => c.name).join(' | '));
  console.log('Competidores DESPUÉS del filtro:', filtered.map(c => c.name).join(' | ') || '(ninguno → fallback genérico)');
  const requiredCompetitorName = filtered.length > 0 ? filtered[0].name : null;

  const userPrompt = buildUserPrompt({
    business_name: lead.business_name,
    category: lead.category,
    city: lead.city,
    rating: lead.rating,
    review_count: lead.review_count,
    website: null,
    web_issues: ['no_website'],
    top_competitors: filtered,
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
