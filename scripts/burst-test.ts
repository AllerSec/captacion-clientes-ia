/**
 * Lanza un burst REDUCIDO con solo 5 queries del Tier 1 (Irún + alrededores)
 * para validar que el flujo funciona antes del burst completo.
 *
 * NO envía emails. Solo scrapea, analiza y filtra.
 *
 * Uso: tsx scripts/burst-test.ts
 */
import { searchBusinesses } from '../src/services/apify.js';
import {
  upsertLead, getLeadsByStatus, updateLead,
  recordQueryUsed,
} from '../src/services/supabase.js';
import { fetchWebsite } from '../src/services/web-fetcher.js';
import { analyzeHtml } from '../src/core/web-analyzer.js';
import { qualifyLead } from '../src/core/lead-filter.js';
import { logger } from '../src/lib/logger.js';
import { captureScreenshot } from '../src/services/web-screenshotter.js';
import { analyzeScreenshot } from '../src/services/claude.js';
import { QUERIES_BY_TIER } from '../src/config/queries.js';

// Solo 5 queries del Tier 1 (las más cercanas a Irún)
const TEST_QUERIES = QUERIES_BY_TIER[1].slice(0, 5);

async function main() {
  const log = logger.child({ job: 'burst-test' });
  log.info({ queries: TEST_QUERIES }, '🧪 BURST TEST: 5 queries del Tier 1');

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

  log.info({ totalPlaces }, '✅ Scraping done. Now analyzing...');

  // Reusa la lógica del scraper
  const news = await getLeadsByStatus('NEW', 500);
  log.info({ pending: news.length }, 'analyzing leads...');

  let i = 0;
  for (const lead of news) {
    i++;
    if (i % 5 === 0) console.log(`  [${i}/${news.length}] analizando...`);

    // Pre-filter
    const early = qualifyLead({
      business_name: lead.business_name,
      email: lead.email ?? null,
      rating: lead.rating ?? null,
      review_count: lead.review_count ?? null,
      website: lead.website ?? null,
      web_score: 100,
      web_visual_dated: null,
      web_visual_era: null,
    });
    if (!early.qualified && early.reason !== 'web_acceptable') {
      await updateLead(lead.id, { status: 'SKIPPED', notes: early.reason ?? 'pre_filtered' });
      continue;
    }

    let web_score = 100;
    let web_issues: string[] = [];
    let visual: { looksDated?: boolean; era?: string; notes?: string } = {};
    try {
      if (lead.website) {
        const fetched = await fetchWebsite(lead.website);
        const r = analyzeHtml(fetched);
        web_score = r.score;
        web_issues = r.issues;
        if (fetched.status >= 200 && fetched.status < 400) {
          try {
            const shot = await Promise.race([
              captureScreenshot(lead.website!),
              new Promise<{ base64: null; error: string }>((_, rej) =>
                setTimeout(() => rej(new Error('timeout')), 25000)
              ),
            ]);
            if (shot.base64) {
              const j = await analyzeScreenshot(shot.base64);
              visual = { looksDated: j.looksDated, era: j.designEra, notes: j.notes };
            }
          } catch {}
        }
      } else {
        web_issues = ['no_website'];
      }
    } catch {}

    await updateLead(lead.id, {
      status: 'ANALYZED', web_score, web_issues,
      web_analyzed_at: new Date().toISOString(),
      web_visual_dated: visual.looksDated ?? null,
      web_visual_era: visual.era ?? null,
      web_visual_notes: visual.notes ?? null,
    });
  }

  log.info('✅ Analysis done. Now qualifying...');
  const analyzed = await getLeadsByStatus('ANALYZED', 1000);
  let qualified = 0;
  for (const lead of analyzed) {
    const q = qualifyLead({
      business_name: lead.business_name,
      email: lead.email ?? null,
      rating: lead.rating ?? null,
      review_count: lead.review_count ?? null,
      website: lead.website ?? null,
      web_score: lead.web_score ?? null,
      web_visual_dated: (lead as any).web_visual_dated ?? null,
      web_visual_era: (lead as any).web_visual_era ?? null,
    });
    await updateLead(lead.id, {
      status: q.qualified ? 'READY_TO_SEND' : 'SKIPPED',
      notes: q.reason ?? null,
    });
    if (q.qualified) qualified++;
  }

  console.log('\n========================================');
  console.log(`🎯 BURST TEST COMPLETE`);
  console.log(`   Negocios scrapeados:      ${totalPlaces}`);
  console.log(`   Leads analizados:          ${news.length}`);
  console.log(`   Leads READY_TO_SEND:       ${qualified}`);
  console.log('========================================\n');
  console.log('Mira en Supabase Table Editor → leads → filter por status="READY_TO_SEND" para verlos.');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
