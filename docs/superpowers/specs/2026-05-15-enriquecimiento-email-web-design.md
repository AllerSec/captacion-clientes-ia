# Diseño: enriquecimiento de email y web desde Internet

**Fecha:** 2026-05-15
**Estado:** aprobado
**Autor:** sesión Claude con Unax

## Contexto

Hoy el scraper consulta Apify (Google Maps) y, para cada negocio, recibe `email`
y `website`. La regla actual:

- Si `website` está presente → SKIPPED (`has_website`). Solo contactamos
  negocios sin web.
- Si `email` falta → SKIPPED (`no_email`). No podemos enviar nada.

Google Maps no es exhaustivo. Hay negocios que **sí** tienen email público
(en RRSS, directorios sectoriales, agregadores) pero Maps no lo ha capturado.
Y al revés: hay negocios cuya web propia existe pero no aparece como
`website` en su ficha de Maps, sólo en resultados de Google. Hoy esos
casos se pierden por silencio.

Objetivo: cuando Maps no devuelve email, buscar en Internet para:

1. **Recuperar email**, si existe.
2. **Verificar que el negocio no tiene web propia real** (no perfiles de
   RRSS, no agregadores, no fichas de ayuntamiento, no cadenas de
   franquicia: una web del negocio, con su dominio).

Si el enriquecimiento encuentra web propia → descartamos.
Si encuentra email y no encuentra web propia → enviamos.
Si no encuentra nada → descartamos por `no_email_after_enrich`.

## No-objetivos

- **No** enriquecemos cuando Maps ya trae email. Si Maps da email pero no
  da website, asumimos que no tiene web propia y enviamos directo.
  (Decisión del usuario: ahorra coste, asume que Maps es correcto cuando
  da datos.)
- **No** añadimos un nuevo proveedor de búsqueda externo. Reutilizamos
  Firecrawl, que ya está integrado y tiene endpoint `/search` con
  `scrapeOptions` opcional para devolver markdown de cada resultado en
  una sola llamada.
- **No** introducimos un job/cron nuevo. El enriquecimiento ocurre dentro
  de `analyzeOneLead`, en línea, con paralelismo 3 (el que ya existe).
- **No** introducimos un estado nuevo en el ciclo de vida del lead. La
  decisión sigue siendo NEW → ANALYZED → READY_TO_SEND ó SKIPPED.

## Cuándo se dispara el enriquecimiento

Un lead entra en `analyzeOneLead` con `status='NEW'`. La rama nueva:

1. Si `lead.website` está presente (Maps lo trae) → SKIPPED
   (`has_website`). **Sin cambios.**
2. Si `lead.website` está vacío Y `lead.email` está vacío → **enriquecer**.
3. Si `lead.website` está vacío Y `lead.email` está presente → **no
   enriquecer**: pasa al `qualifyLead` normal con los datos de Maps.

Es decir, el enriquecimiento sólo se ejecuta para leads sin website y sin
email. Es el único caso ambiguo: hoy los descartaríamos como `no_email`;
el cambio les da una segunda oportunidad.

## Pre-gate de qualify (importante)

Antes de gastar créditos Firecrawl en buscar, aplicamos un qualify rápido
con los datos de Maps:

- `rating < 4.0` → SKIPPED (`low_rating`). No enriquecer.
- `review_count < 15` → SKIPPED (`few_reviews`). No enriquecer.
- `business_name` en blacklist → SKIPPED (`blacklisted`). No enriquecer.

Esto evita gastar búsquedas en leads que vamos a descartar de todas
formas. El qualify completo (con email final) se aplica después del
enriquecimiento.

## Arquitectura

### Nuevo módulo: `src/services/lead-enricher.ts`

Servicio externo (vive en `services/` porque llama a Firecrawl y a
Claude). Una única función pública:

```ts
export interface EnrichInput {
  business_name: string;
  city: string | null;
  province: string | null;
  category: string | null;
}

export type EnrichOutcome =
  | { kind: 'has_real_website'; website_url: string; reasoning: string }
  | { kind: 'email_found'; email: string; reasoning: string }
  | { kind: 'nothing_found'; reasoning: string }
  | { kind: 'error'; error: string };

export async function enrichLead(
  input: EnrichInput
): Promise<EnrichOutcome>;
```

Internamente:

