import { loadEnv } from '../config/env.js';

/**
 * Lee el uso mensual de Apify (USD gastados vs límite) desde su API.
 * Endpoint verificado: GET /v2/users/me/limits → { data: { limits, current, monthlyUsageCycle } }.
 * Solo lectura; si falla, devuelve null (el panel lo muestra como "n/d").
 */
export interface ApifyUsage {
  usedUsd: number;
  limitUsd: number;
  cycleEnd: string | null;
}

export async function getApifyUsage(): Promise<ApifyUsage | null> {
  const env = loadEnv();
  try {
    const r = await fetch('https://api.apify.com/v2/users/me/limits', {
      headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const d = j?.data ?? j;
    const used = d?.current?.monthlyUsageUsd;
    const limit = d?.limits?.maxMonthlyUsageUsd;
    if (typeof used !== 'number' || typeof limit !== 'number') return null;
    return {
      usedUsd: used,
      limitUsd: limit,
      cycleEnd: d?.monthlyUsageCycle?.endAt ?? null,
    };
  } catch {
    return null;
  }
}
