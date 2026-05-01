/**
 * Envía UN email de prueba a una dirección de tu elección, usando un lead real de la BD.
 * NO marca el lead como CONTACTED — es solo para validar que el envío real funciona.
 *
 * Uso: tsx scripts/send-test-to-self.ts <email-destino> [lead-id]
 * Si no se da lead-id, usa el primero que esté ANALYZED o READY_TO_SEND.
 */
import { getClient, getActiveVariants } from '../src/services/supabase.js';
import { generateEmail } from '../src/services/claude.js';
import { sendEmail } from '../src/services/gmail.js';
import { buildUserPrompt, htmlToText, pickVariant } from '../src/core/email-composer.js';
import { SYSTEM_PROMPT } from '../src/prompts/system.js';
import { loadEnv } from '../src/config/env.js';

async function main() {
  const env = loadEnv();
  const dest = process.argv[2];
  if (!dest) {
    console.error('Uso: tsx scripts/send-test-to-self.ts <email-destino> [lead-id]');
    process.exit(1);
  }

  const sb = getClient();
  let leadQuery = sb.from('leads').select('*').limit(1);
  if (process.argv[3]) {
    leadQuery = sb.from('leads').select('*').eq('id', process.argv[3]).limit(1);
  } else {
    leadQuery = sb.from('leads').select('*').in('status', ['ANALYZED', 'READY_TO_SEND']).order('created_at', { ascending: true }).limit(1);
  }
  const { data, error } = await leadQuery;
  if (error || !data?.length) {
    console.error('No se encontró lead:', error?.message);
    process.exit(1);
  }
  const lead = data[0] as any;

  console.log(`\n[TEST] Lead: ${lead.business_name} (${lead.city ?? 'n/a'})`);
  console.log(`[TEST] Web: ${lead.website ?? 'sin web'}`);
  console.log(`[TEST] Análisis visual: ${lead.web_visual_notes ?? 'n/a'}`);
  console.log(`[TEST] Destino: ${dest}\n`);

  const variants = await getActiveVariants();
  const variant = pickVariant(variants);
  if (!variant) {
    console.error('No hay variantes activas. Corre `npm run seed:variants`.');
    process.exit(1);
  }

  const userPrompt = buildUserPrompt({
    business_name: lead.business_name,
    category: lead.category ?? null,
    city: lead.city ?? null,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
    website: lead.website ?? null,
    web_issues: lead.web_issues ?? [],
    web_visual_dated: lead.web_visual_dated ?? null,
    web_visual_era: lead.web_visual_era ?? null,
    web_visual_notes: lead.web_visual_notes ?? null,
  });

  console.log('[TEST] Generando email con Claude...');
  const generated = await generateEmail({
    systemPrompt: SYSTEM_PROMPT,
    variantSnippet: variant.prompt_snippet,
    userPrompt,
  });

  console.log(`\n[TEST] Asunto: ${generated.subject}`);
  console.log(`[TEST] Body HTML (${generated.body.length} chars):\n${generated.body}\n`);

  console.log(`[TEST] Enviando a ${dest}...`);
  const out = await sendEmail({
    to: dest,
    subject: `[TEST] ${generated.subject}`,
    htmlBody: generated.body,
    textBody: htmlToText(generated.body),
  });

  console.log(`\n[TEST] ✅ Enviado.`);
  console.log(`[TEST] Gmail messageId: ${out.messageId}`);
  console.log(`[TEST] Gmail threadId:  ${out.threadId}`);
  console.log(`[TEST] Comprueba tu bandeja en ${dest}.`);
  console.log(`[TEST] El asunto lleva el prefijo [TEST] para que no lo confundas con un envío real.`);
}

main().catch(e => { console.error(e); process.exit(1); });
