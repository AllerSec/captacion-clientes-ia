# Reemplazo de Firecrawl por Serper como fuente de email — Design

**Fecha:** 2026-05-30
**Autor:** Unax + Claude
**Estado:** Aprobado, en implementación

## Problema

El enricher (`src/services/lead-enricher.ts`) usa Firecrawl Search para encontrar
el email de negocios sin web. El plan gratis de Firecrawl da 1.000 créditos/mes y,
tras acelerar el scraper a ~775 leads/día (2026-05-30), se agotó en 2 días. Medido
en producción (`wtwonijrnzjaknlysenl`):

- 398 leads `enrich_error`, de ellos ~197 "Insufficient credits" + ~197 "Rate limit
  exceeded (>100 req/min)". Concentrados el 29-30 de mayo.
- Firecrawl es responsable de **20 de los 45 leads enviados (44%)**: NO se puede
  eliminar sin amputar el pipeline.
- Para negocios sin web, Apify encuentra email **0 veces** → el enricher es la única
  fuente de email de ese segmento.

## Objetivo

Sustituir Firecrawl por una **fuente de búsqueda gratuita** que aguante el volumen,
sin gasto recurrente y sin tarjeta de crédito, dejando intacto el resto del sistema.

## Decisión de fuente: Serper.dev

| Fuente | Free tier | Tarjeta | Índice | Veredicto |
|---|---|---|---|---|
| **Serper.dev** | 2.500 búsquedas (regalo, 6 meses) | No | Google real | **Elegida** |
| Brave Search | $5/mes (~1.000 q) recurrente | Sí | Propio | Fricción (tarjeta + atribución) |
| SerpAPI | 100/mes | No | Google | Insuficiente |

Serper: resultados de Google reales (mejor para negocios locales ES, cuyo email
suele estar en su Facebook/Páginas Amarillas indexado por Google), sin tarjeta,
2.500 búsquedas que a ritmo real duran ~2-3 meses.

## Arquitectura

El enricher ya está desacoplado: `enrichLead()` llama a `searchBusinessInfo(query)`
y pasa los resultados a `judgeEnrichment()` (Claude). **Solo se sustituye la función
de búsqueda.** Claude, el flujo del scraper y los estados del lead NO cambian.

### Componentes

1. **`src/services/serper.ts`** (nuevo)
   - `searchBusinessInfo(query: string): Promise<SearchBusinessInfoResult>` — **misma
     firma exacta** que la de Firecrawl (mismo tipo de retorno, mismos campos
     `{ ok, query, results: [{url, title, description, markdown?}], durationMs }`).
   - Llama a `POST https://google.serper.dev/search` con `{ q, gl: 'es', hl: 'es',
     num: 5 }` y header `X-API-KEY`.
   - Mapea `organic[]` → `results[]`: `url=link`, `title=title`, `description=snippet`.
     No hay `markdown` (Serper devuelve snippets, no la página completa); el snippet
     de Google suele contener el email del negocio, que es lo que `judgeEnrichment`
     necesita.
   - Manejo de errores:
     - HTTP 429/403 → `{ ok: false, error: 'serper_quota_exhausted' }` + dispara
       `notifyError('warn', 'Serper sin saldo', ...)` (best-effort, no bloquea).
     - Otros errores → `{ ok: false, error: <mensaje> }`.

2. **`src/config/env.ts`**
   - Añadir `SERPER_API_KEY: z.string().min(1).optional()`. Opcional para que el
     sistema arranque sin ella; si falta, `searchBusinessInfo` devuelve `ok:false`
     y el enricher hace parada limpia.

3. **`src/services/lead-enricher.ts`**
   - Cambiar el import de `'./firecrawl.js'` a `'./serper.js'`. Única línea tocada.

4. **`tests/services/serper.ts`** (nuevo)
   - Mock de `fetch` a nivel de módulo. Casos: resultados OK mapeados, 429 →
     `serper_quota_exhausted`, error de red → `ok:false`.

### Parada limpia al agotarse (decisión del usuario)

Cuando Serper se quede sin saldo:
- `searchBusinessInfo` devuelve `ok:false` → `enrichLead` ya retorna `kind:'error'`
  → `analyzeOneLead` marca el lead `SKIPPED notes='enrich_error: serper_quota...'`.
- El scraper **sigue capturando** leads que ya traen email/web. Solo se pausa el
  enriquecimiento de los sin-email.
- Aviso por email vía `health-monitor` (dedup 6h ya incluido).

## Fuera de alcance (YAGNI)

- No se toca `judgeEnrichment`, su prompt, ni los estados del lead.
- No se monta cascada a Brave (mejora futura cuando Serper se agote en ~2 meses).
- No se borra `firecrawl.ts` (se conserva para posible análisis visual futuro).
- No se reprocesan los 327 errores transitorios ya caídos (decisión: parada limpia,
  no reintento).

## Riesgo

Único cambio de comportamiento: Serper da snippets, Firecrawl daba página completa.
Para extraer email puede ser igual o mejor. **Se verifica con `npm run test:pipeline`
(dry-run) sobre leads reales antes de declarar "funciona".**

## Lo único que requiere acción del usuario

Dar de alta en serper.dev (gratis, Google login, sin tarjeta) y proveer
`SERPER_API_KEY` en `.env` local y en Railway. Todo lo demás es automático.
