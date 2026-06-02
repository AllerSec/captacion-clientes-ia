import {
  getLeadsByStatus, updateLead, getActiveVariants, recordMetric, recordEmailSent,
} from '../services/supabase.js';
import { generateEmail } from '../services/claude.js';
import { addLeadToCampaign } from '../services/instantly.js';
import { canSendNow } from '../core/send-policy.js';
import { buildUserPrompt, pickVariant } from '../core/email-composer.js';
import { buildSystemPrompt } from '../prompts/system.js';
import { detectSector } from '../core/sector-detector.js';
import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { notifyError } from '../core/health-monitor.js';
import { validateSequence } from '../core/email-validator.js';

export interface RunSenderOpts {
  now?: Date;
}

export async function runSender(opts: RunSenderOpts = {}): Promise<void> {
  try {
    const env = loadEnv();
    const log = logger.child({ job: 'sender' });

    const policy = canSendNow({ killSwitch: env.KILL_SWITCH });
    if (!policy.allowed) {
      log.info({ reason: policy.reason }, 'send skipped');
      if (policy.reason === 'kill_switch') {
        await notifyError('warn', 'KILL_SWITCH activo', 'El sender está bloqueado por KILL_SWITCH=true. Ningún email se enviará hasta que se desactive en Railway.');
      }
      return;
    }

    const now = opts.now ?? new Date();

    if (!env.INSTANTLY_API_KEY || !env.INSTANTLY_CAMPAIGN_ID) {
      await notifyError('error', 'Instantly sin credenciales', 'INSTANTLY_API_KEY o INSTANTLY_CAMPAIGN_ID no configurados en Railway. Ningún email se enviará.');
      return;
    }

    const variants = await getActiveVariants();
    if (variants.length === 0) {
      await notifyError('warn', 'Sin variantes activas', 'No hay variantes activas en la tabla variants. El sender no puede generar emails.');
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

    const queryUsed = (lead as any).query_used as string | undefined;
    const sectorInfo = detectSector(queryUsed, lead.category, lead.business_name);
    const systemPrompt = buildSystemPrompt(sectorInfo);

    const userPrompt = buildUserPrompt({
      business_name: lead.business_name,
      category: lead.category ?? null,
      city: lead.city ?? null,
      rating: lead.rating ?? null,
      review_count: lead.review_count ?? null,
      website: null,
      web_issues: ['no_website'],
      top_competitors: (lead as any).top_competitors ?? null,
    });

    let generated = await generateEmail({
      systemPrompt,
      variantSnippet: variant.prompt_snippet,
      userPrompt,
    });

    const topComps = ((lead as any).top_competitors ?? []) as Array<{ name: string; website: string }>;
    const requiredCompetitorName = topComps.length > 0 ? topComps[0].name : null;
    let v = validateSequence({
      subject: generated.subject,
      bodies: generated.bodies,
      scenario: 'no_web',
      requiredExampleUrl: sectorInfo.exampleUrl,
      requiredCompetitorName,
    });
    if (!v.ok) {
      log.warn({ leadId: lead.id, errors: v.errors }, 'sequence validation failed, retrying once');
      const retryPrompt = `${userPrompt}\n\nIMPORTANTE: tu intento anterior tuvo estos errores: ${v.errors.join(' | ')}. Corrígelos y vuelve a llamar a la tool send_email_draft con los 5 cuerpos.`;
      generated = await generateEmail({
        systemPrompt,
        variantSnippet: variant.prompt_snippet,
        userPrompt: retryPrompt,
      });
      v = validateSequence({
        subject: generated.subject,
        bodies: generated.bodies,
        scenario: 'no_web',
        requiredExampleUrl: sectorInfo.exampleUrl,
        requiredCompetitorName,
      });
      if (!v.ok) {
        log.error({ leadId: lead.id, errors: v.errors }, 'sequence validation failed after retry, skipping');
        await updateLead(lead.id, { status: 'SKIPPED', notes: 'invalid_generation:' + v.errors.join('|') });
        return;
      }
    }

    if (env.DRY_RUN) {
      log.info({ leadId: lead.id, subject: generated.subject, bodies: generated.bodies }, '[DRY_RUN] would queue');
      await updateLead(lead.id, { status: 'SKIPPED', notes: 'dry_run_preview' });
      return;
    }

    const result = await addLeadToCampaign({
      to: lead.email,
      subject: generated.subject,
      bodies: generated.bodies,
      leadDbId: lead.id,
    });

    if (result.skipped) {
      log.info({ leadId: lead.id, email: lead.email }, 'lead skipped by Instantly (already in workspace)');
      await updateLead(lead.id, { status: 'SKIPPED', notes: 'instantly_duplicate' });
      return;
    }

    // emails_sent row created at queue time so the generated content is preserved
    // for audit even if Instantly never actually ships. sent_at = queued_at; the
    // watcher updates lead.status to CONTACTED once Instantly confirms real send.
    await recordEmailSent({
      lead_id: lead.id,
      subject: generated.subject,
      body: generated.bodies[0],
      variant_id: variant.id,
      gmail_message_id: result.instantlyLeadId,
      gmail_thread_id: '',
    });
    await updateLead(lead.id, {
      status: 'QUEUED',
      notes: `instantly_lead:${result.instantlyLeadId}|queued_at:${now.toISOString()}`,
    });
    await recordMetric('queued', lead.id, variant.id, {
      variant_name: variant.name,
      instantly_lead_id: result.instantlyLeadId,
    });

    log.info({ leadId: lead.id, instantlyLeadId: result.instantlyLeadId, business: lead.business_name }, 'lead queued in Instantly');
  } catch (err) {
    await notifyError('error', 'Sender crashed', err instanceof Error ? (err.stack ?? err.message) : String(err));
    throw err;
  }
}
