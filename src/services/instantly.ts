import { loadEnv } from '../config/env.js';

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface SendEmailResult {
  messageId: string;
  threadId: string;
}

export async function sendEmailInstantly(params: SendEmailParams): Promise<SendEmailResult> {
  const env = loadEnv();

  if (!env.INSTANTLY_API_KEY || !env.INSTANTLY_FROM_EMAIL) {
    throw new Error('INSTANTLY_API_KEY and INSTANTLY_FROM_EMAIL are required');
  }

  const res = await fetch('https://api.instantly.ai/api/v2/emails/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.INSTANTLY_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.INSTANTLY_FROM_EMAIL,
      from_name: env.INSTANTLY_FROM_NAME,
      reply_to: 'info@unaxaller.com',
      to: [params.to],
      subject: params.subject,
      body: params.htmlBody,
      plain_text: params.textBody,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Instantly API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { id?: string; thread_id?: string };
  return {
    messageId: data.id ?? crypto.randomUUID(),
    threadId: data.thread_id ?? crypto.randomUUID(),
  };
}
