import { sendEmail } from '../services/gmail.js';
import { shouldFireAlert } from '../services/supabase.js';
import { loadEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

export type Severity = 'warn' | 'error';

export async function notifyError(severity: Severity, title: string, detail: string): Promise<void> {
  const env = loadEnv();
  const key = `${severity}:${title}`;

  let allowed = true;
  try {
    allowed = await shouldFireAlert(key, 6);
  } catch (err) {
    logger.error({ err }, 'shouldFireAlert failed; sending anyway');
  }
  if (!allowed) return;

  const icon = severity === 'error' ? '❌' : '⚠️';
  const subject = `[CAPTACION-IA] ${icon} ${title}`;
  const html = `<p><b>${title}</b></p><pre style="font-family:monospace;white-space:pre-wrap">${escapeHtml(detail)}</pre>`;
  const text = `${title}\n\n${detail}`;

  try {
    await sendEmail({ to: env.GMAIL_USER_EMAIL, subject, htmlBody: html, textBody: text });
  } catch (err) {
    logger.error({ err, title }, 'failed to deliver alert email');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
