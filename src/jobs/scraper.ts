import { searchBusinesses } from '../services/apify.js';
import {
  upsertLead, getLeadsByStatus, updateLead,
  getRecentlyUsedQueries, recordQueryUsed, getScraperState, markBurstDone, countReadyToSend,
  getQueryLastUsedDates,
} from '../services/supabase.js';
import { qualifyLead, qualifyLeadPreEnrich } from '../core/lead-filter.js';
import { isValidCompetitor, isSameSectorCompetitor } from '../core/business-name.js';
import { detectSector } from '../core/sector-detector.js';
import { enrichLead } from '../services/lead-enricher.js';
import { logger } from '../lib/logger.js';
import { notifyError } from '../core/health-monitor.js';
import { burstQueries, pickRecurringQueries } from '../core/query-rotator.js';
import { QUERIES_BY_TIER } from '../config/queries.js';

// Buffer de cola: el scraper rellena cada mañana hasta dejar ~este nº de leads
// READY_TO_SEND. Con un objetivo de ~30 envíos/día, 60 da ~2 días de colchón.
const READY_TO_SEND_THRESHOLD = 60;
// Cap de queries por tick. Solo ~3% de lo scrapeado acaba contactable (el resto
// tiene web, sin email, o no se le encuentra email al enriquecer), así que para
// producir ~30 contactables/día hacen falta ~30+ queries.
const MAX_QUERIES_PER_TICK = 35;
// Cooldown por query: 7 días. Con ~343 queries en el catálogo, el sistema nunca
// se agota: cuando todo está en cooldown, reutiliza las más antiguas primero.
const QUERY_COOLDOWN_MS = 7 * 24 * 3600_000;

export async function runScraperAuto(): Promise<void> {
  const log = logger.child({ job: 'scraper' });
  try {
    const state = await getScraperState();
    const queriesToRun: Array<{ q: string; tier: number }> = [];

    if (!state.last_burst_at) {
      // INITIAL BURST: scrape all of Euskadi (tiers 1-3) at once
      log.info('initial burst mode: scraping all Tier 1-3 (Euskadi)');
      const recentlyUsed = await getRecentlyUsedQueries(10);
      const burst = burstQueries(recentlyUsed, 3);
      for (const q of burst.queries) queriesToRun.push({ q, tier: getTierForQuery(q) });
    } else {
      const ready = await countReadyToSend();
      if (ready >= READY_TO_SEND_THRESHOLD) {
        log.info({ ready }, 'enough READY_TO_SEND leads, skipping scrape');
        await analyzeAndFilter();
        return;
      }
      // RECURRING: prioriza queries nunca usadas o con cooldown expirado.
      // Si todo está en cooldown, recicla las más antiguas — nunca se bloquea.
      const lastUsed = await getQueryLastUsedDates();
      const selection = pickRecurringQueries({
        lastUsed,
        count: MAX_QUERIES_PER_TICK,
        cooldownMs: QUERY_COOLDOWN_MS,
      });
      queriesToRun.push(...selection.queries);
      log.info({ count: queriesToRun.length }, 'recurring: queries selected');
    }

    let totalFetched = 0;
    for (const { q, tier } of queriesToRun) {
      try {
        const places = await searchBusinesses(q, 50);
        totalFetched += places.length;
        log.info({ query: q, tier, count: places.length }, 'fetched places');
        // Top 3 competidores CON web de esta query, en el orden devuelto por Apify
        // (Apify devuelve por relevancia/ranking en Google). Sirven para personalizar
        // el cold email con un competidor real al que el lead "está regalando clientes".
        // isValidCompetitor descarta entidades públicas (ambulatorios, ayuntamientos),
        // directorios y franquicias: nombrarlas como competidor delataría que no se ha
        // mirado el negocio. Si no queda ninguno válido, el email usa el fallback genérico.
        const querySector = detectSector(q).sector;
        const topCompetitors = places
          .filter(p => p.website && p.website.trim().length > 0)
          .map(p => ({ name: p.business_name, website: p.website as string }))
          .filter(isValidCompetitor)
          // Mismo sector que la query (una ortopedia no compite con una óptica).
          .filter(c => isSameSectorCompetitor(c.name, querySector))
          .slice(0, 3);
        let inserted = 0;
        for (const p of places) {
          try {
            // Si el lead tiene web no lo personalizaremos (queda SKIPPED), pero igual
            // adjuntamos los competidores para auditoría/futura reactivación.
            // Excluimos al propio lead del array de competidores por place_id/website.
            const competitorsForLead = topCompetitors.filter(c =>
              c.website !== p.website && c.name !== p.business_name
            ).slice(0, 3);
            await upsertLead({
              ...p,
              status: 'NEW',
              top_competitors: competitorsForLead.length > 0 ? competitorsForLead : null,
            });
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

    if (queriesToRun.length > 0 && totalFetched === 0) {
      await notifyError('warn', 'Scraper sin resultados de Apify',
        `Corrieron ${queriesToRun.length} queries pero Apify devolvió 0 lugares. Posible bloqueo o créditos agotados.`);
    }

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
  // Cap: no sobrepasar el threshold; el scraper de mañana promoverá el resto.
  const already = await countReadyToSend();
  const toPromote = Math.max(0, READY_TO_SEND_THRESHOLD - already);
  if (toPromote > 0) {
    const analyzed = await getLeadsByStatus('ANALYZED', toPromote);
    for (const lead of analyzed) {
      await updateLead(lead.id, { status: 'READY_TO_SEND', notes: null });
    }
    log.info({ promoted: analyzed.length }, 'analyze+filter: promoted to READY_TO_SEND');
  } else {
    log.info('analyze+filter: READY_TO_SEND threshold already met, skipping promotion');
  }
}

// Keep the legacy entry-point for tests (existing test mocks the old runScraper):
export async function runScraper(queries: string[]): Promise<void> {
  const log = logger.child({ job: 'scraper' });
  try {
    log.info({ queries }, 'starting scraper (manual mode)');
    for (const q of queries) {
      const places = await searchBusinesses(q, 50);
      const querySector = detectSector(q).sector;
      const topCompetitors = places
        .filter(p => p.website && p.website.trim().length > 0)
        .map(p => ({ name: p.business_name, website: p.website as string }))
        .filter(isValidCompetitor)
        .filter(c => isSameSectorCompetitor(c.name, querySector))
        .slice(0, 3);
      for (const p of places) {
        const competitorsForLead = topCompetitors
          .filter(c => c.website !== p.website && c.name !== p.business_name)
          .slice(0, 3);
        await upsertLead({
          ...p,
          status: 'NEW',
          top_competitors: competitorsForLead.length > 0 ? competitorsForLead : null,
        });
      }
    }
    await analyzeAndFilter();
  } catch (err) {
    await notifyError('error', 'Scraper crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}
