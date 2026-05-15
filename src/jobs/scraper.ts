import { searchBusinesses } from '../services/apify.js';
import {
  upsertLead, getLeadsByStatus, updateLead,
  getRecentlyUsedQueries, recordQueryUsed, getScraperState, setScraperTier, markBurstDone, countReadyToSend,
} from '../services/supabase.js';
import { qualifyLead, qualifyLeadPreEnrich } from '../core/lead-filter.js';
import { enrichLead } from '../services/lead-enricher.js';
import { logger } from '../lib/logger.js';
import { notifyError } from '../core/health-monitor.js';
import { pickNextQuery, burstQueries } from '../core/query-rotator.js';
import { QUERIES_BY_TIER, TIER_NAMES } from '../config/queries.js';

const READY_TO_SEND_THRESHOLD = 30;

export async function runScraperAuto(): Promise<void> {
  const log = logger.child({ job: 'scraper' });
  try {
    const state = await getScraperState();
    const recentlyUsed = await getRecentlyUsedQueries(30);
    const queriesToRun: Array<{ q: string; tier: number }> = [];

    if (!state.last_burst_at) {
      // INITIAL BURST: scrape all of Euskadi (tiers 1-3) at once
      log.info('initial burst mode: scraping all Tier 1-3 (Euskadi)');
      const burst = burstQueries(recentlyUsed, 3);
      for (const q of burst.queries) queriesToRun.push({ q, tier: getTierForQuery(q) });
    } else {
      const ready = await countReadyToSend();
      if (ready >= READY_TO_SEND_THRESHOLD) {
        log.info({ ready }, 'enough READY_TO_SEND leads, skipping scrape');
        await analyzeAndFilter();
        return;
      }
      // NORMAL: pick next single query
      const pick = pickNextQuery({ recentlyUsed, currentTier: state.current_tier });
      if (pick.exhausted) {
        log.warn('all tiers exhausted, no new queries');
        await notifyError('warn', 'Scraper sin queries', 'Has agotado los 8 tiers. Espera 30 días para reciclar Tier 1, o añade queries nuevas a config/queries.ts.');
        await analyzeAndFilter();
        return;
      }
      if (pick.jumpedTier && pick.tier !== state.current_tier) {
        await setScraperTier(pick.tier);
        await notifyError('warn', `Scraper salta a Tier ${pick.tier}`, `Hemos terminado el tier anterior. Ahora vamos a por: ${TIER_NAMES[pick.tier] ?? 'tier ' + pick.tier}.`);
      }
      queriesToRun.push({ q: pick.query!, tier: pick.tier });
    }

    for (const { q, tier } of queriesToRun) {
      try {
        const places = await searchBusinesses(q, 50);
        log.info({ query: q, tier, count: places.length }, 'fetched places');
        let inserted = 0;
        for (const p of places) {
          try {
            await upsertLead({ ...p, status: 'NEW' });
            inserted++;
          } catch (err) {
            log.warn({ err: (err as Error).message, place_id: p.place_id }, 'upsert failed');
          }
        }
        await recordQueryUsed(q, tier, places.length, inserted);
      } catch (err) {
        log.error({ err, query: q }, 'apify search failed');
        // Don't throw, continue with other queries
        await recordQueryUsed(q, tier, 0, 0);
      }
    }

    if (!state.last_burst_at) await markBurstDone();
    await analyzeAndFilter();
  } catch (err) {
    await notifyError('error', 'Scraper crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}

function getTierForQuery(q: string): number {
  for (const [tierStr, list] of Object.entries(QUERIES_BY_TIER)) {
    if ((list as string[]).includes(q)) return parseInt(tierStr);
  }
  return 1;
}

async function analyzeOneLead(lead: any): Promise<void> {
  const log = logger.child({ job: 'scraper' });

  // 1. Tiene website en Maps: descartar inmediatamente.
  if (lead.website) {
    try {
      await updateLead(lead.id, { status: 'SKIPPED', notes: 'has_website' });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (has_website skip)');
    }
    return;
  }

  // 2. Tiene email en Maps: qualify normal y promover.
  if (lead.email) {
    return analyzeNoWebsiteWithEmail(lead);
  }

  // 3. Ni website ni email: pre-qualify barato; si pasa, enriquecer.
  const pre = qualifyLeadPreEnrich({
    business_name: lead.business_name,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
  });
  if (!pre.qualified) {
    try {
      await updateLead(lead.id, { status: 'SKIPPED', notes: pre.reason ?? 'pre_filtered' });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (pre_enrich_filtered)');
    }
    return;
  }

  log.info({ leadId: lead.id, business: lead.business_name, city: lead.city }, 'enrich: start');
  const outcome = await enrichLead({
    business_name: lead.business_name,
    city: lead.city ?? null,
    province: lead.province ?? null,
    category: lead.category ?? null,
  });
  log.info({ leadId: lead.id, kind: outcome.kind, durationMs: outcome.durationMs }, 'enrich: done');

  const enrichedAt = new Date().toISOString();

  if (outcome.kind === 'has_real_website') {
    try {
      await updateLead(lead.id, {
        status: 'SKIPPED',
        notes: 'has_website_found_online',
        enriched_at: enrichedAt,
        enriched_via: 'search',
        enriched_website: outcome.website_url,
      });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (has_website_found_online)');
    }
    return;
  }

  if (outcome.kind === 'email_found') {
    try {
      await updateLead(lead.id, {
        email: outcome.email,
        enriched_at: enrichedAt,
        enriched_via: 'search',
      });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (email_found)');
      return;
    }
    return analyzeNoWebsiteWithEmail({ ...lead, email: outcome.email });
  }

  if (outcome.kind === 'nothing_found') {
    try {
      await updateLead(lead.id, {
        status: 'SKIPPED',
        notes: 'no_email_after_enrich',
        enriched_at: enrichedAt,
        enriched_via: 'search',
      });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (no_email_after_enrich)');
    }
    return;
  }

  // outcome.kind === 'error'
  try {
    await updateLead(lead.id, {
      status: 'SKIPPED',
      notes: `enrich_error: ${outcome.error.slice(0, 200)}`,
      enriched_at: enrichedAt,
      enriched_via: 'search',
    });
  } catch (err) {
    log.error({ err, leadId: lead.id }, 'updateLead failed (enrich_error)');
  }
}

async function analyzeNoWebsiteWithEmail(lead: any): Promise<void> {
  const log = logger.child({ job: 'scraper' });
  const check = qualifyLead({
    business_name: lead.business_name,
    email: lead.email ?? null,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
    website: null,
  });

  if (!check.qualified) {
    try {
      await updateLead(lead.id, { status: 'SKIPPED', notes: check.reason ?? 'pre_filtered' });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (qualify reject)');
    }
    return;
  }

  try {
    await updateLead(lead.id, {
      status: 'ANALYZED',
      web_issues: ['no_website'],
      web_analyzed_at: new Date().toISOString(),
      firecrawl_status: 'skipped_no_url',
    } as any);
  } catch (err) {
    log.error({ err, leadId: lead.id }, 'updateLead failed');
  }
}

/** Process leads N at a time. Visual analysis is the bottleneck (~5s each), so parallelism helps a lot. */
async function processInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

async function analyzeAndFilter(): Promise<void> {
  const log = logger.child({ job: 'scraper' });
  // Analyze NEW leads. Big batch up to 1000, parallelism 3.
  const news = await getLeadsByStatus('NEW', 1000);
  log.info({ pending: news.length }, 'analyze: starting');
  await processInBatches(news, 3, analyzeOneLead);
  log.info({ analyzed: news.length }, 'analyze: done');

  // Filter ANALYZED: todos los que llegan aquí ya pasaron el qualify en analyzeOneLead.
  // Solo promovemos a READY_TO_SEND.
  const analyzed = await getLeadsByStatus('ANALYZED', 500);
  for (const lead of analyzed) {
    await updateLead(lead.id, { status: 'READY_TO_SEND', notes: null });
  }

  log.info('analyze+filter finished');
}

// Keep the legacy entry-point for tests (existing test mocks the old runScraper):
export async function runScraper(queries: string[]): Promise<void> {
  const log = logger.child({ job: 'scraper' });
  try {
    log.info({ queries }, 'starting scraper (manual mode)');
    for (const q of queries) {
      const places = await searchBusinesses(q, 50);
      for (const p of places) await upsertLead({ ...p, status: 'NEW' });
    }
    await analyzeAndFilter();
  } catch (err) {
    await notifyError('error', 'Scraper crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}
