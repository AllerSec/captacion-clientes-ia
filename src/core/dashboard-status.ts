/**
 * Lógica PURA del panel de estado. Recibe contadores/timestamps ya leídos y
 * decide los semáforos + arma los bloques. Sin red, sin imports de services.
 */

export type Light = 'green' | 'amber' | 'red';

export interface DashboardInput {
  now: number;
  // Envíos
  sentToday: number;
  queued: number;
  lastSentAt: number | null;
  lastEmailedBusiness: string | null;
  nextLead: { business_name: string; city: string | null } | null;
  // Gráfica 7 días
  dailySent: Array<{ day: string; count: number }>;
  // Embudo
  funnel: { scraped: number; withEmail: number; queued: number; contacted: number; responded: number };
  // Créditos / fuentes
  recentQuotaErrors: number;
  lastEnrichAt: number | null;
  apify: { usedUsd: number; limitUsd: number; cycleEnd: string | null } | null;
  // Instantly
  instantly: { emailsSent: number; contacted: number; opens: number; replies: number; bounced: number } | null;
  // Sistema
  lastSenderRun: number | null;
  lastWatcherRun: number | null;
  deployCommit: string | null;
  dbRows: number;
  // Respuestas
  totalResponded: number;
  lastRespondedAt: number | null;
}

export interface Block {
  light: Light;
  title: string;
  lines: string[];
}

export interface DashboardStatus {
  global: Light;
  updatedAt: number;
  envios: Block;
  proximo: Block;
  grafica: Block & { bars: Array<{ day: string; count: number }> };
  embudo: Block & { funnel: DashboardInput['funnel'] };
  creditos: Block & { apifyPct: number | null; apify: DashboardInput['apify']; dbRows: number };
  instantly: Block;
  sistema: Block;
  respuestas: Block;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function ago(now: number, ts: number | null): string {
  if (ts == null) return 'nunca';
  const diff = now - ts;
  if (diff < 0) return 'ahora';
  if (diff < HOUR) return `hace ${Math.max(1, Math.round(diff / 60000))} min`;
  if (diff < DAY) return `hace ${Math.round(diff / HOUR)} h`;
  return `hace ${Math.round(diff / DAY)} d`;
}

export function buildDashboardStatus(i: DashboardInput): DashboardStatus {
  // --- ENVÍOS ---
  const sentStale = i.lastSentAt != null && i.now - i.lastSentAt > DAY;
  const neverSent = i.lastSentAt == null;
  const envios: Block = {
    light: sentStale ? 'red' : neverSent ? 'amber' : 'green',
    title: 'Envíos',
    lines: [
      `Hoy: ${i.sentToday} enviados`,
      `En cola: ${i.queued}`,
      `Último: ${i.lastEmailedBusiness ?? '—'}`,
      `(${ago(i.now, i.lastSentAt)})`,
    ],
  };

  // --- PRÓXIMO EMAIL ---
  const proximo: Block = {
    light: i.nextLead ? 'green' : 'amber',
    title: 'Próximo email',
    lines: i.nextLead
      ? [i.nextLead.business_name, i.nextLead.city ?? '—']
      : ['Cola vacía', 'Esperando al scraper'],
  };

  // --- GRÁFICA 7 DÍAS ---
  const total7 = i.dailySent.reduce((s, d) => s + d.count, 0);
  const grafica: DashboardStatus['grafica'] = {
    light: 'green',
    title: 'Envíos · 7 días',
    lines: [`Total semana: ${total7}`],
    bars: i.dailySent,
  };

  // --- EMBUDO ---
  const embudo: DashboardStatus['embudo'] = {
    light: 'green',
    title: 'Embudo de leads',
    lines: [],
    funnel: i.funnel,
  };

  // --- CRÉDITOS / FUENTES ---
  const apifyPct = i.apify && i.apify.limitUsd > 0
    ? Math.round((i.apify.usedUsd / i.apify.limitUsd) * 100)
    : null;
  const apifyHigh = apifyPct != null && apifyPct >= 90;
  const creditos: DashboardStatus['creditos'] = {
    light: i.recentQuotaErrors > 0 || apifyHigh ? 'red' : 'green',
    title: 'Créditos / Fuentes',
    lines: [
      i.apify
        ? `Apify: $${i.apify.usedUsd.toFixed(2)} / $${i.apify.limitUsd} (${apifyPct}%)`
        : 'Apify: n/d',
      i.recentQuotaErrors > 0
        ? `⚠ ${i.recentQuotaErrors} fallos de saldo (24h)`
        : 'Serper activo, sin fallos',
      `Último enriquecido: ${ago(i.now, i.lastEnrichAt)}`,
    ],
    apifyPct,
    apify: i.apify,
    dbRows: i.dbRows,
  };

  // --- INSTANTLY ---
  const instantly: Block = {
    light: i.instantly ? 'green' : 'amber',
    title: 'Instantly (campaña)',
    lines: i.instantly
      ? [
          `Enviados: ${i.instantly.emailsSent}`,
          `Aperturas: ${i.instantly.opens}`,
          `Respuestas: ${i.instantly.replies}`,
          `Rebotes: ${i.instantly.bounced}`,
        ]
      : ['API no disponible', 'Revisar conexión'],
  };

  // --- SISTEMA ---
  const senderStale = i.lastSenderRun == null || i.now - i.lastSenderRun > DAY;
  const watcherStale = i.lastWatcherRun == null || i.now - i.lastWatcherRun > HOUR;
  const sistema: Block = {
    light: senderStale || watcherStale ? 'red' : 'green',
    title: 'Sistema',
    lines: [
      senderStale || watcherStale ? 'Railway: revisar' : 'Railway vivo',
      `Sender: ${ago(i.now, i.lastSenderRun)}`,
      `Watcher: ${ago(i.now, i.lastWatcherRun)}`,
      `Deploy: ${i.deployCommit ? i.deployCommit.slice(0, 7) : 'desconocido'}`,
    ],
  };

  // --- RESPUESTAS ---
  const recentReply = i.lastRespondedAt != null && i.now - i.lastRespondedAt < 3 * DAY;
  const respuestas: Block = {
    light: recentReply ? 'amber' : 'green',
    title: 'Respuestas',
    lines: [
      recentReply ? '¡Respuesta reciente!' : 'Sin respuestas nuevas',
      `Total: ${i.totalResponded}`,
      `Última: ${ago(i.now, i.lastRespondedAt)}`,
    ],
  };

  // --- GLOBAL --- (rojo si algún bloque crítico está rojo)
  const anyRed = [envios, creditos, sistema].some(b => b.light === 'red');
  const global: Light = anyRed ? 'red' : 'green';

  return { global, updatedAt: i.now, envios, proximo, grafica, embudo, creditos, instantly, sistema, respuestas };
}
