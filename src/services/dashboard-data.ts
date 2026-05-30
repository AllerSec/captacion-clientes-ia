import {
  countSentToday, getLastSentAt, countReadyToSend, countLeadsByStatus,
  getLastEnrichedAt, getLastRespondedAt, countRecentQuotaErrors,
  getNextQueuedLead, getLastEmailedBusiness, getDailySentCounts, getFunnelCounts,
  countAllLeads,
} from './supabase.js';
import { getApifyUsage } from './apify-usage.js';
import { getCampaignAnalytics } from './instantly.js';
import { getRuntimeState } from '../core/runtime-state.js';
import { buildDashboardStatus, type DashboardStatus } from '../core/dashboard-status.js';

/**
 * Ensambla el estado del panel: lee Supabase + APIs externas (Apify, Instantly) +
 * estado en memoria + commit del deploy, y delega la decisión a buildDashboardStatus.
 * Las APIs externas devuelven null si fallan (el panel lo refleja sin romperse).
 */
export async function getDashboardData(): Promise<DashboardStatus> {
  const now = Date.now();

  const [
    sentToday, lastSentAt, ready, queuedSending,
    totalResponded, lastEnrichAt, lastRespondedAt, recentQuotaErrors,
    nextLead, lastEmailed, dailySent, funnel, apify, instantly, dbRows,
  ] = await Promise.all([
    countSentToday(),
    getLastSentAt(),
    countReadyToSend(),
    countLeadsByStatus('QUEUED'),
    countLeadsByStatus('RESPONDED'),
    getLastEnrichedAt(),
    getLastRespondedAt(),
    countRecentQuotaErrors(24),
    getNextQueuedLead(),
    getLastEmailedBusiness(),
    getDailySentCounts(7),
    getFunnelCounts(),
    getApifyUsage(),
    getCampaignAnalytics(),
    countAllLeads(),
  ]);

  const { lastSenderRun, lastWatcherRun } = getRuntimeState();

  return buildDashboardStatus({
    now,
    sentToday,
    queued: ready + queuedSending,
    lastSentAt: lastSentAt ? lastSentAt.getTime() : null,
    lastEmailedBusiness: lastEmailed ? lastEmailed.business_name : null,
    nextLead,
    dailySent,
    funnel,
    recentQuotaErrors,
    lastEnrichAt: lastEnrichAt ? lastEnrichAt.getTime() : null,
    apify,
    instantly,
    lastSenderRun,
    lastWatcherRun,
    deployCommit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    dbRows,
    totalResponded,
    lastRespondedAt: lastRespondedAt ? lastRespondedAt.getTime() : null,
  });
}
