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
  console.log('OK', JSON.stringify({
    finalUrl: r.finalUrl,
    statusCode: r.statusCode,
    durationMs: r.durationMs,
    markdownChars: r.markdown.length,
    linksCount: r.links.length,
    hasScreenshot: !!r.screenshotUrl,
    screenshotUrl: r.screenshotUrl,
    signals: r.signals,
  }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
