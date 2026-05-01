import { searchBusinesses } from '../services/apify.js';
import { upsertLead, getLeadsByStatus, updateLead } from '../services/supabase.js';
import { fetchWebsite } from '../services/web-fetcher.js';
import { analyzeHtml } from '../core/web-analyzer.js';
import { qualifyLead } from '../core/lead-filter.js';
import { logger } from '../lib/logger.js';

export async function runScraper(queries: string[]): Promise<void> {
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
    if (lead.website) {
      const fetched = await fetchWebsite(lead.website);
      const r = analyzeHtml(fetched);
      web_score = r.score;
      web_issues = r.issues;
    } else {
      web_issues = ['no_website'];
    }
    await updateLead(lead.id, {
      status: 'ANALYZED', web_score, web_issues,
      web_analyzed_at: new Date().toISOString(),
    });
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
    });
    await updateLead(lead.id, {
      status: q.qualified ? 'READY_TO_SEND' : 'SKIPPED',
      notes: q.reason ?? null,
    });
  }

  log.info('scraper finished');
}
