import { loadEnv } from '../config/env.js';

const API_BASE = 'https://api.instantly.ai/api/v2';

export interface AddLeadParams {
  to: string;
  subject: string;
  /** [email inicial, follow-up 1..4]. 5 cuerpos HTML. */
  bodies: string[];
  leadDbId: string;
}

// Días de espera antes de cada step de la secuencia (0 = el inicial sale ya).
const SEQUENCE_DELAYS = [0, 3, 7, 14, 21];

export interface AddLeadResult {
  instantlyLeadId: string;
  skipped: boolean;
}

export interface InstantlyLead {
  id: string;
  email: string;
  status: number;
  timestamp_last_contact: string | null;
  timestamp_last_reply: string | null;
  email_reply_count: number;
  custom_variables: Record<string, unknown> | null;
}

export type LeadStatusFilter =
  | 'FILTER_VAL_REPLIED'
  | 'FILTER_VAL_BOUNCED'
  | 'FILTER_VAL_UNSUBSCRIBED'
  | 'FILTER_VAL_CONTACTED';

function authHeaders(): HeadersInit {
  const env = loadEnv();
  if (!env.INSTANTLY_API_KEY) throw new Error('INSTANTLY_API_KEY missing');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${env.INSTANTLY_API_KEY}`,
  };
}

function campaignId(): string {
  const env = loadEnv();
  if (!env.INSTANTLY_CAMPAIGN_ID) throw new Error('INSTANTLY_CAMPAIGN_ID missing');
  return env.INSTANTLY_CAMPAIGN_ID;
}

// Deja la campaña con la secuencia de 5 steps (inicial + 4 follow-ups). Cada step usa la
// variable {{emailN_body}} que rellenamos por lead en addLeadToCampaign. El asunto del
// inicial usa {{subject}}; los follow-ups van con asunto vacío para seguir el mismo hilo.
// Idempotente: se llama al boot (PATCH sobreescribe la secuencia con la misma estructura).
//
// stop_on_reply: true es CRÍTICO. Vía API este campo es false por defecto, así que hay que
// forzarlo aquí: si un lead responde, Instantly para de mandarle los follow-ups. Sin esto,
// una empresa que ya ha contestado seguiría recibiendo los 4 seguimientos (parecería un robot
// que no lee las respuestas).
export async function ensureCampaignSequence(): Promise<void> {
  const steps = SEQUENCE_DELAYS.map((delay, i) => ({
    type: 'email',
    delay,
    variants: [{
      subject: i === 0 ? '{{subject}}' : '',
      body: `{{email${i + 1}_body}}`,
    }],
  }));

  const res = await fetch(`${API_BASE}/campaigns/${campaignId()}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({
      sequences: [{ steps }],
      stop_on_reply: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instantly ensureCampaignSequence ${res.status}: ${body}`);
  }
}

export async function addLeadToCampaign(params: AddLeadParams): Promise<AddLeadResult> {
  // Cada step de la campaña usa {{emailN_body}}; pasamos los 5 cuerpos como custom vars.
  const bodyVars: Record<string, string> = {};
  params.bodies.forEach((b, i) => { bodyVars[`email${i + 1}_body`] = b; });

  const res = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      campaign: campaignId(),
      email: params.to,
      personalization: params.bodies[0],
      custom_variables: {
        subject: params.subject,
        lead_db_id: params.leadDbId,
        ...bodyVars,
      },
      skip_if_in_workspace: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instantly addLead ${res.status}: ${body}`);
  }

  const data = await res.json() as { id?: string; status?: number };
  if (!data.id) {
    return { instantlyLeadId: '', skipped: true };
  }
  return { instantlyLeadId: data.id, skipped: false };
}

interface ListLeadsResponse {
  items?: InstantlyLead[];
  next_starting_after?: string | null;
}

async function listLeadsPage(body: Record<string, unknown>): Promise<ListLeadsResponse> {
  const res = await fetch(`${API_BASE}/leads/list`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Instantly listLeads ${res.status}: ${err}`);
  }
  return await res.json() as ListLeadsResponse;
}

export async function listLeadsByStatus(filter: LeadStatusFilter, limit = 100): Promise<InstantlyLead[]> {
  const out: InstantlyLead[] = [];
  let cursor: string | null = null;
  while (true) {
    const page: ListLeadsResponse = await listLeadsPage({
      campaign: campaignId(),
      filter,
      limit,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    out.push(...(page.items ?? []));
    if (!page.next_starting_after) break;
    cursor = page.next_starting_after;
  }
  return out;
}

export async function listLeadsContactedSince(since: Date, limit = 100): Promise<InstantlyLead[]> {
  const sinceMs = since.getTime();
  const out: InstantlyLead[] = [];
  let cursor: string | null = null;
  while (true) {
    const page: ListLeadsResponse = await listLeadsPage({
      campaign: campaignId(),
      filter: 'FILTER_VAL_CONTACTED',
      limit,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    for (const lead of page.items ?? []) {
      if (lead.timestamp_last_contact && new Date(lead.timestamp_last_contact).getTime() > sinceMs) {
        out.push(lead);
      }
    }
    if (!page.next_starting_after) break;
    cursor = page.next_starting_after;
  }
  return out;
}

export function getLeadDbIdFromCustom(lead: InstantlyLead): string | null {
  const v = lead.custom_variables?.lead_db_id;
  return typeof v === 'string' ? v : null;
}
