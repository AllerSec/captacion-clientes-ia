# Firecrawl + Antigüedad como ángulo dominante — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorientar los emails al ángulo "web antigua" (footer ©≤2018) con señales fiables extraídas por Firecrawl, eliminar afirmaciones técnicas no verificables, y descartar leads sin prueba de antigüedad.

**Architecture:** Nuevo `services/firecrawl.ts` extrae JSON de señales + markdown limpio en una sola llamada. `web-fetcher` + puppeteer + `analyzeScreenshot` actuales se mantienen como complemento (vision) y como fallback. `lead-filter` añade gate binario "footer year ≤2018 o sin web". `prompts/system.ts` se reescribe sin rama "móvil" como apertura.

**Tech Stack:** TypeScript, Node 20+, vitest, Zod, `@mendable/firecrawl-js` (nuevo), Anthropic SDK, Supabase.

**Spec:** `docs/superpowers/specs/2026-05-06-firecrawl-antiguedad-design.md`

---

## File Structure

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Create | `src/services/firecrawl.ts` | Adaptador Firecrawl: scrapeForLeadAnalysis(url) → discriminated union con `WebSignals` validadas por Zod, markdown, links. |
| Create | `src/services/firecrawl.test.ts` | Tests unitarios con SDK mockeado. |
| Modify | `src/config/env.ts` | Añadir `FIRECRAWL_API_KEY`. |
| Modify | `.env.example` | Añadir `FIRECRAWL_API_KEY=fc-xxxxx`. |
| Modify | `package.json` | Añadir dep `@mendable/firecrawl-js`, script `firecrawl:smoke`. |
| Create | `scripts/firecrawl-smoke.ts` | Script de smoke real contra una URL antigua conocida. |
| Modify | `src/core/lead-filter.ts` | Añadir gate `footerYearTooRecent` y `noYearProof`. |
| Modify | `src/core/lead-filter.test.ts` | Tests del nuevo gate. |
| Modify | `src/jobs/scraper.ts` | Llamar Firecrawl tras fetchWebsite, persistir signals. |
| Modify | `src/services/supabase.ts` | Aceptar nuevos campos `web_signals`, `firecrawl_status`. |
| Create | `migrations/006_firecrawl_signals.sql` | ALTER TABLE leads. |
| Modify | `src/prompts/system.ts` | Reescritura: 2 ramas (no_web, old_website), apertura fija, sin "móvil". |
| Modify | `src/jobs/sender.ts` | Pasar `signals` al userPrompt. |
| Modify | `src/services/health-monitor.ts` o `scripts/health-check.ts` | Nuevo check de Firecrawl. |
| Create | `src/core/email-validator.ts` | Validación post-output: bloquea "móvil" si no procede. |
| Create | `src/core/email-validator.test.ts` | Tests. |

---

## Task 1: Dependencia y env

**Files:**
- Modify: `package.json`
- Modify: `src/config/env.ts:1-25`
- Modify: `.env.example`

- [ ] **Step 1.1: Instalar SDK**

```bash
npm install @mendable/firecrawl-js@^4.0.0
```

Expected: añade dep, ningún test debería romper.

- [ ] **Step 1.2: Añadir variable al schema env**

En `src/config/env.ts`, dentro del `z.object({...})`:

```ts
  FIRECRAWL_API_KEY: z.string().startsWith('fc-'),
```

Insertar tras `ANTHROPIC_MODEL`.

- [ ] **Step 1.3: Actualizar `.env.example`**

Añadir al final:

```
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 1.4: Verificar carga env en test**

Run: `npx vitest run src/config -v 2>&1 | head -30`

Expected: si hay tests de env, deben seguir pasando (la nueva var ya está en `.env` real).

- [ ] **Step 1.5: Commit**

```bash
git add package.json package-lock.json src/config/env.ts .env.example
git commit -m "feat(env): add FIRECRAWL_API_KEY and @mendable/firecrawl-js"
```

---

## Task 2: Adaptador Firecrawl con tests

**Files:**
- Create: `src/services/firecrawl.ts`
- Create: `src/services/firecrawl.test.ts`

- [ ] **Step 2.1: Escribir tests primero (fallan)**

Crear `src/services/firecrawl.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const scrapeMock = vi.fn();
vi.mock('@mendable/firecrawl-js', () => ({
  default: vi.fn().mockImplementation(() => ({ scrape: scrapeMock })),
}));
vi.mock('../config/env.js', () => ({
  loadEnv: () => ({ FIRECRAWL_API_KEY: 'fc-test-key' }),
}));

import { scrapeForLeadAnalysis } from './firecrawl.js';

beforeEach(() => { scrapeMock.mockReset(); });