1. Construye una query: `"{business_name} {city}"` (o sólo nombre si la
   ciudad está vacía).
2. Llama a `firecrawl.search(query, { limit: 5, sources: ['web'],
   scrapeOptions: { formats: ['markdown'], onlyMainContent: true,
   timeout: 8000 } })`. Esto devuelve top 5 resultados de búsqueda **con
   markdown del cuerpo de los 1–2 primeros** (Firecrawl scrapea solo lo
   que cabe en el timeout del endpoint).
3. Recoge: para cada resultado, `{ url, title, description, markdown? }`.
   Trunca cada markdown a 3.000 caracteres para limitar tokens.
4. Pasa esa lista a `services/claude.ts → judgeEnrichment()` (función
   nueva), que devuelve la decisión estructurada vía tool use.

### Nueva función en `src/services/claude.ts`: `judgeEnrichment`

```ts
export interface EnrichmentInput {
  business_name: string;
  city: string | null;
  category: string | null;
  results: Array<{
    url: string;
    title?: string;
    description?: string;
    markdown?: string;
  }>;
}

export interface EnrichmentJudgment {
  has_real_website: boolean;
  website_url: string | null; // populated only if has_real_website
  email: string | null;       // best email found, null si ninguno
  reasoning: string;          // 1-2 frases en español, para logging
}

export async function judgeEnrichment(
  input: EnrichmentInput
): Promise<EnrichmentJudgment>;
```

System prompt (resumen, en español):

> Vas a analizar resultados de búsqueda de un negocio español pequeño.
> Tu objetivo: decidir si el negocio tiene **web propia real** y si
> aparece un **email** del negocio.
>
> NO cuentan como web propia:
> - Perfiles de redes sociales (Instagram, Facebook, TikTok, LinkedIn,
>   X/Twitter, YouTube).
> - Agregadores/directorios (Páginas Amarillas, Doctoralia, Yelp,
>   TripAdvisor, Foursquare, Infofarmacia, Einforma, Axesor, fichas de
>   Google Maps).
> - Páginas oficiales (ayuntamientos `.gob.es`, colegios profesionales,
>   asociaciones de comerciantes).
> - Marketplaces o fichas dentro de webs de cadena/franquicia
>   (multiopticas.com, alainafflelou.es, federopticos.com,
>   farmaciaonline.es y similares).
>
> SÍ cuenta: un dominio propio cuya página claramente describe **este
> negocio en particular** (no una cadena, no un directorio).
>
> Para email: extrae uno solo, el más probable de pertenecer al negocio.
> Descarta noreply@, no-reply@, info@google.com, dominios @example.

Tool: `report_enrichment` con `{ has_real_website, website_url, email,
reasoning }`. `tool_choice` forzado.

Modelo: `env.ANTHROPIC_MODEL` (mismo que el resto). Sin caching: las
entradas son distintas por lead.

### Cambios en `src/jobs/scraper.ts → analyzeOneLead`

```text
si lead.website:
    SKIPPED 'has_website'  (sin cambios)
si NO lead.email:
    1. pre-qualify rápido (rating/reviews/blacklist) con email=null permitido
       - si rating/reviews/blacklist falla -> SKIPPED razón correspondiente
    2. enrichLead(...)
       - has_real_website -> SKIPPED 'has_website_found_online',
                             guardar enriched_website=<url>, enriched_at=now
       - email_found -> updateLead({ email, enriched_at, enriched_via:'search' })
                        y caer en la rama qualify de "tengo email"
       - nothing_found -> SKIPPED 'no_email_after_enrich'
       - error -> SKIPPED 'enrich_error' + notes con error.message
si lead.email:
    qualifyLead normal -> ANALYZED ó SKIPPED
```

El qualify normal sigue igual: rating, reviews, blacklist, email válido.

### Cambios en `src/core/lead-filter.ts`

Hoy `qualifyLead` rechaza `!email` con `no_email`. Lo dejamos así, pero
añadimos un helper sin email:

```ts
export function qualifyLeadPreEnrich(
  l: Omit<LeadInput, 'email' | 'website'>
): QualifyResult {
  // chequea rating, review_count, blacklist. No mira email/website.
}
```

`qualifyLead` se queda como está (lo siguen usando los tests y las ramas
que ya tienen email).

### Cambios en `src/services/supabase.ts` y schema

Tres columnas nuevas en `leads`:

