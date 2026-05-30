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

/**
 * Extrae el token de la petición. Acepta dos vías:
 * - Header `Authorization: Bearer <token>` (preferida; no queda en logs de URL).
 * - Query `?key=<token>` (fallback, para poder abrir el panel desde un favorito).
 *
 * El HTML del panel lee el `?key=` solo en la carga inicial, lo borra de la barra
 * con history.replaceState y a partir de ahí usa el header. Así el token no se
 * repite en cada línea de log ni permanece en el historial del navegador.
 */
export function extractToken(rawUrl: string, authHeader?: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (header && header.startsWith('Bearer ')) {
    const t = header.slice(7).trim();
    if (t) return t;
  }
  const q = rawUrl.indexOf('?');
  if (q === -1) return null;
  const params = new URLSearchParams(rawUrl.slice(q + 1));
  return params.get('key');
}
