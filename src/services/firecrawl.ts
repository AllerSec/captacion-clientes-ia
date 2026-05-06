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

export function resetFirecrawlClientForTests(): void {
  client = null;
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
          { type: 'screenshot', fullPage: true, quality: 80, viewport: { width: 1280, height: 800 } },
          { type: 'json', prompt: JSON_PROMPT },
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