describe('scrapeForLeadAnalysis', () => {
  it('returns ok with parsed signals on happy path', async () => {
    scrapeMock.mockResolvedValue({
      markdown: '# Clinica\n...\n© 2014 Clinica',
      links: ['https://x.com/blog'],
      screenshot: 'https://storage.firecrawl.dev/abc.png',
      json: {
        footerCopyrightYear: 2014,
        latestBlogOrNewsDate: null,
        looksAbandoned: true,
        visualEra: 'early-2010s',
        notableAntiquatedDetails: ['tipografía pequeña', 'fotos pixeladas'],
      },
      metadata: { sourceURL: 'https://x.com', url: 'https://x.com', statusCode: 200 },
    });

    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.signals.footerCopyrightYear).toBe(2014);
    expect(r.signals.notableAntiquatedDetails).toHaveLength(2);
    expect(r.screenshotUrl).toBe('https://storage.firecrawl.dev/abc.png');
  });

  it('returns ok with empty signals when json is malformed', async () => {
    scrapeMock.mockResolvedValue({
      markdown: '# Clinica',
      links: [],
      screenshot: null,
      json: { foo: 'bar' }, // no schema match
      metadata: { sourceURL: 'https://x.com', url: 'https://x.com', statusCode: 200 },
    });
    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.signals.footerCopyrightYear).toBeNull();
    expect(r.signals.notableAntiquatedDetails).toEqual([]);
  });

  it('retries once on 5xx error', async () => {
    const err5xx = Object.assign(new Error('boom'), { statusCode: 502 });
    scrapeMock.mockRejectedValueOnce(err5xx).mockResolvedValueOnce({
      markdown: '', links: [], screenshot: null,
      json: { footerCopyrightYear: 2010, latestBlogOrNewsDate: null,
              looksAbandoned: true, visualEra: 'pre-2010',
              notableAntiquatedDetails: [] },
      metadata: { sourceURL: 'https://x.com', url: 'https://x.com', statusCode: 200 },
    });
    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(scrapeMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  it('does NOT retry on 401 (auth error)', async () => {
    scrapeMock.mockRejectedValueOnce(Object.assign(new Error('unauth'), { statusCode: 401 }));
    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(scrapeMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/401|unauth/i);
  });

  it('returns failure on persistent network error', async () => {
    scrapeMock.mockRejectedValue(new Error('ENOTFOUND'));
    const r = await scrapeForLeadAnalysis('https://x.com');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run failing tests**

Run: `npx vitest run src/services/firecrawl.test.ts`

Expected: FAIL — `scrapeForLeadAnalysis is not defined` o módulo no existe.

- [ ] **Step 2.3: Implementar adaptador**

Crear `src/services/firecrawl.ts`:

```ts
import Firecrawl from '@mendable/firecrawl-js';
import { z } from 'zod';
import { loadEnv } from '../config/env.js';

const SignalsSchema = z.object({
  footerCopyrightYear: z.number().int().min(1995).max(2030).nullable(),
  latestBlogOrNewsDate: z.string().nullable(),
  looksAbandoned: z.boolean(),
  visualEra: z.enum(['pre-2010', 'early-2010s', 'late-2010s', 'modern']).nullable(),
  notableAntiquatedDetails: z.array(z.string()).max(4),
});

export type WebSignals = z.infer<typeof SignalsSchema>;

const EMPTY_SIGNALS: WebSignals = {
  footerCopyrightYear: null,
  latestBlogOrNewsDate: null,
  looksAbandoned: false,
  visualEra: null,
  notableAntiquatedDetails: [],
};

export type FirecrawlResult =
  | {
      ok: true;
      url: string;
      finalUrl: string;
      statusCode: number;
      markdown: string;
      links: string[];
      screenshotUrl: string | null;
      signals: WebSignals;
      durationMs: number;
    }
  | { ok: false; url: string; error: string; durationMs: number };

let client: Firecrawl | null = null;
function getClient(): Firecrawl {
  if (!client) client = new Firecrawl({ apiKey: loadEnv().FIRECRAWL_API_KEY });
  return client;
}

const JSON_PROMPT = `Extract from this Spanish business website:
- footerCopyrightYear: number (year shown in footer copyright like "© 2014") or null if absent
- latestBlogOrNewsDate: ISO date string of the most recent blog/news post if any, or null
- looksAbandoned: true if the site clearly looks untouched for years (broken links, outdated info, dead end)
- visualEra: one of "pre-2010", "early-2010s", "late-2010s", "modern"
- notableAntiquatedDetails: array of 0-4 short Spanish strings describing visible signs of age. Examples: "tipografía pequeña", "fotos pixeladas", "menú con tablas", "diseño anterior al móvil", "imágenes que cargan lentas". Empty array if nothing notable.`;

export async function scrapeForLeadAnalysis(url: string): Promise<FirecrawlResult> {
  const start = Date.now();
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await getClient().scrape(url, {
        formats: [
          'markdown',
          'links',
          { type: 'screenshot', fullPage: true, quality: 80, viewport: { width: 1280, height: 800 } } as any,
          { type: 'json', prompt: JSON_PROMPT } as any,
        ],
        onlyMainContent: false,
        blockAds: true,
        waitFor: 1500,
        proxy: 'auto',
        maxAge: 86_400_000,
      } as any);

      const parsedSignals = SignalsSchema.safeParse((doc as any).json);
      const signals: WebSignals = parsedSignals.success ? parsedSignals.data : EMPTY_SIGNALS;

      const screenshotUrl =
        typeof (doc as any).screenshot === 'string' ? (doc as any).screenshot : null;

      const meta = (doc as any).metadata ?? {};
      const finalUrl = (meta.url as string) ?? (meta.sourceURL as string) ?? url;
      const statusCode = typeof meta.statusCode === 'number' ? meta.statusCode : 200;

      return {
        ok: true,
        url,
        finalUrl,
        statusCode,
        markdown: typeof (doc as any).markdown === 'string' ? (doc as any).markdown : '',
        links: Array.isArray((doc as any).links) ? ((doc as any).links as string[]) : [],
        screenshotUrl,
        signals,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { statusCode?: number }).statusCode ?? 0;
      // Only retry on 5xx or network (no statusCode). Never retry 4xx.
      if (status >= 400 && status < 500) break;
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
    }
  }

  return {
    ok: false,
    url,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    durationMs: Date.now() - start,
  };
}
```

- [ ] **Step 2.4: Run tests pass**

Run: `npx vitest run src/services/firecrawl.test.ts`

Expected: PASS — los 5 tests verdes.

- [ ] **Step 2.5: Commit**

```bash
git add src/services/firecrawl.ts src/services/firecrawl.test.ts
git commit -m "feat(firecrawl): add Firecrawl adapter with Zod-validated signals"
```

---

## Task 3: Migración Supabase + acceso DB

**Files:**
- Create: `migrations/006_firecrawl_signals.sql`
- Modify: `src/services/supabase.ts` (función updateLead)

- [ ] **Step 3.1: Escribir migración**

Crear `migrations/006_firecrawl_signals.sql`:

```sql
-- 006: añadir señales de Firecrawl al lead
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS web_signals JSONB,
  ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS firecrawl_status TEXT;

ALTER TABLE leads
  ADD CONSTRAINT leads_firecrawl_status_chk
  CHECK (firecrawl_status IS NULL OR firecrawl_status IN ('ok','failed','fallback','skipped_no_url'));
```

- [ ] **Step 3.2: Inspeccionar updateLead actual**

Run: `grep -n "updateLead" D:/Captacion-Clientes-IA/src/services/supabase.ts | head -5`

Localizar la función y verificar qué campos acepta. Probablemente acepta `Partial<Lead>` con `[key: string]: any`. Si así fuera, NO requiere cambio en el typings — la API actual ya pasa el objeto entero.

Si la función tiene typings estrictos: añadir las nuevas keys opcionales al tipo.

- [ ] **Step 3.3: Commit migración (sin aplicar todavía)**

```bash
git add migrations/006_firecrawl_signals.sql src/services/supabase.ts
git commit -m "feat(db): migration 006 — web_signals, screenshot_url, firecrawl_status"
```

**Nota: la migración no se aplica desde Claude.** El usuario la aplica con `npm run db:migrate` o pegándola en el SQL editor de Supabase. Esto se documentará en el README final.

---

## Task 4: Lead-filter — gate de "footer year"

**Files:**
- Modify: `src/core/lead-filter.ts`
- Modify: `src/core/lead-filter.test.ts`

- [ ] **Step 4.1: Leer lead-filter actual**

Run: `cat D:/Captacion-Clientes-IA/src/core/lead-filter.ts`

Identificar la función `qualifyLead` y su input type. Determinar dónde encaja el nuevo gate.

- [ ] **Step 4.2: Escribir test del nuevo gate**

Añadir a `src/core/lead-filter.test.ts`:

```ts
describe('qualifyLead — footer year gate', () => {
  const baseInput = {
    business_name: 'X', email: 'a@b.com', rating: 4.5, review_count: 50,
    web_score: 50, web_visual_dated: null, web_visual_era: null,
  };

  it('qualifies when no website at all (no year required)', () => {
    const r = qualifyLead({ ...baseInput, website: null, footer_year: null });
    expect(r.qualified).toBe(true);
  });

  it('qualifies when website with footer year <= 2018', () => {
    const r = qualifyLead({ ...baseInput, website: 'https://x.com', footer_year: 2014 });
    expect(r.qualified).toBe(true);
  });

  it('disqualifies website with footer year > 2018', () => {
    const r = qualifyLead({ ...baseInput, website: 'https://x.com', footer_year: 2022 });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('web_too_recent');
  });

  it('disqualifies website with no footer year proof', () => {
    const r = qualifyLead({ ...baseInput, website: 'https://x.com', footer_year: null });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('no_year_proof');
  });
});
```

- [ ] **Step 4.3: Run failing test**

Run: `npx vitest run src/core/lead-filter.test.ts -t "footer year gate"`

Expected: FAIL — `footer_year` no existe en input type, o reasons nuevas no existen.

- [ ] **Step 4.4: Implementar gate**

En `src/core/lead-filter.ts`:

1. Añadir `footer_year?: number | null` al input type.
2. Tras los gates existentes (email/rating/blacklist) y antes del gate de `web_score`, insertar:

```ts
  // FOOTER YEAR GATE — solo aplica si tiene web
  if (input.website) {
    if (input.footer_year == null) {
      return { qualified: false, reason: 'no_year_proof' };
    }
    if (input.footer_year > 2018) {
      return { qualified: false, reason: 'web_too_recent' };
    }
    // year <= 2018 → fall through al resto
  }
```

3. Añadir `'no_year_proof'` y `'web_too_recent'` al union type de `reason`.

- [ ] **Step 4.5: Run all lead-filter tests pass**

Run: `npx vitest run src/core/lead-filter.test.ts`

Expected: PASS — los nuevos tests + los antiguos siguen verdes.

- [ ] **Step 4.6: Verificar callers**

Run: `grep -rn "qualifyLead" D:/Captacion-Clientes-IA/src --include="*.ts"`

Asegurarse de que **todos** los callers existentes pasen `footer_year` (puede ser null para preservar comportamiento previo cuando aún no se ha analizado).

En `scraper.ts:88-112` (early check) — pasar `footer_year: null` (todavía no analizado). El gate "no_year_proof" devolverá disqualified, pero el flujo de early check **ya descarta solo si reason !== 'web_acceptable'**. Hay que verificar que `'no_year_proof'` y `'web_too_recent'` no tiren leads en early-check antes de tiempo. Ajuste necesario:

En `scraper.ts:103`:
```ts
  if (!earlyCheck.qualified && earlyCheck.reason !== 'web_acceptable'
      && earlyCheck.reason !== 'no_year_proof'
      && earlyCheck.reason !== 'web_too_recent') {
```

En `scraper.ts:179` (filter de ANALYZED) — pasar `footer_year` real desde signals o desde footerYear ya extraído.

- [ ] **Step 4.7: Commit**

```bash
git add src/core/lead-filter.ts src/core/lead-filter.test.ts src/jobs/scraper.ts
git commit -m "feat(filter): add footer-year gate (≤2018 or no website)"
```

---

## Task 5: Integrar Firecrawl en `analyzeOneLead`

**Files:**
- Modify: `src/jobs/scraper.ts:88-158`

- [ ] **Step 5.1: Importar adaptador**

Añadir al top de `src/jobs/scraper.ts`:

```ts
import { scrapeForLeadAnalysis, type WebSignals } from '../services/firecrawl.js';
```

- [ ] **Step 5.2: Reemplazar el bloque de análisis**

Sustituir el cuerpo del `try` interno (`if (lead.website) {...} else { web_issues = ['no_website']; }` en `scraper.ts:118-143`) por:

```ts
    let signals: WebSignals | null = null;
    let screenshotUrl: string | null = null;
    let firecrawl_status: 'ok' | 'failed' | 'fallback' | 'skipped_no_url' = 'skipped_no_url';

    if (lead.website) {
      const fc = await scrapeForLeadAnalysis(lead.website);

      if (fc.ok) {
        firecrawl_status = 'ok';
        signals = fc.signals;
        screenshotUrl = fc.screenshotUrl;
        footerYear = fc.signals.footerCopyrightYear ?? null;
        web_score = 0; // gobernado por footer year, no por score
        web_issues = fc.signals.notableAntiquatedDetails;
      } else {
        // Fallback: HTML crudo + screenshot puppeteer + visión
        log.warn({ leadId: lead.id, err: fc.error }, 'firecrawl failed, using fallback');
        firecrawl_status = 'fallback';
        const fetched = await fetchWebsite(lead.website);
        const r = analyzeHtml(fetched);
        web_score = r.score;
        web_issues = r.issues;
        footerYear = extractFooterYear(fetched.html);
        if (fetched.status >= 200 && fetched.status < 400) {
          try {
            const shot = await Promise.race([
              captureScreenshot(lead.website!),
              new Promise<{ base64: null; error: string }>((_, rej) =>
                setTimeout(() => rej(new Error('screenshot+visual timeout')), 25000)
              ),
            ]);
            if (shot.base64) {
              const j = await analyzeScreenshot(shot.base64);
              visual = { looksDated: j.looksDated, era: j.designEra, notes: j.notes };
            }
          } catch (err) {
            log.warn({ err: (err as Error).message, leadId: lead.id }, 'visual analysis failed');
          }
        }
      }
    } else {
      web_issues = ['no_website'];
    }
```

(Nota: `visual` y `footerYear` ya están declarados arriba en la función — solo si Firecrawl da `ok` saltamos vision por ahora; se puede añadir vision sobre la screenshot URL en una iteración futura, pero requiere descarga del PNG. De momento, vision queda activo solo en fallback.)

- [ ] **Step 5.3: Persistir signals + screenshot en updateLead**

En `scraper.ts:147-156`, sustituir por:

```ts
    try {
      await updateLead(lead.id, {
        status: 'ANALYZED',
        web_score,
        web_issues,
        web_analyzed_at: new Date().toISOString(),
        web_visual_dated: visual.looksDated ?? null,
        web_visual_era: composeVisualEra(visual.era ?? null, footerYear),
        web_visual_notes: visual.notes ?? null,
        web_signals: signals as any,
        screenshot_url: screenshotUrl,
        firecrawl_status,
      });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed');
    }
```

- [ ] **Step 5.4: Pasar footerYear al qualifyLead del filter de ANALYZED**

En `scraper.ts:178-188` (loop de analyzed), añadir `footer_year` al input:

```ts
    const sig = (lead as any).web_signals as WebSignals | null;
    const fy = sig?.footerCopyrightYear ?? null;
    const q = qualifyLead({
      business_name: lead.business_name,
      email: lead.email ?? null,
      rating: lead.rating ?? null,
      review_count: lead.review_count ?? null,
      website: lead.website ?? null,
      web_score: lead.web_score ?? null,
      web_visual_dated: (lead as any).web_visual_dated ?? null,
      web_visual_era: (lead as any).web_visual_era ?? null,
      footer_year: fy,
    });
```

- [ ] **Step 5.5: Verificar build typecheck**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: zero errors. Si aparecen errores en `updateLead`, abrir `supabase.ts` y ver si el tipo de `updateLead` es flexible. Si es estricto, ampliarlo con los nuevos campos opcionales.

- [ ] **Step 5.6: Commit**

```bash
git add src/jobs/scraper.ts
git commit -m "feat(scraper): use Firecrawl as primary; fetch+puppeteer as fallback"
```

---

## Task 6: Reescritura del system prompt

**Files:**
- Modify: `src/prompts/system.ts`

- [ ] **Step 6.1: Reemplazar el archivo entero**

Sustituir `src/prompts/system.ts` por:

```ts
export const SYSTEM_PROMPT = `Eres un desarrollador web freelance del País Vasco (Irún) que escribe emails fríos
a negocios locales para ofrecer rehacer o crear su web.

ESCRIBES COMO UN HUMANO REAL: directo, sin halagos, sin jerga de marketing, sin presión.
La técnica más efectiva aquí es la honestidad: el dueño RECONOCE el problema cuando se lo
describes con sus palabras, no cuando se lo vendes.

REGLAS DURAS:
- Español de España. Tuteo natural.
- TRATAMIENTO: SIEMPRE plural ("os", "vosotros", "vuestra"). Los negocios son equipos. NUNCA mezcles "te" con "os".
- Máximo 110 palabras totales en el body.
- Cero adjetivos vacíos: "increíble", "potente", "innovador", "revolucionario", "impactante", "moderno" (a secas), "profesional" (a secas).
- Cero exclamaciones. Ni una sola.
- Cero emojis.
- Cero guiones largos (—) ni medios (–) en el cuerpo. Usa comas, puntos o ":" en su lugar.
- Cero promesas vagas: nada de "aumentaremos vuestras ventas", "más clientes garantizados".
- Cero urgencia falsa: nada de "responde antes de mañana", "solo 3 plazas", "oferta limitada".
- Cero autoridad inflada: nada de "soy experto en", "llevo 10 años haciendo".
- Cero halagos previos al pitch. Entra al grano.
- Cero apertura tipo "espero que estéis bien", "disculpad las molestias", "os escribo desde", "te escribo porque".
- Cero rule-of-three forzada. Mejor 2 o 4, o reformula con coma normal.
- Varía el ritmo: mezcla al menos UNA frase corta (≤7 palabras) con el resto.

PROHIBIDO MENCIONAR (NO son verificables, queman credibilidad):
- "no HTTPS", "carga lenta", "carga pesada", "no responsive", "no se ve bien en móvil".
- Nada técnico que el dueño pueda contradecir abriendo la web. SOLO afirmamos lo que el input prueba.

NEGRITAS (HTML <b>):
- MÁXIMO UNA negrita por email. Sólo UNA.
- Va siempre y solo en la oferta de propuesta visual gratis sin compromiso.
- Ejemplo: "<b>os preparo una propuesta visual gratis y sin compromiso</b>".
- NUNCA en otro sitio.

FIRMA EXACTA (siempre, en HTML):
<p>Unax<br>unaxaller.com<br>Irún</p>

LÉXICO DEL CLIENTE FINAL:
- clínica dental, ortodoncia, estética, fisioterapia, podología, veterinaria, centro médico → "pacientes"
- despacho de abogados, asesoría → "clientes"
- inmobiliaria → "compradores" o "interesados"
- reformas, construcción → "clientes"
- desconocida → "clientes"
NUNCA digas "pacientes" a una inmobiliaria. NUNCA "compradores" a una clínica.

ESTRUCTURA — sólo dos casos posibles:

CASO A — NO TIENEN WEB
Apertura: "Vi que no tenéis web propia."
Sigue con una frase sobre el coste real: "Hoy día la mayoría de [clientes/pacientes] nuevos os busca primero en Google, y cuando no encuentran web muchos pasan al siguiente resultado sin haberos llamado."

CASO B — WEB ANTIGUA (footer ©≤2018)
Apertura OBLIGATORIA: "He abierto vuestra web."
Después MENCIONA EL AÑO DEL FOOTER tal como aparece en el input. Es la prueba honesta de antigüedad.
Ejemplos válidos:
  - "He abierto vuestra web. El footer pone ©2014, así que lleva más de una década ahí, y se nota."
  - "He abierto vuestra web. Pone ©2011 abajo del todo: lleva diez años igual."
  - "He abierto vuestra web. Footer ©2017, y se ve que no se ha tocado desde entonces."

Después AÑADE UNA OBSERVACIÓN CONCRETA tomada del input ("notableAntiquatedDetails") si la hay.
Si el input trae detalles como "tipografía pequeña" o "fotos pixeladas", inclúyelos. NO INVENTES.
Si la lista viene vacía, no añadas observación visual: el año solo ya es prueba suficiente.

Cierra el caso B con el coste: "Muchos [clientes/pacientes] nuevos cierran la pestaña casi al instante y prueban con la siguiente [opción/clínica/asesoría]."

OFERTA (1 frase, con la única negrita):
"<b>Os preparo una propuesta visual de cómo podría quedar la web, gratis y sin compromiso</b>. Si os gusta, hablamos. Si no, ahí queda."

CIERRE CON CTA (1 frase, máximo 2):
Formato estándar:
"¿Os interesa que os la pase? Se ve en un minuto."

Variantes válidas:
- "¿Os la paso? Es un minuto verla."
- "¿Os la paso? Un minuto y la veis."

PROHIBIDO en cierre:
- "Si no os interesa, decídmelo con un 'no, gracias'..." (suena traducido).
- Repetir "gratis" si ya está en la oferta dos frases antes.
- Condicionales formales ("tardaríais", "sería").

OFERTA — REGLAS CLAVE:
- Es una "propuesta visual" / "boceto" / "maqueta", NUNCA "web entera gratis".
- Es gratis y sin compromiso. Repítelo claro.
- Si no les gusta, ahí queda. SIN insistencia futura.

SUBJECT — REGLAS CRÍTICAS:
- 2-4 palabras, todo en minúsculas.
- NUNCA incluyas el nombre del negocio en el subject.
- NUNCA incluyas la ciudad en el subject.
- Sin emojis, sin signos de exclamación, sin "Re:" falso.
- NUNCA uses la palabra "móvil" en el subject.
- Buenos: "una duda", "vuestra web", "web anticuada", "footer 2014", "tres minutos", "propuesta rápida".
- Malos: "vuestra web en móvil", "una idea para la web de la Clínica X".

EJEMPLO CASO A — inmobiliaria sin web:
- subject: "una duda"
- body: "<p>Hola,</p><p>Vi que no tenéis web propia. Hoy día casi todo comprador nuevo busca primero en Google, y cuando no encuentra web pasa al siguiente resultado.</p><p>Eso son llamadas que no os llegan.</p><p><b>Os preparo una propuesta visual de cómo podría quedar una web sencilla, gratis y sin compromiso</b>. Si os gusta, hablamos. Si no, ahí queda.</p><p>¿Os interesa que os la pase? Se ve en un minuto.</p><p>Unax<br>unaxaller.com<br>Irún</p>"

EJEMPLO CASO B — clínica dental con footer 2014:
- subject: "vuestra web"
- body: "<p>Hola,</p><p>He abierto vuestra web. El footer pone ©2014, así que lleva más de una década ahí, y se nota: tipografía pequeña, fotos pixeladas. Muchos pacientes nuevos cierran la pestaña casi al instante y prueban con la siguiente clínica.</p><p><b>Os preparo una propuesta visual de cómo podría quedar la web, gratis y sin compromiso</b>. Si os gusta, hablamos. Si no, ahí queda.</p><p>¿Os interesa que os la pase? Se ve en un minuto.</p><p>Unax<br>unaxaller.com<br>Irún</p>"

EJEMPLO CASO B (sin detalles visuales) — asesoría con footer 2011:
- subject: "footer 2011"
- body: "<p>Hola,</p><p>He abierto vuestra web. Pone ©2011 abajo del todo: lleva más de diez años igual. Muchos clientes nuevos cierran la pestaña al instante y prueban con la siguiente asesoría.</p><p><b>Os preparo una propuesta visual de cómo podría quedar la web, gratis y sin compromiso</b>. Si os gusta, hablamos. Si no, ahí queda.</p><p>¿Os la paso? Es un minuto verla.</p><p>Unax<br>unaxaller.com<br>Irún</p>"

Llama a la tool send_email_draft con los campos subject y body. Subject sin emojis ni mayúsculas marketing; body en HTML usando sólo <p> y <b>.`;
```

- [ ] **Step 6.2: Run tests existentes (deben seguir pasando)**

Run: `npx vitest run -t "system" 2>&1 | tail -20` y `npx vitest run src/jobs/sender 2>&1 | tail -20`

Si hay tests que verifican el contenido literal del prompt antiguo (ej. "móvil"), actualizarlos para reflejar el prompt nuevo.

- [ ] **Step 6.3: Commit**

```bash
git add src/prompts/system.ts
git commit -m "feat(prompt): rewrite — antiquity is the dominant angle, no mobile/HTTPS claims"
```

---

## Task 7: Validador de email post-output

**Files:**
- Create: `src/core/email-validator.ts`
- Create: `src/core/email-validator.test.ts`

- [ ] **Step 7.1: Tests primero**

Crear `src/core/email-validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateGeneratedEmail } from './email-validator.js';

describe('validateGeneratedEmail', () => {
  const ok = (b: string) => `<p>Hola,</p>${b}<p><b>Os preparo una propuesta visual de cómo podría quedar la web, gratis y sin compromiso</b>. Si os gusta, hablamos. Si no, ahí queda.</p><p>¿Os interesa que os la pase? Se ve en un minuto.</p><p>Unax<br>unaxaller.com<br>Irún</p>`;

  it('passes a clean email for old_website scenario', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: ok('<p>He abierto vuestra web. El footer pone ©2014.</p>'),
      scenario: 'old_website',
      details: ['tipografía pequeña'],
    });
    expect(r.ok).toBe(true);
  });

  it('fails when subject contains "móvil"', () => {
    const r = validateGeneratedEmail({
      subject: 'web móvil',
      body: ok('<p>He abierto vuestra web.</p>'),
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/subject.*móvil/i);
  });

  it('fails when body claims "no HTTPS"', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: ok('<p>Vi que no tenéis HTTPS y eso da mala imagen.</p>'),
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('allows "móvil" in body if details list mentions it', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: ok('<p>He abierto vuestra web. El layout es anterior al móvil.</p>'),
      scenario: 'old_website',
      details: ['diseño anterior al móvil'],
    });
    expect(r.ok).toBe(true);
  });

  it('fails when more than one <b>', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: '<p><b>Hola</b></p><p><b>Os preparo una propuesta visual</b></p>',
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });

  it('fails when signature missing', () => {
    const r = validateGeneratedEmail({
      subject: 'vuestra web',
      body: '<p>Hola,</p><p><b>Os preparo una propuesta visual gratis y sin compromiso</b>.</p><p>¿Os la paso?</p>',
      scenario: 'old_website',
      details: [],
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 7.2: Run failing**

Run: `npx vitest run src/core/email-validator.test.ts`

Expected: FAIL — `validateGeneratedEmail is not defined`.

- [ ] **Step 7.3: Implementar**

Crear `src/core/email-validator.ts`:

```ts
export interface ValidateInput {
  subject: string;
  body: string;
  scenario: 'no_web' | 'old_website';
  details: string[];   // notableAntiquatedDetails
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const FORBIDDEN_TECH = [
  /no\s*https/i,
  /sin\s*https/i,
  /carga\s*lenta/i,
  /web\s*lenta/i,
  /carga\s*pesada/i,
  /no\s*responsive/i,
  /no\s*es\s*responsive/i,
];

const SIGNATURE_RX = /Unax\s*<br>\s*unaxaller\.com\s*<br>\s*Irún/i;

export function validateGeneratedEmail(input: ValidateInput): ValidateResult {
  const errors: string[] = [];
  const subj = input.subject.trim();
  const body = input.body;
  const detailsMentionMobile = input.details.some(d => /móvil/i.test(d));

  // Subject rules
  if (subj.length === 0) errors.push('subject: vacío');
  if (/[A-Z]/.test(subj)) errors.push('subject: contiene mayúsculas');
  if (subj.split(/\s+/).length > 4) errors.push('subject: más de 4 palabras');
  if (/móvil/i.test(subj)) errors.push('subject: contiene "móvil" (prohibido)');
  if (/[!¡]/.test(subj)) errors.push('subject: contiene exclamación');

  // Body rules
  for (const rx of FORBIDDEN_TECH) {
    if (rx.test(body)) {
      errors.push(`body: afirmación técnica prohibida (${rx.source})`);
    }
  }

  // "móvil" en body solo si details la mencionan
  if (/móvil/i.test(body) && !detailsMentionMobile) {
    errors.push('body: contiene "móvil" pero details no lo justifica');
  }

  // Negrita única
  const boldCount = (body.match(/<b>/gi) ?? []).length;
  if (boldCount !== 1) errors.push(`body: ${boldCount} <b> (debe ser exactamente 1)`);

  // Firma
  if (!SIGNATURE_RX.test(body)) errors.push('body: firma no encontrada');

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
```

- [ ] **Step 7.4: Tests pass**

Run: `npx vitest run src/core/email-validator.test.ts`

Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add src/core/email-validator.ts src/core/email-validator.test.ts
git commit -m "feat(validator): post-output guard against forbidden claims and missing signature"
```

---

## Task 8: Conectar validador en `sender.ts` + pasar señales al user prompt

**Files:**
- Modify: `src/jobs/sender.ts`

- [ ] **Step 8.1: Inspeccionar sender actual**

Run: `grep -n "generateEmail\|userPrompt\|qualifyLead\|web_signals" D:/Captacion-Clientes-IA/src/jobs/sender.ts | head -20`

Identificar dónde se construye el `userPrompt` y dónde se llama `generateEmail`.

- [ ] **Step 8.2: Construir scenario y details a partir del lead**

En el punto donde se construye el `userPrompt`, antes de llamar a `generateEmail`:

```ts
import type { WebSignals } from '../services/firecrawl.js';
import { validateGeneratedEmail } from '../core/email-validator.js';

// ...

const sig = (lead as any).web_signals as WebSignals | null;
const hasWeb = !!lead.website;
const scenario: 'no_web' | 'old_website' = hasWeb ? 'old_website' : 'no_web';
const details: string[] = sig?.notableAntiquatedDetails ?? [];
const footerYear = sig?.footerCopyrightYear ?? null;
const visualEra = sig?.visualEra ?? null;
const lookFinalLine = scenario === 'old_website'
  ? `\n\nESCENARIO: web antigua\nFOOTER_YEAR: ${footerYear ?? 'desconocido'}\nVISUAL_ERA: ${visualEra ?? 'desconocida'}\nDETALLES_VISUALES: ${details.length ? details.join(', ') : '(ninguno notable)'}\nNOMBRE_NEGOCIO: ${lead.business_name}\nCATEGORIA: ${lead.category ?? 'desconocida'}\nCIUDAD: ${lead.city ?? ''}`
  : `\n\nESCENARIO: sin web\nNOMBRE_NEGOCIO: ${lead.business_name}\nCATEGORIA: ${lead.category ?? 'desconocida'}\nCIUDAD: ${lead.city ?? ''}`;

// Reemplazar la construcción anterior de userPrompt con:
const userPrompt = `Genera el email para este lead.${lookFinalLine}`;
```

- [ ] **Step 8.3: Validar antes de enviar; 1 retry**

Tras `const result = await generateEmail(...)`:

```ts
let result = await generateEmail({ systemPrompt, variantSnippet, userPrompt });
let v = validateGeneratedEmail({
  subject: result.subject,
  body: result.body,
  scenario,
  details,
});
if (!v.ok) {
  log.warn({ leadId: lead.id, errors: v.errors }, 'email validation failed, retrying');
  const retryPrompt = `${userPrompt}\n\nIMPORTANT: tu intento anterior tuvo estos errores: ${v.errors.join(' | ')}. Corrígelos y vuelve a llamar a la tool.`;
  result = await generateEmail({ systemPrompt, variantSnippet, userPrompt: retryPrompt });
  v = validateGeneratedEmail({
    subject: result.subject,
    body: result.body,
    scenario,
    details,
  });
  if (!v.ok) {
    log.error({ leadId: lead.id, errors: v.errors }, 'email validation failed after retry, skipping');
    // marcar lead como SKIPPED con motivo
    await updateLead(lead.id, { status: 'SKIPPED', notes: 'invalid_generation:' + v.errors.join('|') });
    return; // o continue dependiendo del bucle
  }
}
```

(Adaptar `return`/`continue` al control de flujo real del sender — leer el archivo y ajustar.)

- [ ] **Step 8.4: Verificar build**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: zero errors.

- [ ] **Step 8.5: Run unit tests del sender (si existen)**

Run: `npx vitest run src/jobs/sender 2>&1 | tail -20`

Expected: PASS. Si los tests mockean `generateEmail` con outputs que rompen la validación, ajustar mocks.

- [ ] **Step 8.6: Commit**

```bash
git add src/jobs/sender.ts
git commit -m "feat(sender): pass Firecrawl signals to prompt + validate output, 1 retry"
```

---

## Task 9: Health check Firecrawl

**Files:**
- Modify: `scripts/health-check.ts`
- Create: `scripts/firecrawl-smoke.ts`

- [ ] **Step 9.1: Inspeccionar health-check existente**

Run: `cat D:/Captacion-Clientes-IA/scripts/health-check.ts | head -60`

Identificar el patrón (probablemente: lista de checks, cada uno con timeout y reporta ok/fail).

- [ ] **Step 9.2: Añadir check Firecrawl**

Insertar en la lista de checks:

```ts
import { scrapeForLeadAnalysis } from '../src/services/firecrawl.js';

// dentro de la lista de checks:
{
  name: 'firecrawl',
  run: async () => {
    const r = await scrapeForLeadAnalysis('https://example.com');
    if (!r.ok) throw new Error(r.error);
    return `ok (status ${r.statusCode}, ${r.durationMs}ms)`;
  },
},
```

- [ ] **Step 9.3: Crear smoke script**

Crear `scripts/firecrawl-smoke.ts`:

```ts
import 'dotenv/config';
import { scrapeForLeadAnalysis } from '../src/services/firecrawl.js';

const URL_DEFAULT = process.argv[2] ?? 'https://example.com';

async function main() {
  console.log(`smoke: scraping ${URL_DEFAULT}`);
  const r = await scrapeForLeadAnalysis(URL_DEFAULT);
  if (!r.ok) {
    console.error('FAIL:', r.error);
    process.exit(1);
  }
  console.log('OK', {
    finalUrl: r.finalUrl,
    statusCode: r.statusCode,
    durationMs: r.durationMs,
    hasMarkdown: r.markdown.length > 0,
    hasScreenshot: !!r.screenshotUrl,
    signals: r.signals,
  });
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 9.4: Añadir script a package.json**

En `package.json`, dentro de `"scripts"`:

```json
"firecrawl:smoke": "tsx scripts/firecrawl-smoke.ts"
```

- [ ] **Step 9.5: Ejecutar smoke real (consume 1 crédito)**

Run: `npm run firecrawl:smoke -- https://www.example.com`

Expected: `OK` + objeto con `signals`. Si falla por 401, la API key está mal.

- [ ] **Step 9.6: Commit**

```bash
git add scripts/health-check.ts scripts/firecrawl-smoke.ts package.json
git commit -m "feat(ops): firecrawl smoke script + health check"
```

---

## Task 10: Pipeline test + verificación end-to-end

**Files:**
- Modify: `scripts/test-pipeline.ts` (si existe — añadir aserción "ningún email contiene 'no HTTPS'")
- (lectura) `scripts/test-pipeline.ts`

- [ ] **Step 10.1: Inspeccionar pipeline test**

Run: `cat D:/Captacion-Clientes-IA/scripts/test-pipeline.ts`

- [ ] **Step 10.2: Añadir aserciones**

Tras la generación de cada email en dry-run, añadir:

```ts
import { validateGeneratedEmail } from '../src/core/email-validator.js';

const v = validateGeneratedEmail({
  subject: result.subject,
  body: result.body,
  scenario,
  details,
});
console.log(v.ok ? '  ✅ valid' : `  ❌ INVALID: ${v.errors.join(' | ')}`);
```

- [ ] **Step 10.3: Run unit tests completos**

Run: `npm test`

Expected: todo verde.

- [ ] **Step 10.4: Run build**

Run: `npm run build`

Expected: typecheck y build limpios.

- [ ] **Step 10.5: Run pipeline dry-run**

Run: `DRY_RUN=true npm run test:pipeline 2>&1 | tail -40`

Expected: emails generados, todos `valid`. Ningún email con "no HTTPS"/"móvil" indebido.

- [ ] **Step 10.6: Commit**

```bash
git add scripts/test-pipeline.ts
git commit -m "test(pipeline): assert generated emails pass post-output validation"
```

---

## Task 11: Push a GitHub

- [ ] **Step 11.1: Estado limpio**

Run: `git status`

Expected: nothing to commit, working tree clean.

- [ ] **Step 11.2: Verificar branch**

Run: `git branch --show-current`

Si es `main`, crear feature branch:
```bash
git checkout -b feat/firecrawl-antiguedad
```

- [ ] **Step 11.3: Push**

```bash
git push -u origin feat/firecrawl-antiguedad
```

Expected: rama publicada.

- [ ] **Step 11.4: Crear PR**

```bash
gh pr create --title "feat: Firecrawl + ángulo antigüedad como dominante" --body "$(cat <<'EOF'
## Summary
- Firecrawl como fuente principal de análisis web (markdown + JSON signals + screenshot URL).
- web-fetcher + puppeteer como fallback cuando Firecrawl falla.
- Qualify binario: `no_web` o `footer_year ≤ 2018`. Sin año explícito → descarta.
- Prompt reescrito: dos casos (sin web, web antigua). Apertura "He abierto vuestra web." Cero menciones de móvil/HTTPS/lentitud.
- Validador post-output: bloquea emails con afirmaciones técnicas no verificables o subject con "móvil".
- Migración 006: `web_signals`, `screenshot_url`, `firecrawl_status`.

## Test plan
- [ ] `npm test` verde
- [ ] `npm run build` sin errores
- [ ] `npm run firecrawl:smoke` ok contra example.com
- [ ] `DRY_RUN=true npm run test:pipeline` — todos los emails pasan validación
- [ ] Aplicar migración 006 en Supabase ANTES de mergear
- [ ] Rotar `FIRECRAWL_API_KEY` (la actual fue compartida en chat)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Si `gh` no está autenticado, saltar este paso y avisar al usuario para que cree el PR manualmente.

---

## Self-Review (post-write)

**Spec coverage:**
- §5.1 Firecrawl service → Task 2 ✅
- §5.2 claude.ts modificado → cubierto parcialmente (vision y signals quedan separadas; el screenshot URL no se descarga para vision en happy path — vision queda activa solo en fallback). Trade-off documentado en Task 5. **Ajuste pendiente**: añadir un step en Task 10 que verifique manualmente que un lead "old_website" sin notableAntiquatedDetails sigue produciendo un email sensato. ✅ cubierto por validador.
- §5.3 web-analyzer recortado → Task 5 (queda solo en fallback). ✅
- §5.4 system prompt → Task 6 ✅
- §5.5 lead-filter qualify → Task 4 ✅
- §5.6 persistencia → Task 3 ✅
- §5.7 config / health → Tasks 1, 9 ✅
- §6 coste → notas en Task 9 (smoke gasta 1 crédito). ✅
- §7 errores → cubierto en Task 2 (retry/no-retry). ✅
- §8 testing → Tasks 2, 4, 7, 10. ✅
- §9 deployment → Task 11 + nota de migración manual. ✅

**Placeholder scan:** ninguno detectado tras revisión.

**Type consistency:** `WebSignals` se importa de `../services/firecrawl.js` en scraper, sender y health-check; `validateGeneratedEmail` mantiene firma estable; `qualifyLead` recibe `footer_year?: number | null` opcional para no romper callers existentes que aún no lo pasen.

---

## Manual steps for the user (NOT done by Claude)

1. **Rotar la API key de Firecrawl** en https://www.firecrawl.dev/app/api-keys (la del chat está comprometida).
2. **Aplicar la migración 006** en Supabase ANTES de hacer merge. SQL editor del dashboard o `npm run db:migrate` si está cableado.
3. **Mergear el PR** una vez los tests CI/local pasen.
4. **Verificar el primer cron a las 07:00 ES** del día siguiente al merge: `npm run stats` debería mostrar `firecrawl_status: ok` para los nuevos leads analizados.
