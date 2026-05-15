# Enriquecimiento de email y web desde Internet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando Google Maps no devuelve email para un negocio, buscar en Internet (Firecrawl `/search`) y dejar que Claude juzgue si el negocio tiene web propia real (no RRSS, no agregadores, no ayuntamiento, no cadena) y si aparece un email. En base a eso, descartar o promover a `READY_TO_SEND`.

**Architecture:** Nuevo módulo `services/lead-enricher.ts` que combina `firecrawl.search` + nuevo `claude.judgeEnrichment`. Se llama desde `analyzeOneLead` (en `jobs/scraper.ts`) sólo cuando `!lead.website && !lead.email` y el lead pasa el pre-qualify (rating/reviews/blacklist). El ciclo de vida del lead no cambia (NEW → ANALYZED → READY_TO_SEND / SKIPPED). Se añaden 3 columnas a la tabla `leads` para trazabilidad.

**Tech Stack:** TypeScript, Node 22, Firecrawl JS SDK v4, Anthropic SDK, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-15-enriquecimiento-email-web-design.md`

---

## File Structure

**Crear:**
- `src/services/lead-enricher.ts` — orquesta Firecrawl + Claude, devuelve `EnrichOutcome`.
- `tests/services/lead-enricher.test.ts` — tests del enricher con Firecrawl y Claude mockeados.
- `sql/006_leads_enrichment.sql` — migración (3 columnas + índice).

**Modificar:**
- `src/services/firecrawl.ts` — añade `searchBusinessInfo(query)` (wrapper sobre `client.search`).
- `src/services/claude.ts` — añade `judgeEnrichment(input)`.
- `src/core/lead-filter.ts` — añade `qualifyLeadPreEnrich(...)` (sin tocar `qualifyLead`).
- `src/services/supabase.ts` — añade `enriched_at`, `enriched_via`, `enriched_website` al tipo `LeadRow`.
- `src/jobs/scraper.ts` — rama nueva dentro de `analyzeOneLead` para enriquecer cuando falta email.
- `tests/core/lead-filter.test.ts` — tests de `qualifyLeadPreEnrich`.
- `tests/jobs/scraper.test.ts` — 3 tests nuevos del flujo enriquecimiento.
- `tests/services/firecrawl.test.ts` — tests de `searchBusinessInfo`.
- `tests/services/claude.test.ts` — tests de `judgeEnrichment`.

---

### Task 1: Migración SQL para columnas de enriquecimiento

**Files:**
- Create: `sql/006_leads_enrichment.sql`

- [ ] **Step 1: Crear el fichero SQL con la migración**

Contenido exacto del fichero:

```sql
-- Migración 006: trazabilidad del enriquecimiento email/web desde Internet.
-- Se usa cuando Google Maps no devuelve email y buscamos en la web vía Firecrawl.

alter table leads
  add column if not exists enriched_at timestamptz,
  add column if not exists enriched_via text,
  add column if not exists enriched_website text;

create index if not exists idx_leads_enriched_at
  on leads(enriched_at)
  where enriched_at is not null;

comment on column leads.enriched_at is
  'Timestamp en el que el enricher (services/lead-enricher.ts) corrió para este lead.';
comment on column leads.enriched_via is
  'Origen del enriquecimiento. Hoy solo "search" (Firecrawl /search).';
comment on column leads.enriched_website is
  'URL de la web propia que el enricher detectó (solo si has_real_website=true). Lead queda SKIPPED.';
```

- [ ] **Step 2: Confirmar que el script `npm run db:migrate` enumera el fichero**

Mirar `scripts/db-migrate.ts:6-7` y `sql/`. El script aplica los SQL por orden alfabético. `006_leads_enrichment.sql` se aplicará tras `005_firecrawl_signals.sql`. No hace falta tocar nada.

- [ ] **Step 3: Commit**

```bash
git add sql/006_leads_enrichment.sql
git commit -m "feat(db): migration 006 — enrichment trace columns on leads"
```

---

### Task 2: Extender el tipo `LeadRow` en Supabase

**Files:**
- Modify: `src/services/supabase.ts:4-28` (interfaz `LeadRow`)

- [ ] **Step 1: Añadir las tres columnas al tipo `LeadRow`**

Editar `src/services/supabase.ts`. Localizar la interfaz `LeadRow` (líneas ~4–28). Añadir tras `responded_at?: string | null;`:

```ts
  enriched_at?: string | null;
  enriched_via?: string | null;
  enriched_website?: string | null;
```

El resto del fichero no necesita cambios: `updateLead` ya acepta `Partial<LeadRow>` y propaga lo que reciba.

- [ ] **Step 2: Comprobar que `tsc` no rompe**

Run:
```bash
npx tsc --noEmit
```
Expected: salida vacía, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/supabase.ts
git commit -m "feat(types): add enrichment columns to LeadRow"
```

---

### Task 3: TDD de `qualifyLeadPreEnrich`

**Files:**
- Modify: `tests/core/lead-filter.test.ts` (añadir un `describe` nuevo al final)

- [ ] **Step 1: Escribir tests primero (deben fallar)**

Añadir al final de `tests/core/lead-filter.test.ts`:

