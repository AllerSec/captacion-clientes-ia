# Diseño — Análisis de webs con Firecrawl y reorientación del ángulo a "antigüedad"

**Fecha:** 2026-05-06
**Estado:** propuesto
**Autor:** Unax + Claude
**Reemplaza/extiende:** `2026-05-01-captacion-clientes-ia-design.md` (parcial — mantiene arquitectura general)

---

## 1. Problema

Los emails generados se concentran en exceso en el ángulo "vuestra web en móvil",
incluso cuando la observación más vendible es **la antigüedad**. Cinco mensajes
seguidos con asuntos casi idénticos ("vuestra web en móvil") parecen plantilla.

Además, el sistema afirma a veces problemas técnicos no verificados ("no HTTPS",
"lenta") que el dueño puede contradecir abriendo su web. Eso quema credibilidad
de inmediato.

## 2. Objetivos

1. Convertir **antigüedad demostrable** en el ángulo dominante.
2. Eliminar de los emails las afirmaciones técnicas no verificables (HTTPS, velocidad, peso).
3. Mejorar el material visual y textual que recibe el LLM cuando redacta — usando
   Firecrawl (markdown limpio, screenshot real, extracción JSON LLM-asistida).
4. Reducir falsos positivos: solo enviamos a leads donde el "dolor" es honesto.

## 3. No-objetivos

- Reescribir la arquitectura general (cron + servicios + jobs queda igual).
- Cambiar el tono de marca, la oferta o las reglas de pacing/quota.
- Soportar self-hosting de Firecrawl (de momento).

## 4. Decisiones cerradas (de la sesión de brainstorming)

| Tema | Decisión |
|------|----------|
| Web antigua **bien hecha** | **Descartar** — no es lead. |
| Umbral de "antigua" | `footerCopyrightYear <= 2018` (≥7 años). |
| Sin año de copyright explícito | **Descartar** — no tenemos prueba honesta. |
| Rama "solo problemas técnicos" | **Eliminada** — los problemas técnicos no se mencionan en el email. |
| Apertura del email para "antigua" | `"He abierto vuestra web."` (sin dispositivo). |
| Fuente principal de scraping | **Firecrawl API** (plan Hobby). |
| Fallback si Firecrawl falla | `fetchWebsite` actual (HTML crudo) — degraded mode. |
| Screenshot | **Desktop 1280×800**, full page, q=80. |
| Vision en Claude | **Sí**: screenshot como `image` block. |
| Persistencia | Señales + screenshot URL. Markdown **no** se persiste. |
| Discriminated union vs excepciones | Discriminated union `{ ok: true|false }`. |

## 5. Arquitectura

```
┌────────────────────────────────────────────────────────────────────┐
│ jobs/scraper.ts (07:00 ES)                                         │
│   ├── apify.findBusinesses()                                       │
│   └── for each candidate:                                          │
│         ├── if no website_url → scenario=no_web → SAVE QUALIFIED   │
│         ├── else:                                                  │
│         │     res = firecrawl.scrapeForLeadAnalysis(url)           │
│         │     ├── res.ok && year ≤ 2018  → SAVE QUALIFIED (old)    │
│         │     ├── res.ok && (year > 2018 || year == null)          │
│         │     │   → SAVE DISQUALIFIED (motive)                     │
│         │     └── !res.ok                                          │
│         │           → fallback: fetchWebsite + extractFooterYear   │
│         │             ├── year ≤ 2018 → SAVE QUALIFIED (degraded)  │
│         │             └── else        → SAVE DISQUALIFIED          │
└────────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────────┐
│ jobs/sender.ts (cada 3 min)                                        │
│   pick QUALIFIED & policy.allow():                                 │
│     claude.generateEmail(EmailInputContext) → { subject, body }    │
│     gmail.send(...)                                                │
└────────────────────────────────────────────────────────────────────┘
```

### 5.1 Nuevo módulo: `src/services/firecrawl.ts`

