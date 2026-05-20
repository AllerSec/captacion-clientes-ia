import { updateLead, recordMetric, getEmailByLead } from '../services/supabase.js';
import {
  listLeadsByStatus,
  listLeadsContactedSince,
  getLeadDbIdFromCustom,
  type InstantlyLead,
} from '../services/instantly.js';
import { logger } from '../lib/logger.js';
import { notifyError } from '../core/health-monitor.js';
import { getWatcherCursor, setWatcherCursor } from '../services/supabase.js';

export async function runWatcher(): Promise<void> {
  try {
    const log = logger.child({ job: 'watcher' });
    const now = new Date();

    const lastCheck = await getWatcherCursor();
    const since = lastCheck ?? new Date(Date.now() - 24 * 3600_000);

    const contacted = await listLeadsContactedSince(since);
    log.info({ count: contacted.length, since: since.toISOString() }, 'leads newly contacted');
    for (const lead of contacted) {
      const dbId = getLeadDbIdFromCustom(lead);
      if (!dbId) {
        log.warn({ instantlyId: lead.id }, 'contacted lead has no lead_db_id custom var');
        continue;
      }
      const email = await getEmailByLead(dbId);
      await updateLead(dbId, {
        status: 'CONTACTED',
        contacted_at: lead.timestamp_last_contact ?? new Date().toISOString(),
      });
      await recordMetric('sent', dbId, email?.variant_id ?? null, { instantly_lead_id: lead.id });
    }

    const replied = await listLeadsByStatus('FILTER_VAL_REPLIED');
    log.info({ count: replied.length }, 'leads with replies');
    for (const lead of replied) {
      const dbId = getLeadDbIdFromCustom(lead);
      if (!dbId) {
        log.warn({ instantlyId: lead.id }, 'replied lead has no lead_db_id custom var');
        continue;
      }
      const email = await getEmailByLead(dbId);
      await updateLead(dbId, {
        status: 'RESPONDED',
        responded_at: lead.timestamp_last_reply ?? new Date().toISOString(),
      });
      await recordMetric('replied', dbId, email?.variant_id ?? null, { instantly_lead_id: lead.id });
    }

    const bounced = await listLeadsByStatus('FILTER_VAL_BOUNCED');
    log.info({ count: bounced.length }, 'leads bounced');
    for (const lead of bounced) {
      const dbId = getLeadDbIdFromCustom(lead);
      if (!dbId) {
        log.warn({ instantlyId: lead.id }, 'bounced lead has no lead_db_id custom var');
        continue;
      }
      const email = await getEmailByLead(dbId);
      await updateLead(dbId, { status: 'BOUNCED' });
      await recordMetric('bounced', dbId, email?.variant_id ?? null, { instantly_lead_id: lead.id });
    }

    await setWatcherCursor(now);
  } catch (err) {
    await notifyError('error', 'Watcher crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}

// Re-export for tests that previously imported helpers
export { type InstantlyLead };
