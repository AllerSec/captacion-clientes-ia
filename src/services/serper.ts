import { loadEnv } from '../config/env.js';
import { notifyError } from '../core/health-monitor.js';

/**
 * Adaptador de Serper.dev (Google Search API) usado como fuente de email/web
 * en el enricher. Reemplaza a `firecrawl.searchBusinessInfo` con la MISMA firma
 * y el MISMO tipo de retorno, para que `lead-enricher.ts` solo cambie el import.
 *
 * Serper devuelve resultados orgánicos de Google con snippet (no la página
 * completa). El snippet de Google suele contener el email del negocio, que es
 * lo que `judgeEnrichment` necesita.
 *
 * Free tier: 2.500 búsquedas de regalo, sin tarjeta. Al agotarse, Serper
 * responde 429/403 → devolvemos ok:false + aviso por health-monitor, y el
 * enricher hace parada limpia (el resto del scraper sigue).
 */

export interface SearchResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
}

export type SearchBusinessInfoResult =
  | { ok: true; query: string; results: SearchResult[]; durationMs: number }
  | { ok: false; query: string; error: string; durationMs: number };

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const RESULT_LIMIT = 5;

export async function searchBusinessInfo(query: string): Promise<SearchBusinessInfoResult> {
  const start = Date.now();
  const env = loadEnv();

  if (!env.SERPER_API_KEY) {
    return { ok: false, query, error: 'serper_no_api_key', durationMs: Date.now() - start };
  }

  let resp: Response;
  try {
    resp = await fetch(SERPER_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-KEY': env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: 'es', hl: 'es', num: RESULT_LIMIT }),
    });
  } catch (err) {
    return {
      ok: false,
      query,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }

  // Sin saldo o key inválida: aviso al operador y parada limpia.
  if (resp.status === 429 || resp.status === 403) {
    await notifyError(
      'warn',
      'Serper sin saldo',
      `Serper devolvió ${resp.status}. Se han agotado las búsquedas gratis (o la API key no es válida). ` +
        `El enrichment de leads sin email queda en pausa; el resto del scraper sigue. ` +
        `Da de alta una nueva key en serper.dev o cambia de fuente.`,
    );
    return { ok: false, query, error: 'serper_quota_exhausted', durationMs: Date.now() - start };
  }

  if (!resp.ok) {
    return {
      ok: false,
      query,
      error: `serper_http_${resp.status}`,
      durationMs: Date.now() - start,
    };
  }

  let data: any;
  try {
    data = await resp.json();
  } catch (err) {
    return {
      ok: false,
      query,
      error: 'serper_bad_json',
      durationMs: Date.now() - start,
    };
  }

  const organic = Array.isArray(data?.organic) ? (data.organic as any[]) : [];
  const results: SearchResult[] = organic
    .map(item => ({
      url: String(item?.link ?? ''),
      title: typeof item?.title === 'string' ? item.title : undefined,
      description: typeof item?.snippet === 'string' ? item.snippet : undefined,
    }))
    .filter(r => r.url.length > 0);

  return { ok: true, query, results, durationMs: Date.now() - start };
}
