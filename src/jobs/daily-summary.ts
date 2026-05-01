import { getClient } from '../services/supabase.js';
import { sendEmail } from '../services/gmail.js';
import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

export async function runDailySummary(): Promise<void> {
  const env = loadEnv();
  const log = logger.child({ job: 'daily-summary' });
  const sb = getClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  // Sent today
  const { count: sentToday } = await sb.from('emails_sent')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', since);

  // Replies today (from metrics)
  const { count: repliesToday } = await sb.from('metrics')
    .select('*', { count: 'exact', head: true })
    .eq('event', 'replied')
    .gte('ts', since);

  const { count: autoRepliesToday } = await sb.from('metrics')
    .select('*', { count: 'exact', head: true })
    .eq('event', 'auto_reply')
    .gte('ts', since);

  const { count: bouncesToday } = await sb.from('metrics')
    .select('*', { count: 'exact', head: true })
    .eq('event', 'bounced')
    .gte('ts', since);

  // Status counts
  const { data: statuses } = await sb.from('leads').select('status').limit(10000);
  const statusCounts: Record<string, number> = {};
  for (const r of statuses ?? []) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

  // Next 3 leads
  const { data: nextLeads } = await sb.from('leads')
    .select('business_name,city,web_visual_era')
    .eq('status', 'READY_TO_SEND')
    .order('created_at', { ascending: true })
    .limit(3);

  const nextLeadsHtml = (nextLeads ?? []).length === 0
    ? '<i>No quedan leads READY_TO_SEND. Mañana el scraper buscará más automáticamente.</i>'
    : (nextLeads ?? []).map(l =>
        `<li>${l.business_name} (${l.city ?? 'sin ciudad'})${l.web_visual_era ? ' — web era: ' + l.web_visual_era : ''}</li>`
      ).join('');

  const statusHtml = Object.entries(statusCounts).sort()
    .map(([s, n]) => `<li>${s}: ${n}</li>`).join('');

  const html = `
    <h2>Resumen del ${today}</h2>
    <ul>
      <li><b>Emails enviados hoy:</b> ${sentToday ?? 0}</li>
      <li><b>Respuestas humanas hoy:</b> ${repliesToday ?? 0}</li>
      <li><b>Auto-replies hoy:</b> ${autoRepliesToday ?? 0}</li>
      <li><b>Bounces hoy:</b> ${bouncesToday ?? 0}</li>
      <li><b>READY_TO_SEND restantes:</b> ${statusCounts['READY_TO_SEND'] ?? 0}</li>
    </ul>
    <h3>Próximos 3 leads (orden de envío):</h3>
    <ul>${nextLeadsHtml}</ul>
    <h3>Total por estado:</h3>
    <ul>${statusHtml}</ul>
    <p style="color:#888;font-size:11px">Resumen automático de Captación Clientes IA.</p>
  `;

  const text = `Resumen del ${today}\n\nEmails enviados hoy: ${sentToday ?? 0}\nRespuestas humanas hoy: ${repliesToday ?? 0}\nAuto-replies: ${autoRepliesToday ?? 0}\nBounces: ${bouncesToday ?? 0}\nREADY_TO_SEND restantes: ${statusCounts['READY_TO_SEND'] ?? 0}`;

  try {
    await sendEmail({
      to: env.GMAIL_USER_EMAIL,
      subject: `[CAPTACION-IA] Resumen del ${today}`,
      htmlBody: html,
      textBody: text,
    });
    log.info('daily summary sent');
  } catch (err) {
    log.error({ err }, 'daily summary failed');
  }
}
