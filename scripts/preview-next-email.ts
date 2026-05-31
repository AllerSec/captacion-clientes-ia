import { getLeadsByStatus, getActiveVariants } from '../src/services/supabase.js';
import { generateEmail } from '../src/services/claude.js';
import { buildUserPrompt, pickVariant } from '../src/core/email-composer.js';
import { buildSystemPrompt } from '../src/prompts/system.js';
import { detectSector } from '../src/core/sector-detector.js';
import { validateSequence } from '../src/core/email-validator.js';
import { loadEnv } from '../src/config/env.js';

async function main() {
  loadEnv();

  const variants = await getActiveVariants();
  if (variants.length === 0) {
    console.error('No active variants in DB.');
    process.exit(1);
  }

  const targetStatus = process.argv[2] ?? 'READY_TO_SEND';
  const candidates = await getLeadsByStatus(targetStatus, 1);
  const lead = candidates[0];
  if (!lead) {
    console.error(`No ${targetStatus} leads in queue.`);
    process.exit(1);
  }

  const variant = pickVariant(variants, lead.id)!;
  const queryUsed = (lead as any).query_used as string | undefined;
  const sectorInfo = detectSector(queryUsed, lead.category, lead.business_name);
  const systemPrompt = buildSystemPrompt(sectorInfo);
  const topComps = ((lead as any).top_competitors ?? []) as Array<{ name: string; website: string }>;
  const requiredCompetitorName = topComps.length > 0 ? topComps[0].name : null;

  const userPrompt = buildUserPrompt({
    business_name: lead.business_name,
    category: lead.category ?? null,
    city: lead.city ?? null,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
    website: null,
    web_issues: ['no_website'],
    top_competitors: topComps,
  });

  const generated = await generateEmail({
    systemPrompt,
    variantSnippet: variant.prompt_snippet,
    userPrompt,
  });

  const v = validateSequence({
    subject: generated.subject,
    bodies: generated.bodies,
    scenario: 'no_web',
    requiredExampleUrl: sectorInfo.exampleUrl,
    requiredCompetitorName,
  });

  console.log('\n========== NEXT QUALIFIED LEAD ==========');
  console.log(`Business : ${lead.business_name}`);
  console.log(`Category : ${lead.category ?? '-'}`);
  console.log(`City     : ${lead.city ?? '-'}`);
  console.log(`Rating   : ${lead.rating ?? '-'} (${lead.review_count ?? 0} reviews)`);
  console.log(`Email    : ${lead.email ?? '-'}`);
  console.log(`Phone    : ${lead.phone ?? '-'}`);
  console.log(`Sector   : ${sectorInfo.sector} (ref ${sectorInfo.exampleUrl})`);
  console.log(`Variant  : ${variant.name}`);
  console.log(`Competitor anchor: ${requiredCompetitorName ?? '(none)'}`);
  console.log('\n========== GENERATED SEQUENCE ==========');
  console.log(`Subject: ${generated.subject}`);
  generated.bodies.forEach((b, i) => {
    console.log(`--- email ${i + 1} ---`);
    console.log(b);
  });
  console.log(`\nValidation: ${v.ok ? 'OK' : 'FAILED -> ' + v.errors.join(' | ')}`);
  console.log('\n(no DB mutations performed, no email sent)');
}

main().catch(e => { console.error(e); process.exit(1); });