```ts
import Firecrawl from '@mendable/firecrawl-js';

export interface WebSignals {
  footerCopyrightYear: number | null;
  latestBlogOrNewsDate: string | null;
  looksAbandoned: boolean;
  visualEra: 'pre-2010' | 'early-2010s' | 'late-2010s' | 'modern' | null;
  notableAntiquatedDetails: string[];   // 0-4, español
}

export type FirecrawlResult =
  | { ok: true;  url: string; finalUrl: string; statusCode: number;
      markdown: string; links: string[]; screenshotUrl: string | null;
      signals: WebSignals; durationMs: number }
  | { ok: false; url: string; error: string; durationMs: number };

export async function scrapeForLeadAnalysis(url: string): Promise<FirecrawlResult>;
```

**Implementación:**

- Una sola llamada `firecrawl.scrape(url, {...})` con todos los formats.
- `formats`: `markdown`, `links`, screenshot desktop full page, json con prompt en español
  para extraer las señales.
- `onlyMainContent: false` (necesitamos footer), `blockAds: true`, `waitFor: 1500`,
  `proxy: "auto"`, `maxAge: 86_400_000`.
- Validación de `signals` con Zod. Si el JSON no encaja → `signals` con todo
  null/false/[] y log warn (no rompe).
- Reintentos: 1 retry para errores 5xx o network; 0 retries para 4xx.
- Timeout total: 25s.

### 5.2 `src/services/claude.ts` (modificado)

Nueva firma:

```ts
export interface EmailInputContext {
  business: { name: string; category: string; city: string };
  scenario:
    | { type: 'no_web' }
    | { type: 'old_website';
        signals: WebSignals;
        screenshotUrl: string | null;
        markdownExcerpt: string;       // primeros 2000 chars
        degraded?: boolean };          // true si vino del fallback
  variantPromptOverride?: string;
}

export async function generateEmail(ctx: EmailInputContext):
  Promise<{ subject: string; bodyHtml: string }>;
```

- System prompt nuevo (ver §5.4) con prompt caching.
- User message: bloques claros (BUSINESS, SCENARIO, SIGNALS, MARKDOWN_EXCERPT)
  + `image` block con el screenshot si lo hay.
- Validaciones de salida (post-generación):
  - body **no contiene "móvil" / "móviles"** salvo que `signals.notableAntiquatedDetails`
    contenga literalmente algo con "móvil".
  - Subject ≤ 4 palabras, todo minúsculas, sin "móvil" salvo excepción anterior.
  - Firma exacta presente.
  - Máximo una `<b>`.
- Si validación falla → 1 retry con feedback. Si vuelve a fallar → skip lead, log error.

### 5.3 `src/core/web-analyzer.ts` (recortado)

- `analyzeHtml(...)` queda **solo para el fallback** (cuando Firecrawl está caído).
  Mantiene su lógica actual pero ya **no gobierna el qualify**.
- `extractFooterYear` y `composeVisualEra` se mantienen sin cambios.
- Se añade test unitario que verifica que el fallback degraded produce un
  `EmailInputContext` válido sin screenshot.

### 5.4 `src/prompts/system.ts` (reescrito)

Cambios:

- **Eliminada** rama "(c) solo problemas técnicos". Ahora son dos:
  - `(a) NO TIENEN WEB` — igual que hoy.
  - `(b) WEB ANTIGUA (footer ≤ 2018)` — apertura fija "He abierto vuestra web." +
    mención del año del footer + observación basada en `notableAntiquatedDetails`
    o, si vacío, lo que Claude vea en el screenshot.
- **Eliminadas** menciones a HTTPS, velocidad, peso, "no responsive" como
  problemas afirmables en el email.
- Apertura fija: `"He abierto vuestra web."`
- Mención obligatoria del año cuando exista: `"El footer pone ©2014, así que lleva más de una década ahí, y se nota: ..."`.
- Resto de reglas (negritas, firma, longitud, léxico cliente/paciente) sin cambios.

### 5.5 `src/core/lead-filter.ts` (qualify binario)

```ts
export function qualifies(input: {
  hasWebsite: boolean;
  footerYear: number | null;
}): { qualified: true; scenario: 'no_web' | 'old_website' }
 | { qualified: false; reason: 'web_too_recent' | 'no_year_proof' };
```

- `!hasWebsite` → `{ qualified: true, scenario: 'no_web' }`.
- `footerYear != null && footerYear <= 2018` → `{ qualified: true, scenario: 'old_website' }`.
- `footerYear != null && footerYear > 2018` → `{ qualified: false, reason: 'web_too_recent' }`.
- `footerYear == null` (con web) → `{ qualified: false, reason: 'no_year_proof' }`.

