import { getClient } from '../src/services/supabase.js';
import { generateEmail } from '../src/services/claude.js';
import { buildUserPrompt, pickVariant, htmlToText } from '../src/core/email-composer.js';
import { buildSystemPrompt } from '../src/prompts/system.js';
import { detectSector } from '../src/core/sector-detector.js';
import { validateSequence } from '../src/core/email-validator.js';
import { isValidCompetitor, isLikelyJunkName, isSameSectorCompetitor } from '../src/core/business-name.js';
import { getActiveVariants } from '../src/services/supabase.js';
import { loadEnv } from '../src/config/env.js';

// Toma un lead REAL de la DB (status NEW) que tenga competidores ya analizados,
// y genera la secuencia completa con sus datos auténticos. Sin envío, sin mutaciones.
async function main() {
  loadEnv();
  const sb = getClient();
  const { data, error } = await sb
    .from('leads')
    .select('id,business_name,city,category,rating,review_count,top_competitors')
    .eq('status', 'NEW')
    .limit(500);

  if (error) { console.error('Supabase error:', error.message); process.exit(1); }
  // Mismo filtro que producción: descartamos nombres-basura (razones sociales mal
  // scrapeadas) que qualifyLead rechazaría antes de contactarlos.
  const leads = (data ?? []).filter(l => !isLikelyJunkName(l.business_name));
  console.error(`[debug] NEW leads devueltos: ${(data ?? []).length}, tras filtro junk: ${leads.length}`);

  // Filtro opcional por sector: `tsx scripts/preview-real-db.ts optica`
  const wantSector = process.argv[2]?.toLowerCase();
  const hasValidComp = (l: any) => {
    const comps = ((l.top_competitors ?? []) as Array<{ name: string; website: string }>);
    return comps.filter(isValidCompetitor).length > 0;
  };
  const matchesSector = (l: any) =>
    !wantSector || detectSector(undefined, l.category, l.business_name).sector === wantSector;

  // Preferimos un lead del sector pedido CON competidor válido; si no, relajamos.
  const lead =
    leads.find(l => matchesSector(l) && hasValidComp(l)) ??
    leads.find(l => matchesSector(l)) ??
    (wantSector ? undefined : leads[0]);
  if (!lead) { console.error(`No NEW leads${wantSector ? ` del sector "${wantSector}"` : ''} in DB.`); process.exit(1); }

  const variants = await getActiveVariants();
  const variant = pickVariant(variants, lead.id)!;
  const sectorInfo = detectSector(undefined, lead.category, lead.business_name);
  const systemPrompt = buildSystemPrompt(sectorInfo);

  const rawComps = ((lead as any).top_competitors ?? []) as Array<{ name: string; website: string }>;
  const filtered = rawComps
    .filter(isValidCompetitor)
    .filter(c => isSameSectorCompetitor(c.name, sectorInfo.sector))
    .slice(0, 3);
  const requiredCompetitorName = filtered.length > 0 ? filtered[0].name : null;

  const userPrompt = buildUserPrompt({
    business_name: lead.business_name,
    category: lead.category ?? null,
    city: lead.city ?? null,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
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

  console.log('\n========== LEAD REAL (de la DB, status NEW) ==========');
  console.log(`${lead.business_name} — ${lead.category ?? '-'}, ${lead.city ?? '-'} — ${lead.rating ?? '-'}★ (${lead.review_count ?? 0} resenas)`);
  console.log(`Variant: ${variant.name} | Sector: ${sectorInfo.sector} (ref ${sectorInfo.exampleUrl})`);
  console.log(`Competidor anchor: ${requiredCompetitorName ?? '(sin competidor valido -> fallback generico)'}`);
  console.log(`\nASUNTO (hilo): ${generated.subject}`);
  generated.bodies.forEach((body, i) => {
    const text = htmlToText(body);
    const words = text.split(/\s+/).filter(Boolean).length;
    console.log(`\n========== ${labels[i]} · dia ${delays[i]} · ${words} palabras ==========\n`);
    console.log(text);
  });
  console.log('\n========== VALIDACION ==========');
  console.log(v.ok ? 'OK' : 'FAILED -> ' + v.errors.join(' | '));
  console.log('\n(sin envio, sin cambios en DB)');
}
main().catch(e => { console.error(e); process.exit(1); });
