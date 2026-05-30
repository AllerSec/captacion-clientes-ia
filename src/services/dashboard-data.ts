import {
  countSentToday, getLastSentAt, countReadyToSend, countLeadsByStatus,
  getLastEnrichedAt, getLastRespondedAt, countRecentQuotaErrors,
} from './supabase.js';
import { getRuntimeState } from '../core/runtime-state.js';
import { buildDashboardStatus, type DashboardStatus } from '../core/dashboard-status.js';

/**
 * Ensambla el estado del panel: lee Supabase + estado en memoria + commit del
 * deploy, y delega la decisión de semáforos al módulo puro buildDashboardStatus.
 */
export async function getDashboardData(): Promise<DashboardStatus> {
  const now = Date.now();

  const [
    sentToday, lastSentAt, queuedReady, queuedSending,
    totalContacted, totalResponded, lastEnrichAt, lastRespondedAt, recentQuotaErrors,
  ] = await Promise.all([
    countSentToday(),
    getLastSentAt(),
    countReadyToSend(),
    countLeadsByStatus('QUEUED'),
    countLeadsByStatus('CONTACTED'),
    countLeadsByStatus('RESPONDED'),
    getLastEnrichedAt(),
    getLastRespondedAt(),
    countRecentQuotaErrors(24),
  ]);

  const { lastSenderRun, lastWatcherRun } = getRuntimeState();

  return buildDashboardStatus({
    now,
    sentToday,
    queued: queuedReady + queuedSending,
    lastSentAt: lastSentAt ? lastSentAt.getTime() : null,
    totalContacted,
    recentQuotaErrors,
    lastEnrichAt: lastEnrichAt ? lastEnrichAt.getTime() : null,
    lastSenderRun,
    lastWatcherRun,
    deployCommit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    totalResponded,
    lastRespondedAt: lastRespondedAt ? lastRespondedAt.getTime() : null,
  });
}
