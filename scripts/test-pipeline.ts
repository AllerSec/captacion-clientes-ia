import { runScraper } from '../src/jobs/scraper.js';
import { runSender } from '../src/jobs/sender.js';
import { loadEnv, resetEnvCache } from '../src/config/env.js';

async function main() {
  process.env.DRY_RUN = 'true';
  resetEnvCache();
  loadEnv();

  const query = process.argv[2] ?? 'clínica dental Bilbao';
  console.log(`[dry-run] scraping query: ${query}`);
  await runScraper([query]);

  console.log('[dry-run] running sender (5 leads max)...');
  for (let i = 0; i < 5; i++) {
    await runSender({ now: new Date('2026-05-05T10:00:00+02:00') });
  }
  console.log('Done. Check the logs above for generated emails.');
}
main().catch(e => { console.error(e); process.exit(1); });