| Columna             | Tipo        | Nullable | Default | Notas |
|---------------------|-------------|----------|---------|-------|
| `enriched_at`       | timestamptz | sí       | null    | cuándo corrió el enricher |
| `enriched_via`      | text        | sí       | null    | `'search'` por ahora |
| `enriched_website`  | text        | sí       | null    | URL juzgada como web propia (solo si has_real_website=true) |

No hace falta migración manual obvia para el ORM porque `updateLead`
acepta `Partial<LeadRow>`. Sí hay que añadirlas al schema de Supabase y
al tipo `LeadRow`.

Migración SQL (en `docs/superpowers/specs/.../migration.sql` o
inline en el spec):

```sql
alter table leads
  add column if not exists enriched_at timestamptz,
  add column if not exists enriched_via text,
  add column if not exists enriched_website text;

create index if not exists idx_leads_enriched_at
  on leads(enriched_at)
  where enriched_at is not null;
```

El índice es para poder medir tasa de éxito del enricher en `npm run
stats`.

### Cambios en `notes` y motivos SKIPPED

Nuevos valores posibles en el campo `notes` cuando `status='SKIPPED'`:

- `has_website_found_online` — Internet reveló web propia.
- `no_email_after_enrich` — buscamos, no encontramos email.
- `enrich_error` — Firecrawl o Claude fallaron; el lead queda fuera del
  ciclo pero el motivo es transitorio (podemos reintentar manualmente).

### Logging y métricas

`recordMetric` ya existe. Disparamos eventos:

- `enrich_started` con `lead_id`, metadata `{ business_name, city }`.
- `enrich_result` con `lead_id`, metadata `{ outcome, reasoning,
  durationMs, firecrawlMs, claudeMs }`. `outcome` ∈ {`has_real_website`,
  `email_found`, `nothing_found`, `error`}.

Esto permite ver en `metrics` cuántas búsquedas convirtieron en lead vs
se descartaron, y el coste medio en tiempo.

### Límite de coste

Firecrawl `search` con `scrapeOptions` cuenta como 1 search + N scrapes
(donde N es el `limit` con `scrapeOptions`). Para mantener el coste
bajo:

- `limit: 5` resultados totales.
- `scrapeOptions` aplicado solo a los 2 primeros (Firecrawl lo permite
  vía el campo `scrapeOptions.maxScrapes` si existe; si no, hacemos
  `limit: 2` con scrape y luego un segundo `search` sin scrape — pero
  esto duplica búsquedas, así que descartado: dejamos `limit: 5` con
  scrape, asumimos coste).

Concretamente: ~5 créditos Firecrawl por lead sin email. A 2000
créditos/mes en el plan actual y ~200 leads sin email/mes esperados, es
~1000 créditos = la mitad del presupuesto. Aceptable.

Si el volumen escala, el siguiente paso (no en este spec) sería
introducir un `enrichment_cache` por `(business_name, city)` con TTL
30 días, ya que cuando volvemos a scrapear una ciudad reaparecen los
mismos negocios.

### Manejo de errores

`enrichLead` nunca lanza. Captura todos los fallos y devuelve
`{ kind: 'error', error: msg }`. La razón:

- Si Firecrawl está caído, el scraper no debe morir.
- El lead queda en SKIPPED con `notes='enrich_error'`, no en NEW
  perpetuo. Si quisiéramos reintentar, se puede manualmente devolver el
  lead a `status='NEW'` desde Supabase.

Health-monitor: si en una corrida de scraper > 50% de los leads
enriquecidos terminan en `enrich_error`, disparamos
`notifyError('error', 'Enricher failure rate alta', ...)`. Detalles en
plan de implementación.

### DRY_RUN

Cuando `DRY_RUN=true`:

- `enrichLead` se ejecuta normalmente (queremos ver qué decisiones toma).
- Pero **no** persiste cambios: el caller no escribe en `leads` si
  `DRY_RUN`. (Esto ya se gestiona arriba en el scraper, no es nuevo:
  añadimos un log adicional con el outcome.)

En `npm run test:pipeline` esto permitirá ver, por cada lead sin email,
qué encontró el enricher y qué habría hecho.

## Testing

### Tests unitarios nuevos

`tests/services/lead-enricher.test.ts`:

