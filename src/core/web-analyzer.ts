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
