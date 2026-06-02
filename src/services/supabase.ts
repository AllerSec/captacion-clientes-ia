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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Supabase/Cloudflare occasionally returns transient 522/timeouts that surface
// either as a thrown fetch error or as a non-JSON HTML body. Retrying with
// exponential backoff keeps a momentary blip from crashing the whole cron job.
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseMs = 500): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < retries) await sleep(baseMs * 2 ** i);
    }
  }
  throw last;
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
  return withRetry(async () => {
    const { data, error } = await getClient()
      .from('leads')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`getLeadsByStatus: ${error.message}`);
    return (data ?? []) as LeadRow[];
  });
}

export async function updateLead(id: string, patch: Partial<LeadRow>): Promise<void> {
  const { error } = await getClient().from('leads').update(patch).eq('id', id);
  if (error) throw new Error(`updateLead: ${error.message}`);
}

/** Busca el lead_id de Supabase a partir del instantlyLeadId guardado en notes. */
export async function findLeadByInstantlyId(instantlyLeadId: string): Promise<string | null> {
  const { data, error } = await getClient()
    .from('leads')
    .select('id')
    .like('notes', `%instantly_lead:${instantlyLeadId}%`)
    .limit(1);
  if (error) return null;
  return data?.[0]?.id ?? null;
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

export async function getActiveVariants(retries = 3, baseMs = 500): Promise<Array<{ id: string; name: string; prompt_snippet: string; weight: number }>> {
  return withRetry(async () => {
    const { data, error } = await getClient()
      .from('variants').select('id,name,prompt_snippet,weight').eq('active', true);
    if (error) throw new Error(`getActiveVariants: ${error.message}`);
    return data ?? [];
  }, retries, baseMs);
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

/** Devuelve un mapa query → última fecha de uso (epoch ms). Queries nunca usadas no aparecen. */
export async function getQueryLastUsedDates(): Promise<Map<string, number>> {
  const { data, error } = await getClient()
    .from('query_history')
    .select('query, scraped_at')
    .order('scraped_at', { ascending: false });
  if (error) throw new Error(`getQueryLastUsedDates: ${error.message}`);
  const map = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ query: string; scraped_at: string }>) {
    if (!map.has(r.query)) map.set(r.query, new Date(r.scraped_at).getTime());
  }
  return map;
}

export async function recordQueryUsed(query: string, tier: number, placesFound: number, uniqueInserted: number): Promise<void> {
  const { error } = await getClient().from('query_history').insert({
    query, tier, places_found: placesFound, unique_inserted: uniqueInserted,
  });
  if (error) throw new Error(`recordQueryUsed: ${error.message}`);
}

export async function getScraperState(): Promise<{ current_tier: number; last_burst_at: string | null }> {
  return withRetry(async () => {
    const { data, error } = await getClient().from('scraper_state').select('*').eq('id', 1).single();
    if (error) throw new Error(`getScraperState: ${error.message}`);
    return data;
  });
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
  return withRetry(async () => {
    const { count, error } = await getClient()
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'READY_TO_SEND');
    if (error) throw new Error(`countReadyToSend: ${error.message}`);
    return count ?? 0;
  });
}

// ---- Lecturas para el panel de estado (read-only) ----

export async function countLeadsByStatus(status: string): Promise<number> {
  return withRetry(async () => {
    const { count, error } = await getClient()
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);
    if (error) throw new Error(`countLeadsByStatus(${status}): ${error.message}`);
    return count ?? 0;
  });
}

