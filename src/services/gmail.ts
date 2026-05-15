import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { loadEnv } from '../config/env.js';

let gmail: gmail_v1.Gmail | null = null;

function getGmail(): gmail_v1.Gmail {
  if (gmail) return gmail;
  const env = loadEnv();
  const oauth = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  gmail = google.gmail({ version: 'v1', auth: oauth });
  return gmail;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface SendEmailOutput {
  messageId: string;
  threadId: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailOutput> {
  const env = loadEnv();
  const boundary = '===boundary' + Date.now();
  const raw = [
    `From: "${env.SENDER_NAME}" <${env.GMAIL_USER_EMAIL}>`,
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    input.textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    input.htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const encoded = Buffer.from(raw, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const resp = await getGmail().users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });

  return {
    messageId: resp.data.id ?? '',
    threadId: resp.data.threadId ?? '',
  };
}

function encodeSubject(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

export interface ThreadMessage {
  id: string;
  fromEmail: string;
  isFromUs: boolean;
  bodyText: string;
  internalDate: number;
}

export async function getThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  const env = loadEnv();
  const resp = await getGmail().users.threads.get({ userId: 'me', id: threadId, format: 'full' });
  const messages = resp.data.messages ?? [];
  return messages.map(m => parseMessage(m, env.GMAIL_USER_EMAIL ?? ''));
}

function parseMessage(m: gmail_v1.Schema$Message, ourEmail: string): ThreadMessage {
  const headers = m.payload?.headers ?? [];
  const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value ?? '';
  const fromEmail = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  return {
    id: m.id ?? '',
    fromEmail,
    isFromUs: fromEmail === ourEmail.toLowerCase(),
    bodyText: extractText(m.payload),
    internalDate: parseInt(m.internalDate ?? '0'),
  };
}

function extractText(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      const t = extractText(p);
      if (t) return t;
    }
  }
  return '';
}
