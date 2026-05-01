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
