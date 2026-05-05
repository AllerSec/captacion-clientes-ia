export interface FetchResult {
  url: string;
  status: number;
  html: string;
  sizeBytes: number;
  durationMs: number;
  error?: string;
}

export interface AnalysisResult {
  score: number;
  issues: string[];
}

const OBSOLETE_GENERATORS = [
  /frontpage/i, /joomla! 1/i, /joomla! 2/i, /wix\.com\/website-builder/i,
  /dreamweaver/i, /microsoft office/i,
];

export function analyzeHtml(r: FetchResult): AnalysisResult {
  const issues: string[] = [];
  let score = 0;

  if (r.error || r.status === 0 || r.status >= 400) {
    return { score: 100, issues: ['unreachable'] };
  }

  if (r.url.startsWith('http://')) { issues.push('no_https'); score += 25; }

  if (!/<meta[^>]+name=["']viewport["']/i.test(r.html)) {
    issues.push('not_responsive'); score += 25;
  }
  if (r.durationMs > 4000) { issues.push('slow'); score += 15; }
  if (r.sizeBytes > 500_000) { issues.push('heavy'); score += 10; }

  const genMatch = r.html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i);
  if (genMatch && OBSOLETE_GENERATORS.some(rx => rx.test(genMatch[1]))) {
    issues.push('obsolete_tech'); score += 20;
  }

  const copyMatch = r.html.match(/©\s*(\d{4})/);
  if (copyMatch && parseInt(copyMatch[1]) < 2020) {
    issues.push('old_copyright'); score += 15;
  }

  if (!/<meta[^>]+property=["']og:/i.test(r.html)) { issues.push('no_og'); score += 5; }
  if (!/<link[^>]+rel=["'][^"']*icon/i.test(r.html)) { issues.push('no_favicon'); score += 5; }

  return { score: Math.min(score, 100), issues };
}

// Returns the oldest plausible copyright year found in the HTML footer area, or null.
// "Oldest" because "© 2008-2024" is a "we have been here since 2008" signal.
export function extractFooterYear(html: string, now: Date = new Date()): number | null {
  if (!html) return null;
  const currentYear = now.getFullYear();
  const min = 1995;
  const max = currentYear + 1;

  const footerStart = Math.floor(html.length * 0.8);
  const footerSlice = html.slice(footerStart);

  const patterns = [
    /(?:©|&copy;)\s*(?:&nbsp;)?\s*(\d{4})\s*(?:[-–—]\s*(\d{4}))?/gi,
    /copyright\s+(?:(?:©|&copy;)\s*)?(\d{4})/gi,
  ];

  const years = new Set<number>();
  for (const source of [footerSlice, html]) {
    for (const rx of patterns) {
      const local = new RegExp(rx.source, rx.flags);
      let m: RegExpExecArray | null;
      while ((m = local.exec(source)) !== null) {
        const a = parseInt(m[1], 10);
        if (a >= min && a <= max) years.add(a);
        if (m[2]) {
          const b = parseInt(m[2], 10);
          if (b >= min && b <= max) years.add(b);
        }
      }
    }
    if (years.size > 0) break;
  }

  if (years.size === 0) return null;
  return Math.min(...years);
}

// Combines the Claude visual judgment with a hard footer-year signal.
//   "early 2010s", 2011 -> "early 2010s (footer: ©2011)"
//   "modern",      2011 -> "modern but footer: ©2011"
//   "early 2010s", null -> "early 2010s"
//   null,          2011 -> "footer: ©2011"
export function composeVisualEra(visualEra: string | null, footerYear: number | null): string | null {
  if (!visualEra && footerYear == null) return null;
  if (footerYear == null) return visualEra;
  if (!visualEra) return `footer: ©${footerYear}`;

  const looksOld = /200\d|201[0-5]|early\s*2010|antes de|pre[\s-]?responsive|antiguo|obsoleto/i.test(visualEra);
  return looksOld
    ? `${visualEra} (footer: ©${footerYear})`
    : `${visualEra} but footer: ©${footerYear}`;
}
