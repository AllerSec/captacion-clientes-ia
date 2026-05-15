/**
 * Lanza un burst REDUCIDO con solo 5 queries del Tier 1 (Irún + alrededores)
 * para validar que el flujo funciona antes del burst completo.
 *
 * NO envía emails. Solo scrapea y filtra (nueva lógica: sin web = válido).
 *
 * Uso: tsx scripts/burst-test.ts
 */
import { searchBusinesses } from '../src/services/apify.js';
import {
  upsertLead, getLeadsByStatus, updateLead,
  recordQueryUsed,
} from '../src/services/supabase.js';
import { qualifyLead } from '../src/core/lead-filter.js';
import { logger } from '../src/lib/logger.js';
import { QUERIES_BY_TIER } from '../src/config/queries.js';

const TEST_QUERIES = QUERIES_BY_TIER[1].slice(0, 5);

async function main() {
  const log = logger.child({ job: 'burst-test' });
  log.info({ queries: TEST_QUERIES }, 'BURST TEST: 5 queries del Tier 1');

  let totalPlaces = 0;
  for (const q of TEST_QUERIES) {
    try {
      log.info({ query: q }, 'scraping');
      const places = await searchBusinesses(q, 30);
      totalPlaces += places.length;
      log.info({ query: q, count: places.length }, 'fetched');
      let inserted = 0;
      for (const p of places) {
        try {
          await upsertLead({ ...p, status: 'NEW' });
          inserted++;
        } catch {}
      }
      await recordQueryUsed(q, 1, places.length, inserted);
    } catch (err) {
      log.error({ err: (err as Error).message, query: q }, 'apify failed');
    }
  }

  log.info({ totalPlaces }, 'Scraping done. Now analyzing...');

  const news = await getLeadsByStatus('NEW', 500);
  log.info({ pending: news.length }, 'analyzing leads...');

  let i = 0;
  for (const lead of news) {
    i++;
    if (i % 5 === 0) console.log(`  [${i}/${news.length}] analizando...`);

    // Negocios con web: descartados directamente.
    if (lead.website) {
      await updateLead(lead.id, { status: 'SKIPPED', notes: 'has_website' });
      continue;
    }

    const q = qualifyLead({
      business_name: lead.business_name,
      email: lead.email ?? null,
      rating: lead.rating ?? null,
      review_count: lead.review_count ?? null,
      website: null,
    });

    if (!q.qualified) {
      await updateLead(lead.id, { status: 'SKIPPED', notes: q.reason ?? 'pre_filtered' });
      continue;
    }

    await updateLead(lead.id, {
      status: 'ANALYZED',
      web_issues: ['no_website'],
      web_analyzed_at: new Date().toISOString(),
      firecrawl_status: 'skipped_no_url',
    } as any);
  }

  log.info('Analysis done. Now qualifying...');
  const analyzed = await getLeadsByStatus('ANALYZED', 1000);
  let qualified = 0;
  for (const lead of analyzed) {
    await updateLead(lead.id, { status: 'READY_TO_SEND', notes: null });
    qualified++;
  }

  log.info({ qualified }, 'Burst test complete. READY_TO_SEND promoted.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
