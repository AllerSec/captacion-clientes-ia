/**
 * Lógica PURA del panel de estado. Recibe contadores/timestamps ya leídos y
 * decide los semáforos. Sin red, sin imports de services → testeable en frío.
 */

export type Light = 'green' | 'amber' | 'red';

export interface DashboardInput {
  now: number; // Date.now()
  // Envíos
  sentToday: number;
  queued: number; // QUEUED + READY_TO_SEND
  lastSentAt: number | null;
  totalContacted: number;
  // Créditos / fuentes
  recentQuotaErrors: number; // leads con notes de quota en las últimas 24h
  lastEnrichAt: number | null;
  // Sistema
  lastSenderRun: number | null;
  lastWatcherRun: number | null;
  deployCommit: string | null;
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
  creditos: Block;
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
  // 🔴 si lleva >24h sin enviar nada (y ya hubo envíos antes). 🟢 si hay actividad reciente.
  const sentStale = i.lastSentAt != null && i.now - i.lastSentAt > DAY;
  const neverSent = i.lastSentAt == null;
  const envios: Block = {
    light: sentStale ? 'red' : neverSent ? 'amber' : 'green',
    title: 'Envíos',
    lines: [
      `Hoy: ${i.sentToday} enviados`,
      `En cola: ${i.queued}`,
      `Último envío: ${ago(i.now, i.lastSentAt)}`,
      `Contactados (total): ${i.totalContacted}`,
    ],
  };

  // --- CRÉDITOS / FUENTES ---
  // 🔴 si hay errores de quota recientes (Serper/Firecrawl sin saldo). 🟢 si no.
  const creditos: Block = {
    light: i.recentQuotaErrors > 0 ? 'red' : 'green',
    title: 'Créditos / Fuentes',
    lines: [
      i.recentQuotaErrors > 0
        ? `⚠ ${i.recentQuotaErrors} fallos de saldo (24h)`
        : 'Serper activo, sin fallos',
      `Último enriquecido: ${ago(i.now, i.lastEnrichAt)}`,
    ],
  };

  // --- SISTEMA ---
  // 🔴 si sender >24h o watcher >1h sin correr (mismos umbrales que los watchdogs).
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
  // 🟡 (informativo) si hay alguna respuesta reciente, para que no se pierda.
  const recentReply = i.lastRespondedAt != null && i.now - i.lastRespondedAt < 3 * DAY;
  const respuestas: Block = {
    light: recentReply ? 'amber' : 'green',
    title: 'Respuestas',
    lines: [
      recentReply ? '¡Respuesta reciente!' : 'Sin respuestas nuevas',
      `Total respondidos: ${i.totalResponded}`,
      `Última: ${ago(i.now, i.lastRespondedAt)}`,
    ],
  };

  // --- GLOBAL ---
  // 🔴 si algún bloque está 🔴. Si no, 🟢 (el ámbar de respuestas es buena señal, no alerta).
  const anyRed = [envios, creditos, sistema, respuestas].some(b => b.light === 'red');
  const global: Light = anyRed ? 'red' : 'green';

  return { global, updatedAt: i.now, envios, creditos, sistema, respuestas };
}
