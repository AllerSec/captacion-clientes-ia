import { getLeadsByStatus, updateLead, recordMetric, getEmailByLead } from '../services/supabase.js';
import { getThreadMessages } from '../services/gmail.js';
import { classifyReplyText } from '../services/claude.js';
import { classifyReply } from '../core/response-detector.js';
import { logger } from '../lib/logger.js';
import { notifyError } from '../core/health-monitor.js';

export async function runWatcher(): Promise<void> {
  try {
    const log = logger.child({ job: 'watcher' });
    const leads = await getLeadsByStatus('CONTACTED', 200);
    log.info({ count: leads.length }, 'checking contacted leads');

    for (const lead of leads) {
      try {
        const email = await getEmailByLead(lead.id);
        if (!email) continue;

        const messages = await getThreadMessages(email.gmail_thread_id);
        const incoming = messages.filter((m: { isFromUs: boolean }) => !m.isFromUs);
        if (incoming.length === 0) continue;

        const latest = incoming.sort((a: { internalDate: number }, b: { internalDate: number }) =>
          b.internalDate - a.internalDate
        )[0];
        const kind = await classifyReply(latest.bodyText, classifyReplyText);

        const now = new Date().toISOString();
        if (kind === 'human_reply') {
          await updateLead(lead.id, { status: 'RESPONDED', responded_at: now });
          await recordMetric('replied', lead.id, email.variant_id ?? null, { thread: email.gmail_thread_id });
          log.info({ leadId: lead.id }, 'human reply detected');
        } else if (kind === 'auto_reply') {
          await updateLead(lead.id, { status: 'AUTO_REPLY' });
          await recordMetric('auto_reply', lead.id, email.variant_id ?? null, {});
        } else if (kind === 'bounce') {
          await updateLead(lead.id, { status: 'BOUNCED' });
          await recordMetric('bounced', lead.id, email.variant_id ?? null, {});
        }
      } catch (err) {
        log.error({ err, leadId: lead.id }, 'watcher failed for lead');
      }
    }
  } catch (err) {
    await notifyError('error', 'Watcher crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}
