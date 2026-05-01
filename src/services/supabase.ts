import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from '../config/env.js';

export interface LeadRow {
  id: string;
  place_id: string;
  business_name: string;
  category?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  rating?: number | null;
  review_count?: number | null;
  web_score?: number | null;
  web_issues?: string[] | null;
  web_analyzed_at?: string | null;
  status: string;
  notes?: string | null;
  contacted_at?: string | null;
  responded_at?: string | null;
  created_at?: string;
}

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!client) {
    const env = loadEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export async function upsertLead(row: Partial<LeadRow> & { place_id: string; business_name: string }): Promise<LeadRow> {
  const { data, error } = await getClient()
    .from('leads')
    .upsert(row, { onConflict: 'place_id' })
    .select()
    .single();
  if (error) throw new Error(`upsertLead: ${error.message}`);
  return data as LeadRow;
}

export async function getLeadsByStatus(status: string, limit = 100): Promise<LeadRow[]> {
  const { data, error } = await getClient()
    .from('leads')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`getLeadsByStatus: ${error.message}`);
  return (data ?? []) as LeadRow[];
}

export async function updateLead(id: string, patch: Partial<LeadRow>): Promise<void> {
  const { error } = await getClient().from('leads').update(patch).eq('id', id);
  if (error) throw new Error(`updateLead: ${error.message}`);
}

export async function recordEmailSent(row: {
  lead_id: string; subject: string; body: string;
  variant_id: string | null; gmail_message_id: string; gmail_thread_id: string;
}): Promise<void> {
  const { error } = await getClient().from('emails_sent').insert(row);
  if (error) throw new Error(`recordEmailSent: ${error.message}`);
}

export async function recordMetric(event: string, lead_id: string | null, variant_id: string | null, metadata?: Record<string, unknown>): Promise<void> {
  const { error } = await getClient().from('metrics').insert({ event, lead_id, variant_id, metadata });
  if (error) throw new Error(`recordMetric: ${error.message}`);
}

export async function countSentToday(): Promise<number> {
  const start = new Date(); start.setHours(0,0,0,0);
  const { count, error } = await getClient()
    .from('emails_sent')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', start.toISOString());
  if (error) throw new Error(`countSentToday: ${error.message}`);
  return count ?? 0;
}

export async function getLastSentAt(): Promise<Date | null> {
  const { data, error } = await getClient()
    .from('emails_sent').select('sent_at').order('sent_at', { ascending: false }).limit(1);
  if (error) throw new Error(`getLastSentAt: ${error.message}`);
  return data?.[0]?.sent_at ? new Date(data[0].sent_at) : null;
}

export async function getFirstSentAt(): Promise<Date | null> {
  const { data, error } = await getClient()
    .from('emails_sent').select('sent_at').order('sent_at', { ascending: true }).limit(1);
  if (error) throw new Error(`getFirstSentAt: ${error.message}`);
  return data?.[0]?.sent_at ? new Date(data[0].sent_at) : null;
}

export async function getActiveVariants(): Promise<Array<{ id: string; name: string; prompt_snippet: string; weight: number }>> {
  const { data, error } = await getClient()
    .from('variants').select('id,name,prompt_snippet,weight').eq('active', true);
  if (error) throw new Error(`getActiveVariants: ${error.message}`);
  return data ?? [];
}

export async function getEmailByThread(thread_id: string) {
  const { data, error } = await getClient()
    .from('emails_sent').select('*').eq('gmail_thread_id', thread_id).limit(1);
  if (error) throw new Error(`getEmailByThread: ${error.message}`);
  return data?.[0] ?? null;
}

export async function shouldFireAlert(key: string, cooldownHours = 6): Promise<boolean> {
  const { data, error } = await getClient()
    .from('alert_dedup').select('last_sent').eq('key', key).limit(1);
  if (error) throw new Error(`shouldFireAlert read: ${error.message}`);
  const last = data?.[0]?.last_sent ? new Date(data[0].last_sent) : null;
  if (last && (Date.now() - last.getTime()) < cooldownHours * 3600_000) return false;
  const { error: upErr } = await getClient()
    .from('alert_dedup')
    .upsert({ key, last_sent: new Date().toISOString() });
  if (upErr) throw new Error(`shouldFireAlert write: ${upErr.message}`);
  return true;
}