```ts
import { qualifyLeadPreEnrich } from '../../src/core/lead-filter.js';

describe('qualifyLeadPreEnrich — gate antes de gastar Firecrawl', () => {
  const baseNoMail = {
    business_name: 'Taller X',
    rating: 4.5,
    review_count: 50,
  };

  it('qualifies when rating, reviews and brand are fine (no email needed)', () => {
    expect(qualifyLeadPreEnrich(baseNoMail).qualified).toBe(true);
  });

  it('rejects low rating without calling Firecrawl', () => {
    const r = qualifyLeadPreEnrich({ ...baseNoMail, rating: 3.5 });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('low_rating');
  });

  it('rejects too few reviews without calling Firecrawl', () => {
    const r = qualifyLeadPreEnrich({ ...baseNoMail, review_count: 10 });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('few_reviews');
  });

  it('rejects blacklisted brands without calling Firecrawl', () => {
    const r = qualifyLeadPreEnrich({ ...baseNoMail, business_name: 'Vital Dent Bilbao' });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('blacklisted');
  });

  it('rejects when rating is null', () => {
    const r = qualifyLeadPreEnrich({ ...baseNoMail, rating: null });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('low_rating');
  });

  it('rejects when review_count is null', () => {
    const r = qualifyLeadPreEnrich({ ...baseNoMail, review_count: null });
    expect(r.qualified).toBe(false);
    expect(r.reason).toBe('few_reviews');
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run:
```bash
npx vitest run tests/core/lead-filter.test.ts
```
Expected: los 6 tests nuevos fallan por export inexistente.

- [ ] **Step 3: Implementar `qualifyLeadPreEnrich`**

Editar `src/core/lead-filter.ts`. Después de la definición de `qualifyLead`, añadir:

```ts
export interface PreEnrichInput {
  business_name: string;
  rating: number | null;
  review_count: number | null;
}

export function qualifyLeadPreEnrich(l: PreEnrichInput): QualifyResult {
  if (l.rating == null || l.rating < 4.0) {
    return { qualified: false, reason: 'low_rating' };
  }
  if (l.review_count == null || l.review_count < 15) {
    return { qualified: false, reason: 'few_reviews' };
  }
  if (BLACKLIST.some(rx => rx.test(l.business_name))) {
    return { qualified: false, reason: 'blacklisted' };
  }
  return { qualified: true };
}
```

- [ ] **Step 4: Ejecutar tests y verificar verde**

Run:
```bash
npx vitest run tests/core/lead-filter.test.ts
```
Expected: todos los tests verdes (los 9 originales + 6 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/core/lead-filter.ts tests/core/lead-filter.test.ts
git commit -m "feat(core): qualifyLeadPreEnrich for cheap gate before enrichment"
```

---

### Task 4: Wrapper `searchBusinessInfo` sobre Firecrawl `/search`

**Files:**
- Modify: `src/services/firecrawl.ts` (añadir export al final)
- Modify: `tests/services/firecrawl.test.ts` (añadir bloque `describe` al final)

- [ ] **Step 1: Escribir test primero (debe fallar)**

Añadir en `tests/services/firecrawl.test.ts`, antes hay que extender el mock para que el cliente exponga `search`. Modificar la primera parte del fichero (la del `vi.mock('@mendable/firecrawl-js', ...)`) para que pase también un `searchMock`:

Estado actual del mock al principio del fichero (`tests/services/firecrawl.test.ts:3-8`):
```ts
const scrapeMock = vi.fn();
vi.mock('@mendable/firecrawl-js', () => ({
  default: class FakeFirecrawl {
    scrape = scrapeMock;
  },
}));
```

Sustituir por:
```ts
const scrapeMock = vi.fn();
const searchMock = vi.fn();
vi.mock('@mendable/firecrawl-js', () => ({
  default: class FakeFirecrawl {
    scrape = scrapeMock;
    search = searchMock;
  },
}));
```

Y en el `beforeEach`, añadir `searchMock.mockReset();` para resetear entre tests.

Después, añadir al final del fichero (después del último `describe`):

```ts
import { searchBusinessInfo } from '../../src/services/firecrawl.js';

describe('searchBusinessInfo', () => {
  it('returns top results with their snippets and markdown', async () => {
    searchMock.mockResolvedValue({
      web: [
        {
          url: 'https://www.tallerx.es',
          title: 'Taller X — Reparación',
          description: 'Taller mecánico en Bilbao. Contacto: info@tallerx.es',
          markdown: '# Taller X\nContacto info@tallerx.es',
        },
        {
          url: 'https://www.paginasamarillas.es/taller-x',
          title: 'Taller X en Páginas Amarillas',
          description: 'Ficha del negocio',
          markdown: undefined,
        },
      ],
    });

    const r = await searchBusinessInfo('Taller X Bilbao');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results).toHaveLength(2);
    expect(r.results[0].url).toBe('https://www.tallerx.es');
    expect(r.results[0].markdown).toContain('Contacto');
  });

  it('truncates markdown to 3000 chars to limit Claude tokens', async () => {
    const huge = 'x'.repeat(10_000);
    searchMock.mockResolvedValue({
      web: [{ url: 'https://a.b', title: 't', description: 'd', markdown: huge }],
    });
    const r = await searchBusinessInfo('whatever');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results[0].markdown?.length).toBeLessThanOrEqual(3000);
  });

  it('returns ok:false on Firecrawl error', async () => {
    searchMock.mockRejectedValue(new Error('ENOTFOUND'));
    const r = await searchBusinessInfo('whatever');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/ENOTFOUND/);
  });

  it('returns empty results when Firecrawl returns no web array', async () => {
    searchMock.mockResolvedValue({});
    const r = await searchBusinessInfo('whatever');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar tests y confirmar que fallan**

Run:
```bash
npx vitest run tests/services/firecrawl.test.ts
```
Expected: los 4 tests nuevos fallan por export inexistente.

- [ ] **Step 3: Implementar `searchBusinessInfo`**

Añadir al final de `src/services/firecrawl.ts`:

```ts
export interface SearchResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
}

