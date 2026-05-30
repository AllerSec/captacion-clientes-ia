import { timingSafeEqual } from 'node:crypto';

/**
 * Decide si una petición al panel está autorizada.
 *
 * - Si no hay `expected` (PANEL_TOKEN sin configurar) → acceso abierto (no rompe
 *   a quien no lo configure; el panel sigue siendo opcionalmente protegible).
 * - Si hay `expected` → `provided` debe coincidir exactamente. Comparación en
 *   tiempo constante para no filtrar el token por timing.
 */
export function isPanelAuthorized(expected: string | undefined, provided: string | null): boolean {
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Extrae el token de la query string (?key=...). */
export function extractToken(rawUrl: string): string | null {
  const q = rawUrl.indexOf('?');
  if (q === -1) return null;
  const params = new URLSearchParams(rawUrl.slice(q + 1));
  return params.get('key');
}
