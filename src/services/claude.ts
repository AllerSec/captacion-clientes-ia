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

export interface VisualJudgment {
  looksDated: boolean;
  designEra: string;        // e.g. "early 2010s", "modern", "around 2018"
  notes: string;            // free-form short observation in Spanish, e.g. "diseño plano sin jerarquía, tipografía Arial"
  professionalScore: number; // 0-100, 100 = looks like a 2024 professional site
}

export async function analyzeScreenshot(base64Jpeg: string): Promise<VisualJudgment> {
  const env = loadEnv();
  const resp = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 400,
    tools: [
      {
        name: 'report_visual',
        description: 'Reporta el juicio visual de una web tras verla.',
        input_schema: {
          type: 'object',
          properties: {
            looksDated: { type: 'boolean', description: 'true si el diseño parece anticuado / antiguo / amateur' },
            designEra: { type: 'string', description: 'estimación de época del diseño (ej: "early 2010s", "moderna", "alrededor de 2018")' },
            notes: { type: 'string', description: 'observación corta en español de España sobre el diseño visual (1-2 frases máx)' },
            professionalScore: { type: 'number', description: '0-100, donde 100 = web profesional moderna como las de 2024' },
          },
          required: ['looksDated', 'designEra', 'notes', 'professionalScore'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_visual' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg },
          },
          {
            type: 'text',
            text: 'Esta es la web actual de un negocio (clínica, despacho, etc) en España. Júzgala visualmente como diseñador web profesional. ¿Parece anticuada? ¿De qué época? Da una nota concreta corta en español de España sobre lo que ves (tipografía, colores, layout, jerarquía, calidad de imágenes). Llama a la tool report_visual.',
          },
        ] as any,
      },
    ],
  });

  const toolUse = resp.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude visual: no tool_use returned');
  const parsed = toolUse.input as VisualJudgment;
  return parsed;
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