export type SearchBusinessInfoResult =
  | { ok: true; query: string; results: SearchResult[]; durationMs: number }
  | { ok: false; query: string; error: string; durationMs: number };

const SEARCH_MARKDOWN_MAX = 3000;

export async function searchBusinessInfo(query: string): Promise<SearchBusinessInfoResult> {
  const start = Date.now();
  try {
    const data = await getClient().search(query, {
      sources: ['web'],
      limit: 5,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 8000,
      },
    } as any);

    const web = Array.isArray((data as any).web) ? ((data as any).web as any[]) : [];
    const results: SearchResult[] = web.map(item => ({
      url: String(item.url ?? ''),
      title: typeof item.title === 'string' ? item.title : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      markdown: typeof item.markdown === 'string'
        ? item.markdown.slice(0, SEARCH_MARKDOWN_MAX)
        : undefined,
    })).filter(r => r.url.length > 0);

    return { ok: true, query, results, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      query,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
```

- [ ] **Step 4: Ejecutar tests y confirmar verde**

Run:
```bash
npx vitest run tests/services/firecrawl.test.ts
```
Expected: todos verdes.

- [ ] **Step 5: Commit**

```bash
git add src/services/firecrawl.ts tests/services/firecrawl.test.ts
git commit -m "feat(firecrawl): searchBusinessInfo wrapper over /search with scrape"
```

---

### Task 5: `judgeEnrichment` en Claude

**Files:**
- Modify: `src/services/claude.ts` (añadir export al final)
- Modify: `tests/services/claude.test.ts` (añadir `describe` al final)

- [ ] **Step 1: Inspeccionar el fichero de test existente**

Mirar `tests/services/claude.test.ts` para reusar el mismo patrón de mock de `@anthropic-ai/sdk`. Probablemente ya hay un `mockCreate` que devuelve `content: [{ type: 'tool_use', ... }]`. Lo reaprovechamos.

- [ ] **Step 2: Escribir tests primero (deben fallar)**

Añadir al final de `tests/services/claude.test.ts`:

```ts
import { judgeEnrichment } from '../../src/services/claude.js';

describe('judgeEnrichment', () => {
  it('decides has_real_website when results include the business own domain', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'tool_use',
        name: 'report_enrichment',
        input: {
          has_real_website: true,
          website_url: 'https://www.tallerx.es',
          email: null,
          reasoning: 'tallerx.es contiene horarios y servicios del taller.',
        },
      }],
    });

    const r = await judgeEnrichment({
      business_name: 'Taller X',
      city: 'Bilbao',
      category: 'taller mecánico',
      results: [
        { url: 'https://www.tallerx.es', title: 'Taller X', description: 'Bilbao', markdown: 'horarios...' },
      ],
    });
    expect(r.has_real_website).toBe(true);
    expect(r.website_url).toBe('https://www.tallerx.es');
  });

  it('decides not a real website when only social profiles appear', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'tool_use',
        name: 'report_enrichment',
        input: {
          has_real_website: false,
          website_url: null,
          email: 'info@tallerx.es',
          reasoning: 'solo perfiles de Instagram y Facebook con email en bio.',
        },
      }],
    });

    const r = await judgeEnrichment({
      business_name: 'Taller X', city: 'Bilbao', category: null,
      results: [
        { url: 'https://www.instagram.com/tallerx' },
        { url: 'https://www.facebook.com/tallerx' },
      ],
    });
    expect(r.has_real_website).toBe(false);
    expect(r.email).toBe('info@tallerx.es');
  });

  it('throws when Claude does not call the tool', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'no idea' }],
    });
    await expect(judgeEnrichment({
      business_name: 'X', city: null, category: null, results: [],
    })).rejects.toThrow(/tool_use|report_enrichment/i);
  });
});
```

Nota: ajustar el nombre `mockCreate` al que ya use el fichero (`mockCreate` o equivalente). Si el fichero no usa esa variable, replicar el patrón usado por los otros tests (`describe('generateEmail')`, `describe('analyzeScreenshot')`).

- [ ] **Step 3: Ejecutar tests y confirmar que fallan**

Run:
```bash
npx vitest run tests/services/claude.test.ts
```
Expected: 3 tests nuevos fallan por export inexistente.

- [ ] **Step 4: Implementar `judgeEnrichment` en `src/services/claude.ts`**

Añadir al final de `src/services/claude.ts`:

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
  website_url: string | null;
  email: string | null;
  reasoning: string;
}

const ENRICH_SYSTEM_PROMPT = `Eres un analista que decide, a partir de resultados de búsqueda en Internet, si un pequeño negocio español tiene web propia real y si aparece su email.

