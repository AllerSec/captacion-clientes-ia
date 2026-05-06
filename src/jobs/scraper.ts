import { searchBusinesses } from '../services/apify.js';
import {
  upsertLead, getLeadsByStatus, updateLead,
  getRecentlyUsedQueries, recordQueryUsed, getScraperState, setScraperTier, markBurstDone, countReadyToSend,
} from '../services/supabase.js';
import { fetchWebsite } from '../services/web-fetcher.js';
import { analyzeHtml, extractFooterYear, composeVisualEra } from '../core/web-analyzer.js';
import { qualifyLead } from '../core/lead-filter.js';
import { scrapeForLeadAnalysis, type WebSignals } from '../services/firecrawl.js';
import { logger } from '../lib/logger.js';
import { notifyError } from '../core/health-monitor.js';
import { captureScreenshot } from '../services/web-screenshotter.js';
import { analyzeScreenshot } from '../services/claude.js';
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

  // PRE-FILTER: discard obvious non-leads BEFORE wasting screenshot + visual analysis.
  // (rating, reviews, blacklist, missing email, invalid email).
  const earlyCheck = qualifyLead({
    business_name: lead.business_name,
    email: lead.email ?? null,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
    website: lead.website ?? null,
    web_score: 100, // assume worst-case so this gate doesn't reject on web alone
    web_visual_dated: null,
    web_visual_era: null,
  });
  // Early-check solo descarta motivos que NO se pueden resolver analizando la web
  // (email/rating/reviews/blacklist). Los motivos relacionados con la web aún no
  // los hemos podido evaluar, así que NO descartamos por ellos aquí.
  const earlyAnalysisDeferredReasons = new Set(['web_acceptable', 'no_year_proof', 'web_too_recent']);
  if (!earlyCheck.qualified && !earlyAnalysisDeferredReasons.has(earlyCheck.reason ?? '')) {
    try {
      await updateLead(lead.id, { status: 'SKIPPED', notes: earlyCheck.reason ?? 'pre_filtered' });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (early skip)');
    }
    return;
  }

  let web_score = 100;
  let web_issues: string[] = [];
  let visual: { looksDated?: boolean; era?: string; notes?: string } = {};
  let footerYear: number | null = null;
  let signals: WebSignals | null = null;
  let screenshotUrl: string | null = null;
  let firecrawl_status: 'ok' | 'failed' | 'fallback' | 'skipped_no_url' = 'skipped_no_url';

  try {
    if (lead.website) {
      const fc = await scrapeForLeadAnalysis(lead.website);

      if (fc.ok) {
        firecrawl_status = 'ok';
        signals = fc.signals;
        screenshotUrl = fc.screenshotUrl;
        footerYear = fc.signals.footerCopyrightYear ?? null;
        // En modo Firecrawl, web_score/web_issues son informativos: el qualify
        // depende solo de footerYear. Mantenemos compatibilidad con campos legacy.
        web_score = footerYear != null ? 0 : 100;
        web_issues = fc.signals.notableAntiquatedDetails;
        visual = {
          looksDated: fc.signals.looksAbandoned,
          era: fc.signals.visualEra ?? undefined,
        };
      } else {
        // FALLBACK — Firecrawl caído, sin créditos, etc. Usamos el fetch nativo
        // y vision por puppeteer como red de seguridad.
        log.warn({ leadId: lead.id, err: fc.error }, 'firecrawl failed, using fallback');
        firecrawl_status = 'fallback';
        const fetched = await fetchWebsite(lead.website);
        const r = analyzeHtml(fetched);
        web_score = r.score;
        web_issues = r.issues;
        footerYear = extractFooterYear(fetched.html);
        if (fetched.status >= 200 && fetched.status < 400) {
          try {
            const shot = await Promise.race([
              captureScreenshot(lead.website!),
              new Promise<{ base64: null; error: string }>((_, rej) =>
                setTimeout(() => rej(new Error('screenshot+visual timeout')), 25000)
              ),
            ]);
            if (shot.base64) {
              const j = await analyzeScreenshot(shot.base64);
              visual = { looksDated: j.looksDated, era: j.designEra, notes: j.notes };
            }
          } catch (err) {
            log.warn({ err: (err as Error).message, leadId: lead.id }, 'visual analysis failed');
          }
        }
      }
    } else {
      web_issues = ['no_website'];
      firecrawl_status = 'skipped_no_url';
    }
  } catch (err) {
    firecrawl_status = 'failed';
    log.warn({ err: (err as Error).message, leadId: lead.id }, 'analysis failed; continuing');
  }
  try {
    await updateLead(lead.id, {
      status: 'ANALYZED', web_score, web_issues,
      web_analyzed_at: new Date().toISOString(),
      web_visual_dated: visual.looksDated ?? null,
      web_visual_era: composeVisualEra(visual.era ?? null, footerYear),
      web_visual_notes: visual.notes ?? null,
      web_signals: signals as any,
      screenshot_url: screenshotUrl,
      firecrawl_status,
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

  // Filter ANALYZED
  const analyzed = await getLeadsByStatus('ANALYZED', 500);
  for (const lead of analyzed) {
    const sig = (lead as any).web_signals as WebSignals | null;
    const fy = sig?.footerCopyrightYear ?? null;
    const q = qualifyLead({
      business_name: lead.business_name,
      email: lead.email ?? null,
      rating: lead.rating ?? null,
      review_count: lead.review_count ?? null,
      website: lead.website ?? null,
      web_score: lead.web_score ?? null,
      web_visual_dated: (lead as any).web_visual_dated ?? null,
      web_visual_era: (lead as any).web_visual_era ?? null,
      footer_year: fy,
    });
    await updateLead(lead.id, {
      status: q.qualified ? 'READY_TO_SEND' : 'SKIPPED',
      notes: q.reason ?? null,
    });
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
