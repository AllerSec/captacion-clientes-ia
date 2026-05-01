import { searchBusinesses } from '../services/apify.js';
import { upsertLead, getLeadsByStatus, updateLead } from '../services/supabase.js';
import { fetchWebsite } from '../services/web-fetcher.js';
import { analyzeHtml } from '../core/web-analyzer.js';
import { qualifyLead } from '../core/lead-filter.js';
import { logger } from '../lib/logger.js';
import { notifyError } from '../core/health-monitor.js';
import { captureScreenshot } from '../services/web-screenshotter.js';
import { analyzeScreenshot } from '../services/claude.js';

export async function runScraper(queries: string[]): Promise<void> {
  try {
    const log = logger.child({ job: 'scraper' });
    log.info({ queries }, 'starting scraper');

    for (const q of queries) {
      try {
        const places = await searchBusinesses(q, 50);
        log.info({ query: q, count: places.length }, 'fetched places');
        for (const p of places) {
          await upsertLead({ ...p, status: 'NEW' });
        }
      } catch (err) {
        log.error({ err, query: q }, 'apify search failed');
        throw err;
      }
    }

    // Analyze NEW leads
    const news = await getLeadsByStatus('NEW', 200);
    for (const lead of news) {
      let web_score = 100;
      let web_issues: string[] = [];
      let visual: { looksDated?: boolean; era?: string; notes?: string } = {};
      try {
        if (lead.website) {
          const fetched = await fetchWebsite(lead.website);
          const r = analyzeHtml(fetched);
          web_score = r.score;
          web_issues = r.issues;
          // Visual analysis if site reachable. Hard 25s timeout per lead.
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
        } else {
          web_issues = ['no_website'];
        }
      } catch (err) {
        log.warn({ err: (err as Error).message, leadId: lead.id }, 'analysis failed; continuing');
      }
      try {
        await updateLead(lead.id, {
          status: 'ANALYZED', web_score, web_issues,
          web_analyzed_at: new Date().toISOString(),
          web_visual_dated: visual.looksDated ?? null,
          web_visual_era: visual.era ?? null,
          web_visual_notes: visual.notes ?? null,
        });
      } catch (err) {
        log.error({ err, leadId: lead.id }, 'updateLead failed');
      }
    }

    // Filter ANALYZED
    const analyzed = await getLeadsByStatus('ANALYZED', 500);
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
    }

    log.info('scraper finished');
  } catch (err) {
    await notifyError('error', 'Scraper crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}