NO cuentan como web propia:
- Redes sociales (instagram.com, facebook.com, tiktok.com, linkedin.com, twitter.com, x.com, youtube.com).
- Agregadores/directorios (paginasamarillas, doctoralia, yelp, tripadvisor, foursquare, infofarmacia, einforma, axesor, google.com/maps).
- Páginas oficiales (.gob.es, ayuntamientos, colegios profesionales, asociaciones de comerciantes).
- Marketplaces o webs de cadena/franquicia (multiopticas, alainafflelou, federopticos, farmaciaonline y similares): aunque tengan ficha del negocio, NO es web propia.

SÍ cuenta: un dominio propio cuyo contenido describe claramente este negocio en particular (con sus horarios, dirección, servicios), no una cadena ni un directorio.

Para email: extrae uno solo, el más probable de pertenecer al negocio. Descarta noreply@, no-reply@, info@google.com, dominios @example.

Devuelve siempre el resultado mediante la tool report_enrichment.`;

export async function judgeEnrichment(input: EnrichmentInput): Promise<EnrichmentJudgment> {
  const env = loadEnv();
  const userPrompt = buildEnrichUserPrompt(input);

  const resp = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 600,
    system: ENRICH_SYSTEM_PROMPT,
    tools: [
      {
        name: 'report_enrichment',
        description: 'Reporta la decisión sobre la existencia de web propia y email del negocio.',
        input_schema: {
          type: 'object',
          properties: {
            has_real_website: { type: 'boolean' },
            website_url: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            reasoning: { type: 'string' },
          },
          required: ['has_real_website', 'website_url', 'email', 'reasoning'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_enrichment' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolUse = resp.content.find((b: any) => b.type === 'tool_use');
  if (!toolUse || (toolUse as any).type !== 'tool_use') {
    throw new Error('Claude judgeEnrichment: no tool_use / report_enrichment returned');
  }
  const parsed = (toolUse as any).input as Partial<EnrichmentJudgment>;
  return {
    has_real_website: Boolean(parsed.has_real_website),
    website_url: typeof parsed.website_url === 'string' && parsed.website_url.length > 0
      ? parsed.website_url
      : null,
    email: typeof parsed.email === 'string' && parsed.email.length > 0
      ? parsed.email.trim()
      : null,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

function buildEnrichUserPrompt(input: EnrichmentInput): string {
  const header = `Negocio: ${input.business_name}\nCiudad: ${input.city ?? 'desconocida'}\nCategoría: ${input.category ?? 'desconocida'}\n\nResultados de búsqueda (top ${input.results.length}):`;
  const body = input.results.map((r, i) => {
    const lines = [
      `--- Resultado ${i + 1} ---`,
      `URL: ${r.url}`,
      r.title ? `Título: ${r.title}` : '',
      r.description ? `Snippet: ${r.description}` : '',
      r.markdown ? `Contenido: ${r.markdown}` : '',
    ].filter(s => s.length > 0);
    return lines.join('\n');
  }).join('\n\n');
  return `${header}\n\n${body}\n\nDecide y llama a report_enrichment.`;
}
```

- [ ] **Step 5: Ejecutar tests y confirmar verde**

Run:
```bash
npx vitest run tests/services/claude.test.ts
```
Expected: todos verdes (los previos + los 3 nuevos).

- [ ] **Step 6: Commit**

```bash
git add src/services/claude.ts tests/services/claude.test.ts
git commit -m "feat(claude): judgeEnrichment for has_real_website / email decision"
```

---

### Task 6: Módulo `lead-enricher` (orquestación)

**Files:**
- Create: `src/services/lead-enricher.ts`
- Create: `tests/services/lead-enricher.test.ts`

- [ ] **Step 1: Escribir test primero (debe fallar)**

Crear `tests/services/lead-enricher.test.ts` con este contenido:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchMock = vi.fn();
const judgeMock = vi.fn();

vi.mock('../../src/services/firecrawl.js', () => ({
  searchBusinessInfo: searchMock,
}));
vi.mock('../../src/services/claude.js', () => ({
  judgeEnrichment: judgeMock,
}));

import { enrichLead } from '../../src/services/lead-enricher.js';

beforeEach(() => {
  searchMock.mockReset();
  judgeMock.mockReset();
});