### 5.6 Persistencia (Supabase)

Migración `migrations/00X_firecrawl_signals.sql`:

```sql
ALTER TABLE leads
  ADD COLUMN web_signals JSONB,
  ADD COLUMN screenshot_url TEXT,
  ADD COLUMN firecrawl_status TEXT
    CHECK (firecrawl_status IN ('ok','failed','fallback','skipped_no_url'));
```

Markdown **no** se persiste — pesa y no se reusa.

### 5.7 Configuración

- `src/config/env.ts`: añadir `FIRECRAWL_API_KEY: z.string().startsWith('fc-')`.
- `.env`: ya añadida (clave actual).
- `.env.example`: añadir `FIRECRAWL_API_KEY=fc-xxxxx`.
- `package.json`: dependencia nueva `@mendable/firecrawl-js`.
- `health-monitor.ts`: nuevo check `firecrawl.scrape("https://example.com", {formats:["markdown"]})` con timeout 10s.

## 6. Coste y volumen

- 1 scrape = 1 crédito Firecrawl.
- Volumen estimado: 10-15 leads con web por día.
- 15 × 30 = 450 créditos/mes → cabe en plan Hobby (500/mes) muy ajustado.
- Si se desborda: o se reactiva un prefiltro nativo (extraer footer year con
  fetch nativo y solo escalar a Firecrawl si pasa filtro), o se sube a Standard ($19/mes, 3000 créditos).
- Vision (Claude visión sobre screenshot): ~$0.003 extra/email — despreciable.

## 7. Manejo de errores

| Caso | Comportamiento |
|------|----------------|
| Firecrawl 401 (key inválida) | Health alert al instante, no reintentos, leads del día se procesan vía fallback. |
| Firecrawl 429 (rate limit) | Reintento con backoff. Si persiste → fallback. Health alert si pasa de N veces/hora. |
| Firecrawl 5xx | 1 reintento; si falla → fallback. |
| Network timeout | 1 reintento; si falla → fallback. |
| JSON LLM malformado | Señales vacías, lead se salva con lo que haya. Log warn. |
| Validación email falla 2 veces | Skip envío de ese lead, log error con contexto. |

## 8. Plan de testing

- **Unit**: `firecrawl.ts` mockeando `@mendable/firecrawl-js`. Casos: ok happy path,
  ok con json malformado, retry tras 5xx, no-retry tras 401, timeout.
- **Unit**: `lead-filter.ts` qualify binario — los 4 casos.
- **Unit**: `claude.ts` validación post-output — bloquea "móvil" cuando no procede,
  acepta cuando sí.
- **Integration** (`test:pipeline` actual): dry-run end-to-end con un lead "no web"
  y un lead "antigua" — verifica que ningún email contiene "no HTTPS", "móvil"
  (salvo excepción), y que ambos pasan validación.

## 9. Migración / despliegue

1. Merge del PR (con migración Supabase aplicada antes).
2. Próximo run del scraper de las 07:00 usa Firecrawl. Leads ya en DB no se reanalizan.
3. Monitorear créditos Firecrawl los primeros 7 días — si la curva indica desborde, activar prefiltro.
4. Comparar tasa de reply vs semana anterior tras 14 días. Si baja >30%, rollback de prompt.

## 10. Riesgos

- **Volumen estrecho frente al plan Hobby (450/500).** Mitigación arriba.
- **API key compartida en chat** durante el diseño. Mitigación: rotar al final.
- **`looksAbandoned` y `visualEra` son juicios LLM** — pueden ser inconsistentes
  entre llamadas. Mitigación: el qualify NO depende de ellos, solo de
  `footerCopyrightYear`. Esos campos solo enriquecen la observación.
- **Vision encarece email gen.** Mitigación: ~$0.003/email es despreciable a este volumen.

## 11. Trabajo a futuro (fuera de alcance)

- Self-host Firecrawl si el volumen lo justifica.
- Re-scrapear leads cada N meses para detectar webs que se actualizaron.
- Variant donde la observación se construye sin LLM (más barato, menos coste por test).
