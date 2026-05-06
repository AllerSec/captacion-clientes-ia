import {
  getLeadsByStatus, updateLead, countSentToday, getLastSentAt, getFirstSentAt,
  getActiveVariants, recordEmailSent, recordMetric,
} from '../services/supabase.js';
import { generateEmail } from '../services/claude.js';
import { sendEmail } from '../services/gmail.js';
import { canSendNow } from '../core/send-policy.js';
import { buildUserPrompt, htmlToText, pickVariant } from '../core/email-composer.js';
import { SYSTEM_PROMPT } from '../prompts/system.js';
import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { notifyError } from '../core/health-monitor.js';
import { validateGeneratedEmail } from '../core/email-validator.js';
import type { WebSignals } from '../services/firecrawl.js';

export interface RunSenderOpts {
  now?: Date;
}

export async function runSender(opts: RunSenderOpts = {}): Promise<void> {
  try {
    const env = loadEnv();
    const log = logger.child({ job: 'sender' });

    if (env.KILL_SWITCH) {
      log.info('KILL_SWITCH active, skipping send');
      return;
    }

    const now = opts.now ?? new Date();

    const sentToday = await countSentToday();
    const lastSent = await getLastSentAt();
    const firstSent = await getFirstSentAt();

    const minutesSinceLastSend = lastSent
      ? (now.getTime() - lastSent.getTime()) / 60_000
      : Number.POSITIVE_INFINITY;
    const daysSinceFirstSend = firstSent
      ? Math.floor((now.getTime() - firstSent.getTime()) / 86_400_000) + 1
      : 1;

    const policy = canSendNow({
      now,
      sentToday,
      daysSinceFirstSend,
      minutesSinceLastSend,
      minIntervalMin: env.SEND_MIN_INTERVAL_MIN,
      maxIntervalMin: env.SEND_MAX_INTERVAL_MIN,
      quotaOverride: env.DAILY_QUOTA_OVERRIDE,
    });

    if (!policy.allowed) {
      log.info({ reason: policy.reason, sentToday, quota: policy.quota }, 'send skipped');
      return;
    }

    const variants = await getActiveVariants();
    if (variants.length === 0) {
      log.warn('no active variants — aborting');
      return;
    }

    const candidates = await getLeadsByStatus('READY_TO_SEND', 1);
    const lead = candidates[0];
    if (!lead) {
      log.info('no READY_TO_SEND leads');
      return;
    }

    const variant = pickVariant(variants, lead.id);
    if (!variant) {
      log.warn('no variant picked — aborting');
      return;
    }
    if (!lead.email) {
      await updateLead(lead.id, { status: 'SKIPPED', notes: 'missing_email' });
      return;
    }

    const sig = (lead as any).web_signals as WebSignals | null;
    const scenario: 'no_web' | 'old_website' = lead.website ? 'old_website' : 'no_web';
    const details = sig?.notableAntiquatedDetails ?? [];

    const userPrompt = buildUserPrompt({
      business_name: lead.business_name,
      category: lead.category ?? null,
      city: lead.city ?? null,
      rating: lead.rating ?? null,
      review_count: lead.review_count ?? null,
      website: lead.website ?? null,
      web_issues: lead.web_issues ?? [],
      web_visual_dated: (lead as any).web_visual_dated ?? null,
      web_visual_era: (lead as any).web_visual_era ?? null,
      web_visual_notes: (lead as any).web_visual_notes ?? null,
      footer_year: sig?.footerCopyrightYear ?? null,
      notable_antiquated_details: details,
      visual_era: sig?.visualEra ?? null,
    });

    let generated = await generateEmail({
      systemPrompt: SYSTEM_PROMPT,
      variantSnippet: variant.prompt_snippet,
      userPrompt,
    });

    let v = validateGeneratedEmail({
      subject: generated.subject,
      body: generated.body,
      scenario,
      details,
    });
    if (!v.ok) {
      log.warn({ leadId: lead.id, errors: v.errors }, 'email validation failed, retrying once');
      const retryPrompt = `${userPrompt}\n\nIMPORTANTE: tu intento anterior tuvo estos errores: ${v.errors.join(' | ')}. Corrígelos y vuelve a llamar a la tool send_email_draft.`;
      generated = await generateEmail({
        systemPrompt: SYSTEM_PROMPT,
        variantSnippet: variant.prompt_snippet,
        userPrompt: retryPrompt,
      });
      v = validateGeneratedEmail({
        subject: generated.subject,
        body: generated.body,
        scenario,
        details,
      });
      if (!v.ok) {
        log.error({ leadId: lead.id, errors: v.errors }, 'email validation failed after retry, skipping');
        await updateLead(lead.id, { status: 'SKIPPED', notes: 'invalid_generation:' + v.errors.join('|') });
        return;
      }
    }

    if (env.DRY_RUN) {
      log.info({ leadId: lead.id, subject: generated.subject, body: generated.body }, '[DRY_RUN] would send');
      // Mark this lead so subsequent dry-run iterations pick a different one.
      await updateLead(lead.id, { status: 'SKIPPED', notes: 'dry_run_preview' });
      return;
    }

    const gm = await sendEmail({
      to: lead.email,
      subject: generated.subject,
      htmlBody: generated.body,
      textBody: htmlToText(generated.body),
    });

    await recordEmailSent({
      lead_id: lead.id,
      subject: generated.subject,
      body: generated.body,
      variant_id: variant.id,
      gmail_message_id: gm.messageId,
      gmail_thread_id: gm.threadId,
    });
    await updateLead(lead.id, { status: 'CONTACTED', contacted_at: now.toISOString() });
    await recordMetric('sent', lead.id, variant.id, { variant_name: variant.name });

    log.info({ leadId: lead.id, business: lead.business_name }, 'email sent');
  } catch (err) {
    await notifyError('error', 'Sender crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}
