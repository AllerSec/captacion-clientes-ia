import Anthropic from '@anthropic-ai/sdk';
import { loadEnv } from '../config/env.js';
import type { ReplyKind } from '../core/response-detector.js';

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: loadEnv().ANTHROPIC_API_KEY });
  return client;
}

export interface GenerateEmailInput {
  systemPrompt: string;
  variantSnippet: string;
  userPrompt: string;
}

export interface GenerateEmailOutput {
  subject: string;
  body: string;
}

export async function generateEmail(input: GenerateEmailInput): Promise<GenerateEmailOutput> {
  const env = loadEnv();
  const resp = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1200,
    system: [
      {
        type: 'text',
        text: input.systemPrompt + (input.variantSnippet ? '\n\n' + input.variantSnippet : ''),
        cache_control: { type: 'ephemeral' },
      } as any,
    ],
    tools: [
      {
        name: 'send_email_draft',
        description: 'Devuelve el email generado en formato estructurado.',
        input_schema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Asunto del email' },
            body: { type: 'string', description: 'Cuerpo del email en HTML (solo <p> y <b>)' },
          },
          required: ['subject', 'body'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'send_email_draft' },
    messages: [{ role: 'user', content: input.userPrompt }],
  });

  const toolUse = resp.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not use the send_email_draft tool');
  }
  const parsed = toolUse.input as { subject?: unknown; body?: unknown };
  if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Claude tool output missing subject/body');
  }
  return { subject: parsed.subject, body: parsed.body };
}

export async function classifyReplyText(body: string): Promise<ReplyKind> {
  const env = loadEnv();
  const prompt = `Clasifica el siguiente correo como UNA de estas tres categorías:
- "human_reply": una persona real respondiendo (positiva o negativa, da igual)
- "auto_reply": auto-respuesta (vacaciones, fuera de oficina, robot)
- "bounce": notificación de fallo de entrega

Responde SOLO con la palabra exacta, sin nada más.

Correo:
"""${body.slice(0, 2000)}"""`;
  const resp = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 10,
    messages: [{ role: 'user', content: prompt }],
  });
  const txt = resp.content.find(b => b.type === 'text');
  if (!txt || txt.type !== 'text') return 'human_reply';
  const t = txt.text.trim().toLowerCase();
  if (t.includes('auto_reply')) return 'auto_reply';
  if (t.includes('bounce')) return 'bounce';
  return 'human_reply';
}
