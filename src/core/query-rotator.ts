import { QUERIES_BY_TIER, MAX_TIER } from '../config/queries.js';

export interface RotationInput {
  /** Queries usadas en los últimos 30 días. Set para lookup O(1). */
  recentlyUsed: Set<string>;
  /** Tier actual del estado del scraper. */
  currentTier: number;
}

export interface RotationResult {
  query: string | null;
  tier: number;
  /** true si hemos saltado a un tier nuevo en esta llamada. */
  jumpedTier: boolean;
  /** Si query es null y no hay nada nuevo en absoluto. */
  exhausted: boolean;
}

/**
 * Devuelve la siguiente query no usada, empezando por currentTier.
 * Si el tier actual está agotado, salta al siguiente.
 * Si todos los tiers están agotados, devuelve { exhausted: true }.
 */
export function pickNextQuery(input: RotationInput): RotationResult {
  let tier = input.currentTier;
  let jumpedTier = false;

  while (tier <= MAX_TIER) {
    const queries = QUERIES_BY_TIER[tier] ?? [];
    for (const q of queries) {
      if (!input.recentlyUsed.has(q)) {
        return { query: q, tier, jumpedTier, exhausted: false };
      }
    }
    // tier exhausted, jump
    tier += 1;
    jumpedTier = true;
  }

  return { query: null, tier: MAX_TIER, jumpedTier: false, exhausted: true };
}

export interface BurstSelection {
  queries: string[];
  tier: number;
}

/**
 * Modo burst inicial: devuelve TODAS las queries de los tiers 1, 2, 3 que no se hayan usado.
 * Pensado para el primer día.
 */
export function burstQueries(recentlyUsed: Set<string>, maxBurstTier = 3): BurstSelection {
  const all: string[] = [];
  for (let t = 1; t <= maxBurstTier; t++) {
    for (const q of QUERIES_BY_TIER[t] ?? []) {
      if (!recentlyUsed.has(q)) all.push(q);
    }
  }
  return { queries: all, tier: maxBurstTier };
}

// ─── Modo recurrente perpetuo ──────────────────────────────────────────────

export interface RecurringInput {
  /** Mapa query → época ms de última ejecución. Queries ausentes = nunca usadas. */
  lastUsed: Map<string, number>;
  /** Cuántas queries seleccionar este tick. */
  count: number;
  /** Cooldown mínimo en ms antes de reutilizar una query (default 7 días). */
  cooldownMs?: number;
}

export interface RecurringSelection {
  queries: Array<{ q: string; tier: number }>;
}

/**
 * Selecciona `count` queries priorizando:
 *   1. Queries nunca usadas (orden tier 1 → 8, orden de lista).
 *   2. Queries con cooldown expirado, ordenadas por la más antigua primero.
 *
 * Nunca devuelve una lista vacía mientras existan queries en el catálogo:
 * si todas están en cooldown, devuelve las más antiguas igualmente
 * (prefiriendo reciclar antes que no hacer nada).
 */
export function pickRecurringQueries(input: RecurringInput): RecurringSelection {
  const cooldownMs = input.cooldownMs ?? 7 * 24 * 3600_000;
  const now = Date.now();

  const never: Array<{ q: string; tier: number }> = [];
  const expired: Array<{ q: string; tier: number; lastMs: number }> = [];
  const inCooldown: Array<{ q: string; tier: number; lastMs: number }> = [];

  for (let tier = 1; tier <= MAX_TIER; tier++) {
    for (const q of QUERIES_BY_TIER[tier] ?? []) {
      const lastMs = input.lastUsed.get(q);
      if (lastMs === undefined) {
        never.push({ q, tier });
      } else if (now - lastMs >= cooldownMs) {
        expired.push({ q, tier, lastMs });
      } else {
        inCooldown.push({ q, tier, lastMs });
      }
    }
  }

  // Ordenar expired por más antigua primero (mayor tiempo sin usar)
  expired.sort((a, b) => a.lastMs - b.lastMs);
  inCooldown.sort((a, b) => a.lastMs - b.lastMs);

  const pool = [
    ...never.map(x => ({ q: x.q, tier: x.tier })),
    ...expired.map(x => ({ q: x.q, tier: x.tier })),
    ...inCooldown.map(x => ({ q: x.q, tier: x.tier })),
  ];

  return { queries: pool.slice(0, input.count) };
}
