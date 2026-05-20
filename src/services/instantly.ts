import { loadEnv } from '../config/env.js';

const API_BASE = 'https://api.instantly.ai/api/v2';

export interface AddLeadParams {
  to: string;
  subject: string;
  htmlBody: string;
  leadDbId: string;
}

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

export async function addLeadToCampaign(params: AddLeadParams): Promise<AddLeadResult> {
  const res = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      campaign: campaignId(),
      email: params.to,
      personalization: params.htmlBody,
      custom_variables: {
        subject: params.subject,
        lead_db_id: params.leadDbId,
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