1. **Búsqueda devuelve web propia real con email** → outcome
   `email_found` (no descarta porque el dominio en cuestión, según
   judgeEnrichment, es propio del negocio). Validamos que distinguimos
   correctamente.
2. **Búsqueda devuelve sólo perfiles de Instagram/Facebook con email
   en bio** → outcome `email_found`, no `has_real_website`. Confirmamos
   que RRSS no se confunden con web propia.
3. **Búsqueda devuelve dominio del ayuntamiento** → outcome
   `nothing_found` (no es propia, y el email del ayuntamiento no es del
   negocio).
4. **Búsqueda devuelve directorio (Páginas Amarillas)** con email →
   outcome `email_found` si el email parece del negocio (no de Páginas
   Amarillas), `nothing_found` si parece genérico.
5. **Firecrawl falla con 5xx** → outcome `error`, error message
   incluido.
6. **Claude devuelve email malformado** → outcome `nothing_found`
   (validador rechaza).

Los tests mockean `firecrawl-js` y `@anthropic-ai/sdk` a nivel de
módulo (patrón ya usado en los tests existentes).

### Tests modificados

`tests/jobs/scraper.test.ts`:

- Test existente "skips lead with website immediately" → sin cambios.
- Test existente "end-to-end no website" → sigue funcionando porque el
  lead tiene email.
- **Nuevo**: "lead without email triggers enricher, finds email,
  promotes to READY_TO_SEND".
- **Nuevo**: "lead without email triggers enricher, finds own website,
  SKIPPED with has_website_found_online".
- **Nuevo**: "lead without email and low rating skips before enricher
  (no Firecrawl call)".

`tests/core/lead-filter.test.ts`:

- Añadir tests para `qualifyLeadPreEnrich` (variantes de rating/reviews
  /blacklist sin mirar email).

### Test manual (no automatizable razonablemente)

Antes de promover a producción:

1. Coger 10 leads reales que hoy se descartan como `no_email`.
2. Correr `npm run test:pipeline` con `DRY_RUN=true`.
3. Inspeccionar logs `enrich_result`. Verificar a mano que la decisión
   es correcta para al menos 8/10. (Si la precisión es <80%, ajustar
   prompt antes de release.)

## Plan de despliegue

1. PR con cambios de código, tests verdes, sin tocar BBDD.
2. Aplicar migración SQL en Supabase (3 columnas + índice).
3. Deploy a Railway con `DRY_RUN=true` durante 1 día. Revisar `metrics`
   para los eventos `enrich_*`.
4. Quitar `DRY_RUN`. Monitorizar 3 días: tasa de `email_found` vs
   `nothing_found` vs `has_website_found_online`, tiempos medios, coste
   Firecrawl.
5. Si todo OK, cerrar feature. Si tasa de `enrich_error` > 5%,
   investigar antes de seguir.

## Riesgos y mitigación

- **Falsos positivos: enricher cree que un dominio es del negocio
  cuando es de un agregador con email genérico.** Mitigación: el prompt
  enumera explícitamente los patrones de NO-web; el validador
  `INVALID_EMAIL_PATTERNS` ya descarta `noreply@`, `@google.com`,
  `@example.`. Si la tasa de respuesta cae, primer sospechoso.
- **Falsos negativos: enricher descarta web propia real pensando que es
  un agregador.** Mitigación: log `reasoning` siempre, auditoría manual
  semana 1.
- **Coste Firecrawl explota.** Mitigación: cuota mensual visible en
  dashboard; el siguiente sprint introduciría cache por
  `(business_name, city)`.
- **Latencia del scraper sube.** Hoy `analyzeOneLead` es ~5 s
  (web-analyzer). El enricher añade 8–15 s en el peor caso (búsqueda +
  scrape de 2 resultados + Claude). Con paralelismo 3 y batch de 1000
  leads, una corrida diaria pasa de ~30 min a ~50 min. Aceptable
  (corre a las 07:00, no compite con sender).

## Spec self-review

- [x] Sin "TBD" ni placeholders.
- [x] Decisiones consistentes: enriquecer solo si `!email`; reutilizar
  Firecrawl; Claude decide; SKIPPED con motivos nuevos distinguibles.
- [x] Scope acotado: una sola feature, sin refactor colateral.
- [x] Sin ambigüedad sobre estados: nada nuevo en la máquina de estados.
- [x] Migración SQL explícita.
- [x] Tests listados con expectativas claras.