describe('enrichLead', () => {
  it('returns has_real_website when judge finds own domain', async () => {
    searchMock.mockResolvedValue({
      ok: true, query: 'Taller X Bilbao',
      results: [{ url: 'https://tallerx.es', title: 'Taller X', description: 'Bilbao' }],
      durationMs: 1200,
    });
    judgeMock.mockResolvedValue({
      has_real_website: true,
      website_url: 'https://tallerx.es',
      email: null,
      reasoning: 'web propia con horarios',
    });

    const r = await enrichLead({
      business_name: 'Taller X', city: 'Bilbao', province: null, category: 'taller mecánico',
    });
    expect(r.kind).toBe('has_real_website');
    if (r.kind !== 'has_real_website') return;
    expect(r.website_url).toBe('https://tallerx.es');
  });

  it('returns email_found when judge finds only RRSS + email', async () => {
    searchMock.mockResolvedValue({
      ok: true, query: 'q',
      results: [{ url: 'https://instagram.com/x', description: 'info@x.es' }],
      durationMs: 800,
    });
    judgeMock.mockResolvedValue({
      has_real_website: false,
      website_url: null,
      email: 'info@x.es',
      reasoning: 'solo RRSS, email en bio',
    });

    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('email_found');
    if (r.kind !== 'email_found') return;
    expect(r.email).toBe('info@x.es');
  });

  it('returns nothing_found when judge has no email and no real website', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [], durationMs: 200 });
    judgeMock.mockResolvedValue({
      has_real_website: false, website_url: null, email: null, reasoning: 'no info',
    });
    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('nothing_found');
  });

  it('returns error when Firecrawl fails', async () => {
    searchMock.mockResolvedValue({ ok: false, query: 'q', error: 'ENOTFOUND', durationMs: 100 });
    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error).toMatch(/ENOTFOUND/);
    expect(judgeMock).not.toHaveBeenCalled();
  });

  it('returns error when Claude throws', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [{ url: 'https://a.b' }], durationMs: 500 });
    judgeMock.mockRejectedValue(new Error('claude boom'));
    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('error');
    if (r.kind !== 'error') return;
    expect(r.error).toMatch(/claude boom/);
  });

  it('rejects malformed email returned by Claude (noreply@)', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [{ url: 'https://a.b' }], durationMs: 500 });
    judgeMock.mockResolvedValue({
      has_real_website: false, website_url: null,
      email: 'noreply@a.b', reasoning: 'meh',
    });
    const r = await enrichLead({
      business_name: 'X', city: 'Bilbao', province: null, category: null,
    });
    expect(r.kind).toBe('nothing_found');
  });

  it('builds the query as "name city" when city present', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [], durationMs: 100 });
    judgeMock.mockResolvedValue({ has_real_website: false, website_url: null, email: null, reasoning: '' });
    await enrichLead({ business_name: 'Taller X', city: 'Bilbao', province: 'Bizkaia', category: null });
    expect(searchMock).toHaveBeenCalledWith('Taller X Bilbao');
  });

  it('falls back to just name when city is null', async () => {
    searchMock.mockResolvedValue({ ok: true, query: 'q', results: [], durationMs: 100 });
    judgeMock.mockResolvedValue({ has_real_website: false, website_url: null, email: null, reasoning: '' });
    await enrichLead({ business_name: 'Taller X', city: null, province: null, category: null });
    expect(searchMock).toHaveBeenCalledWith('Taller X');
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run:
```bash
npx vitest run tests/services/lead-enricher.test.ts
```
Expected: todos fallan por import inexistente.

- [ ] **Step 3: Crear `src/services/lead-enricher.ts`**

Contenido:

```ts
import { searchBusinessInfo } from './firecrawl.js';
import { judgeEnrichment } from './claude.js';

export interface EnrichInput {
  business_name: string;
  city: string | null;
  province: string | null;
  category: string | null;
}

export type EnrichOutcome =
  | { kind: 'has_real_website'; website_url: string; reasoning: string; durationMs: number }
  | { kind: 'email_found'; email: string; reasoning: string; durationMs: number }
  | { kind: 'nothing_found'; reasoning: string; durationMs: number }
  | { kind: 'error'; error: string; durationMs: number };

const INVALID_EMAIL_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /@google\.com$/i,
  /@example\./i,
];

function isUsableEmail(e: string | null): e is string {
  if (!e) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return !INVALID_EMAIL_PATTERNS.some(rx => rx.test(e));
}

export async function enrichLead(input: EnrichInput): Promise<EnrichOutcome> {
  const start = Date.now();
  const query = input.city ? `${input.business_name} ${input.city}` : input.business_name;

  const search = await searchBusinessInfo(query);
  if (!search.ok) {
    return { kind: 'error', error: search.error, durationMs: Date.now() - start };
  }

  let judgment;
  try {
    judgment = await judgeEnrichment({
      business_name: input.business_name,
      city: input.city,
      category: input.category,
      results: search.results,
    });
  } catch (err) {
    return {
      kind: 'error',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }

  const durationMs = Date.now() - start;

  if (judgment.has_real_website && judgment.website_url) {
    return {
      kind: 'has_real_website',
      website_url: judgment.website_url,
      reasoning: judgment.reasoning,
      durationMs,
    };
  }

  if (isUsableEmail(judgment.email)) {
    return {
      kind: 'email_found',
      email: judgment.email,
      reasoning: judgment.reasoning,
      durationMs,
    };
  }

  return { kind: 'nothing_found', reasoning: judgment.reasoning, durationMs };
}
```

- [ ] **Step 4: Ejecutar y confirmar verde**

Run:
```bash
npx vitest run tests/services/lead-enricher.test.ts
```
Expected: 8 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/services/lead-enricher.ts tests/services/lead-enricher.test.ts
git commit -m "feat(enricher): lead-enricher orchestrates Firecrawl search + Claude judge"
```

---

### Task 7: Integrar el enricher en `analyzeOneLead`

**Files:**
- Modify: `src/jobs/scraper.ts:84-126` (función `analyzeOneLead`)

- [ ] **Step 1: Refactor — reemplazar `analyzeOneLead` completa**

Sustituir la función `analyzeOneLead` actual (`src/jobs/scraper.ts:84-126`) por:

```ts
async function analyzeOneLead(lead: any): Promise<void> {
  const log = logger.child({ job: 'scraper' });

  // 1. Tiene website en Maps: descartar inmediatamente.
  if (lead.website) {
    try {
      await updateLead(lead.id, { status: 'SKIPPED', notes: 'has_website' });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (has_website skip)');
    }
    return;
  }

  // 2. Tiene email en Maps: qualify normal y promover.
  if (lead.email) {
    return analyzeNoWebsiteWithEmail(lead);
  }

  // 3. Ni website ni email: pre-qualify barato; si pasa, enriquecer.
  const pre = qualifyLeadPreEnrich({
    business_name: lead.business_name,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
  });
  if (!pre.qualified) {
    try {
      await updateLead(lead.id, { status: 'SKIPPED', notes: pre.reason ?? 'pre_filtered' });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (pre_enrich_filtered)');
    }
    return;
  }

  log.info({ leadId: lead.id, business: lead.business_name, city: lead.city }, 'enrich: start');
  const outcome = await enrichLead({
    business_name: lead.business_name,
    city: lead.city ?? null,
    province: lead.province ?? null,
    category: lead.category ?? null,
  });
  log.info({ leadId: lead.id, kind: outcome.kind, durationMs: outcome.durationMs }, 'enrich: done');

  const enrichedAt = new Date().toISOString();

  if (outcome.kind === 'has_real_website') {
    try {
      await updateLead(lead.id, {
        status: 'SKIPPED',
        notes: 'has_website_found_online',
        enriched_at: enrichedAt,
        enriched_via: 'search',
        enriched_website: outcome.website_url,
      });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (has_website_found_online)');
    }
    return;
  }

  if (outcome.kind === 'email_found') {
    try {
      await updateLead(lead.id, {
        email: outcome.email,
        enriched_at: enrichedAt,
        enriched_via: 'search',
      });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (email_found)');
      return;
    }
    return analyzeNoWebsiteWithEmail({ ...lead, email: outcome.email });
  }

  if (outcome.kind === 'nothing_found') {
    try {
      await updateLead(lead.id, {
        status: 'SKIPPED',
        notes: 'no_email_after_enrich',
        enriched_at: enrichedAt,
        enriched_via: 'search',
      });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (no_email_after_enrich)');
    }
    return;
  }

  // outcome.kind === 'error'
  try {
    await updateLead(lead.id, {
      status: 'SKIPPED',
      notes: `enrich_error: ${outcome.error.slice(0, 200)}`,
      enriched_at: enrichedAt,
      enriched_via: 'search',
    });
  } catch (err) {
    log.error({ err, leadId: lead.id }, 'updateLead failed (enrich_error)');
  }
}

async function analyzeNoWebsiteWithEmail(lead: any): Promise<void> {
  const log = logger.child({ job: 'scraper' });
  const check = qualifyLead({
    business_name: lead.business_name,
    email: lead.email ?? null,
    rating: lead.rating ?? null,
    review_count: lead.review_count ?? null,
    website: null,
  });

  if (!check.qualified) {
    try {
      await updateLead(lead.id, { status: 'SKIPPED', notes: check.reason ?? 'pre_filtered' });
    } catch (err) {
      log.error({ err, leadId: lead.id }, 'updateLead failed (qualify reject)');
    }
    return;
  }

  try {
    await updateLead(lead.id, {
      status: 'ANALYZED',
      web_issues: ['no_website'],
      web_analyzed_at: new Date().toISOString(),
      firecrawl_status: 'skipped_no_url',
    } as any);
  } catch (err) {
    log.error({ err, leadId: lead.id }, 'updateLead failed');
  }
}
```

- [ ] **Step 2: Actualizar imports al principio de `src/jobs/scraper.ts`**

En la cabecera (líneas 1–10), añadir:

```ts
import { qualifyLead, qualifyLeadPreEnrich } from '../core/lead-filter.js';
import { enrichLead } from '../services/lead-enricher.js';
```

(Sustituir el import existente `import { qualifyLead } from '../core/lead-filter.js';` por la línea con ambos imports.)

- [ ] **Step 3: Compilar con `tsc` para detectar errores de tipos**

Run:
```bash
npx tsc --noEmit
```
Expected: salida vacía.

- [ ] **Step 4: Ejecutar TODOS los tests para detectar regresiones**

Run:
```bash
npx vitest run
```
Expected: los tests existentes pasan; los del scraper que esperan el flujo viejo pueden necesitar ajuste — eso lo arregla la Task 8. Por ahora si fallan tests del scraper, dejarlos para Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/scraper.ts
git commit -m "feat(scraper): integrate enricher into analyzeOneLead for missing email"
```

---

### Task 8: Tests del scraper con enricher

**Files:**
- Modify: `tests/jobs/scraper.test.ts`

- [ ] **Step 1: Añadir mock de `lead-enricher` al inicio del fichero**

En `tests/jobs/scraper.test.ts`, junto a los mocks existentes (líneas ~3–24), añadir:

```ts
const mockEnrich = vi.fn();
vi.mock('../../src/services/lead-enricher.js', () => ({
  enrichLead: mockEnrich,
}));
```

Y en el `beforeEach`, añadir `mockEnrich.mockReset();`.

- [ ] **Step 2: Añadir 3 tests nuevos al final del `describe`**

Antes del cierre `});` del `describe('runScraper', ...)`, añadir:

```ts
  it('without email and low rating: skipped without calling enricher', async () => {
    mockSearch.mockResolvedValue([]);
    mockGetByStatus
      .mockResolvedValueOnce([{
        id: 'lead-pre', business_name: 'Taller P', website: null,
        email: null, rating: 3.5, review_count: 50, city: 'Bilbao',
      }])
      .mockResolvedValueOnce([]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper([]);

    expect(mockEnrich).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith('lead-pre', expect.objectContaining({
      status: 'SKIPPED', notes: 'low_rating',
    }));
  });

  it('without email but good reputation: enricher finds email, lead promoted', async () => {
    mockSearch.mockResolvedValue([]);
    mockEnrich.mockResolvedValue({
      kind: 'email_found',
      email: 'info@taller.es',
      reasoning: 'snippet con email',
      durationMs: 1500,
    });
    mockGetByStatus
      .mockResolvedValueOnce([{
        id: 'lead-e1', business_name: 'Taller E', website: null,
        email: null, rating: 4.7, review_count: 60, city: 'Bilbao',
      }])
      .mockResolvedValueOnce([{
        id: 'lead-e1', business_name: 'Taller E', website: null,
        email: 'info@taller.es', rating: 4.7, review_count: 60,
      }]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper([]);

    expect(mockEnrich).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('lead-e1', expect.objectContaining({
      email: 'info@taller.es', enriched_via: 'search',
    }));
    expect(mockUpdate).toHaveBeenCalledWith('lead-e1', expect.objectContaining({
      status: 'ANALYZED',
    }));
    expect(mockUpdate).toHaveBeenCalledWith('lead-e1', expect.objectContaining({
      status: 'READY_TO_SEND',
    }));
  });

  it('without email but good reputation: enricher finds own website, SKIPPED has_website_found_online', async () => {
    mockSearch.mockResolvedValue([]);
    mockEnrich.mockResolvedValue({
      kind: 'has_real_website',
      website_url: 'https://taller.es',
      reasoning: 'dominio propio con horarios',
      durationMs: 2100,
    });
    mockGetByStatus
      .mockResolvedValueOnce([{
        id: 'lead-e2', business_name: 'Taller W', website: null,
        email: null, rating: 4.6, review_count: 40, city: 'Bilbao',
      }])
      .mockResolvedValueOnce([]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper([]);

    expect(mockEnrich).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('lead-e2', expect.objectContaining({
      status: 'SKIPPED', notes: 'has_website_found_online',
      enriched_website: 'https://taller.es',
    }));
  });

  it('without email, enricher returns nothing_found: SKIPPED no_email_after_enrich', async () => {
    mockSearch.mockResolvedValue([]);
    mockEnrich.mockResolvedValue({
      kind: 'nothing_found',
      reasoning: 'sin info útil',
      durationMs: 800,
    });
    mockGetByStatus
      .mockResolvedValueOnce([{
        id: 'lead-e3', business_name: 'Taller N', website: null,
        email: null, rating: 4.5, review_count: 20, city: 'Bilbao',
      }])
      .mockResolvedValueOnce([]);

    const { runScraper } = await import('../../src/jobs/scraper.js');
    await runScraper([]);

    expect(mockUpdate).toHaveBeenCalledWith('lead-e3', expect.objectContaining({
      status: 'SKIPPED', notes: 'no_email_after_enrich',
    }));
  });
```

- [ ] **Step 3: Verificar que el test "rejects missing email" del lead-filter sigue verde**

El test existente `qualifyLead rejects missing email` no cambia: `qualifyLead` sigue rechazando `!email`. El nuevo flujo del scraper llama a `qualifyLeadPreEnrich` para leads sin email, no a `qualifyLead`.

- [ ] **Step 4: Ejecutar TODOS los tests**

Run:
```bash
npx vitest run
```
Expected: todos los tests verdes (existentes + nuevos).

- [ ] **Step 5: Commit**

```bash
git add tests/jobs/scraper.test.ts
git commit -m "test(scraper): cover enricher integration paths"
```

---

### Task 9: Verificación de build + lint final

**Files:** ninguno, sólo verificación.

- [ ] **Step 1: Type-check sin errores**

Run:
```bash
npx tsc --noEmit
```
Expected: exit 0, sin warnings de tipo.

- [ ] **Step 2: Ejecutar suite completa de tests**

Run:
```bash
npm test
```
Expected: 100% verde.

- [ ] **Step 3: Build de producción**

Run:
```bash
npm run build
```
Expected: exit 0, `dist/` poblado, sin errores.

- [ ] **Step 4: Commit (vacío si no hace falta — solo si has tocado algo en este paso)**

Si en algún paso ha hecho falta retocar, commitear con:
```bash
git add -A
git commit -m "chore: fix type/build warnings after enricher integration"
```

---

### Task 10: Aplicar migración SQL en Supabase

**Files:** ninguno (operación contra BBDD).

- [ ] **Step 1: Aplicar `sql/006_leads_enrichment.sql` manualmente**

`npm run db:migrate` intenta vía RPC `exec_sql` y, si no existe, imprime el SQL. En este entorno hay que pegarlo en el SQL editor de Supabase:

```bash
npm run db:migrate
```

Copiar el SQL impreso y pegarlo en el SQL editor de Supabase. Ejecutar. Verificar que `leads` tiene las nuevas columnas:

```sql
select column_name from information_schema.columns
where table_name = 'leads' and column_name like 'enriched%';
```
Expected: 3 filas (`enriched_at`, `enriched_via`, `enriched_website`).

- [ ] **Step 2: No hay commit (operación contra BBDD)**

---

### Task 11: Verificación manual con `DRY_RUN=true`

**Files:** ninguno (smoke test manual).

- [ ] **Step 1: Identificar leads candidatos**

En Supabase SQL editor:
```sql
select id, business_name, city, rating, review_count
from leads
where email is null and website is null and status = 'NEW'
limit 10;
```

Si no hay leads `NEW` sin email, también vale revisar `SKIPPED` con `notes='no_email'` y devolver alguno a `NEW` manualmente con un `update leads set status='NEW' where id = ...`.

- [ ] **Step 2: Ejecutar el scraper en DRY_RUN**

Run:
```bash
DRY_RUN=true npm run scraper:burst
```

Mirar los logs. Buscar líneas `enrich: start` y `enrich: done` con sus `kind` (`has_real_website`, `email_found`, `nothing_found`, `error`).

- [ ] **Step 3: Inspeccionar resultados**

En Supabase:
```sql
select business_name, status, notes, enriched_via, enriched_website, email
from leads
where enriched_at is not null
order by enriched_at desc
limit 20;
```

Verificar a mano que las decisiones tienen sentido. Si la precisión es <80%, abrir un issue para ajustar el prompt de `judgeEnrichment` antes de promover a producción sin DRY_RUN.

- [ ] **Step 4: No hay commit (operación manual)**

---

## Self-review

**Spec coverage:**
- "Cuándo se dispara el enriquecimiento" → Task 7 (rama `!lead.email && !lead.website` y pre-qualify barato).
- "Pre-gate de qualify (importante)" → Task 3 (qualifyLeadPreEnrich) + Task 7 (usar antes de enrichLead).
- "Nuevo módulo `src/services/lead-enricher.ts`" → Task 6.
- "Nueva función en `src/services/claude.ts`: `judgeEnrichment`" → Task 5.
- "Cambios en `src/jobs/scraper.ts → analyzeOneLead`" → Task 7.
- "Cambios en `src/core/lead-filter.ts`" → Task 3.
- "Cambios en `src/services/supabase.ts` y schema" → Task 1 (SQL) + Task 2 (tipos).
- "Cambios en `notes` y motivos SKIPPED" → Task 7 (los notes nuevos están en updateLead).
- "Manejo de errores: enrichLead nunca lanza" → Task 6 (try/catch envuelve judge).
- "DRY_RUN" → Task 11 (verificación manual con DRY_RUN=true). Nota: el sender es el que respeta DRY_RUN; el scraper escribe siempre a BBDD para que se puedan auditar los outcomes. Esto es coherente con la convención actual del proyecto (`DRY_RUN` solo afecta a envío de emails, ver `loadEnv()` y `runSender`).
- "Testing — unitarios nuevos en lead-enricher" → Task 6 (8 tests).
- "Testing — modificados en scraper.test.ts" → Task 8 (4 tests nuevos).
- "Plan de despliegue" → Task 10 (migración) + Task 11 (DRY_RUN day).

**Placeholder scan:** ninguno (todos los pasos tienen código exacto o comando exacto).

**Type consistency:**
- `EnrichOutcome` se define en Task 6 con `kind: 'has_real_website' | 'email_found' | 'nothing_found' | 'error'` y en Task 7 se consumen exactamente esas 4 ramas.
- `EnrichmentJudgment` de Task 5 expone `{ has_real_website, website_url, email, reasoning }` y `enrichLead` (Task 6) lo consume con esos nombres exactos.
- `LeadRow` en Task 2 añade `enriched_at`, `enriched_via`, `enriched_website` y Task 7 escribe exactamente esos nombres.
- `qualifyLeadPreEnrich` Task 3 toma `{ business_name, rating, review_count }` y Task 7 le pasa exactamente eso.
- `searchBusinessInfo` Task 4 devuelve `{ ok, query, results, durationMs } | { ok:false, query, error, durationMs }`, y Task 6 inspecciona `search.ok` y `search.results`/`search.error` con esos nombres.

Sin desalineaciones detectadas.
