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
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: input.systemPrompt + (input.variantSnippet ? '\n\n' + input.variantSnippet : ''),
        cache_control: { type: 'ephemeral' },
      } as any,
    ],
    messages: [{ role: 'user', content: input.userPrompt }],
  });

  const textBlock = resp.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('Claude returned no text');
  const text = textBlock.text.trim();

  // Extract JSON from response (might be wrapped in code fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude response not JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]);
  if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Claude JSON missing subject/body');
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
