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
  web_visual_dated?: boolean | null;
  web_visual_era?: string | null;
  web_visual_notes?: string | null;
  status: string;
  notes?: string | null;
  contacted_at?: string | null;
  responded_at?: string | null;
  enriched_at?: string | null;
  enriched_via?: string | null;
  enriched_website?: string | null;
  top_competitors?: Array<{ name: string; website: string }> | null;
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

export async function getEmailByLead(leadId: string) {
  const { data, error } = await getClient()
    .from('emails_sent')
    .select('*')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`getEmailByLead: ${error.message}`);
  return data?.[0] ?? null;
}

const WATCHER_CURSOR_KEY = 'watcher_cursor';

export async function getWatcherCursor(): Promise<Date | null> {
  const { data, error } = await getClient()
    .from('alert_dedup')
    .select('last_sent')
    .eq('key', WATCHER_CURSOR_KEY)
    .limit(1);
  if (error) throw new Error(`getWatcherCursor: ${error.message}`);
  return data?.[0]?.last_sent ? new Date(data[0].last_sent) : null;
}

export async function setWatcherCursor(when: Date): Promise<void> {
  const { error } = await getClient()
    .from('alert_dedup')
    .upsert({ key: WATCHER_CURSOR_KEY, last_sent: when.toISOString() });
  if (error) throw new Error(`setWatcherCursor: ${error.message}`);
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

export async function getRecentlyUsedQueries(daysBack = 30): Promise<Set<string>> {
  const since = new Date(Date.now() - daysBack * 24 * 3600_000).toISOString();
  const { data, error } = await getClient()
    .from('query_history')
    .select('query')
    .gte('scraped_at', since);
  if (error) throw new Error(`getRecentlyUsedQueries: ${error.message}`);
  return new Set((data ?? []).map((r: any) => r.query));
}

export async function recordQueryUsed(query: string, tier: number, placesFound: number, uniqueInserted: number): Promise<void> {
  const { error } = await getClient().from('query_history').insert({
    query, tier, places_found: placesFound, unique_inserted: uniqueInserted,
  });
  if (error) throw new Error(`recordQueryUsed: ${error.message}`);
}

export async function getScraperState(): Promise<{ current_tier: number; last_burst_at: string | null }> {
  const { data, error } = await getClient().from('scraper_state').select('*').eq('id', 1).single();
  if (error) throw new Error(`getScraperState: ${error.message}`);
  return data;
}

export async function setScraperTier(tier: number): Promise<void> {
  const { error } = await getClient().from('scraper_state').update({ current_tier: tier }).eq('id', 1);
  if (error) throw new Error(`setScraperTier: ${error.message}`);
}

export async function markBurstDone(): Promise<void> {
  const { error } = await getClient().from('scraper_state').update({ last_burst_at: new Date().toISOString() }).eq('id', 1);
  if (error) throw new Error(`markBurstDone: ${error.message}`);
}

export async function countReadyToSend(): Promise<number> {
  const { count, error } = await getClient()
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'READY_TO_SEND');
  if (error) throw new Error(`countReadyToSend: ${error.message}`);
  return count ?? 0;
}