/** Último lead que recibió un email propio del negocio vía enrichment (enriched_via='search'). */
export async function getLastEnrichedAt(): Promise<Date | null> {
  const { data, error } = await getClient()
    .from('leads')
    .select('enriched_at')
    .eq('enriched_via', 'search')
    .not('enriched_at', 'is', null)
    .order('enriched_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`getLastEnrichedAt: ${error.message}`);
  return data?.[0]?.enriched_at ? new Date(data[0].enriched_at) : null;
}

/** Última respuesta humana (lead RESPONDED) por responded_at. */
export async function getLastRespondedAt(): Promise<Date | null> {
  const { data, error } = await getClient()
    .from('leads')
    .select('responded_at')
    .eq('status', 'RESPONDED')
    .not('responded_at', 'is', null)
    .order('responded_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`getLastRespondedAt: ${error.message}`);
  return data?.[0]?.responded_at ? new Date(data[0].responded_at) : null;
}

/**
 * Cuenta leads enriquecidos en las últimas `hours` horas cuyo `notes` indica
 * falta de saldo de la fuente de email (Serper o Firecrawl). Es la señal
 * temprana de "te estás quedando sin créditos".
 */
export async function countRecentQuotaErrors(hours = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return withRetry(async () => {
    const { count, error } = await getClient()
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('enriched_at', since)
      .or(
        'notes.ilike.%serper_quota%,notes.ilike.%Insufficient credits%,notes.ilike.%serper_no_api_key%',
      );
    if (error) throw new Error(`countRecentQuotaErrors: ${error.message}`);
    return count ?? 0;
  });
}

/** Total de filas en leads (para la tarjeta de Supabase del centro de mando). */
export async function countAllLeads(): Promise<number> {
  return withRetry(async () => {
    const { count, error } = await getClient()
      .from('leads')
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(`countAllLeads: ${error.message}`);
    return count ?? 0;
  });
}

/** Próximo lead que el sender enviará (siguiente READY_TO_SEND por orden de cola). */
export async function getNextQueuedLead(): Promise<{ business_name: string; city: string | null } | null> {
  const { data, error } = await getClient()
    .from('leads')
    .select('business_name, city')
    .eq('status', 'READY_TO_SEND')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(`getNextQueuedLead: ${error.message}`);
  return data?.[0] ?? null;
}

/** Último negocio al que se le envió email (join emails_sent → leads por lead_id). */
export async function getLastEmailedBusiness(): Promise<{ business_name: string; sent_at: string } | null> {
  const { data, error } = await getClient()
    .from('emails_sent')
    .select('sent_at, leads(business_name)')
    .order('sent_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`getLastEmailedBusiness: ${error.message}`);
  const row: any = data?.[0];
  if (!row) return null;
  const name = Array.isArray(row.leads) ? row.leads[0]?.business_name : row.leads?.business_name;
  return { business_name: name ?? '—', sent_at: row.sent_at };
}

/** Conteo de emails enviados por día en los últimos `days` días (para la gráfica). */
export async function getDailySentCounts(days = 7): Promise<Array<{ day: string; count: number }>> {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  since.setHours(0, 0, 0, 0);
  const { data, error } = await getClient()
    .from('emails_sent')
    .select('sent_at')
    .gte('sent_at', since.toISOString());
  if (error) throw new Error(`getDailySentCounts: ${error.message}`);
  // Agrupar por día (clave YYYY-MM-DD) en JS.
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of (data ?? []) as Array<{ sent_at: string }>) {
    const key = new Date(r.sent_at).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([day, count]) => ({ day, count }));
}

/** Embudo: total scrapeado, con email, en cola, contactado, respondido. */
export async function getFunnelCounts(): Promise<{
  scraped: number; withEmail: number; queued: number; contacted: number; responded: number;
}> {
  const c = getClient();
  const head = { count: 'exact' as const, head: true };
  const [scraped, withEmail, ready, queued, contacted, responded] = await Promise.all([
    c.from('leads').select('*', head),
    c.from('leads').select('*', head).not('email', 'is', null).neq('email', ''),
    c.from('leads').select('*', head).eq('status', 'READY_TO_SEND'),
    c.from('leads').select('*', head).eq('status', 'QUEUED'),
    c.from('leads').select('*', head).eq('status', 'CONTACTED'),
    c.from('leads').select('*', head).eq('status', 'RESPONDED'),
  ]);
  return {
    scraped: scraped.count ?? 0,
    withEmail: withEmail.count ?? 0,
    queued: (ready.count ?? 0) + (queued.count ?? 0),
    contacted: contacted.count ?? 0,
    responded: responded.count ?? 0,
  };
}
