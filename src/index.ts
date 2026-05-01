import cron from 'node-cron';
import http from 'node:http';
import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { runScraperAuto } from './jobs/scraper.js';
import { runSender } from './jobs/sender.js';
import { runWatcher } from './jobs/watcher.js';
import { notifyError } from './core/health-monitor.js';

const env = loadEnv();
const log = logger.child({ component: 'main' });

let lastSenderRun = Date.now();
let lastWatcherRun = Date.now();

// Health endpoint for Railway
const port = parseInt(process.env.PORT ?? '3000');
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', lastSenderRun, lastWatcherRun }));
  } else {
    res.writeHead(404); res.end();
  }
}).listen(port, () => log.info({ port }, 'health server up'));

// SCRAPER: 07:00 ES every day
cron.schedule('0 7 * * *', async () => {
  log.info('scraper auto tick');
  try { await runScraperAuto(); } catch (err) { log.error({ err }, 'scraper failed'); }
}, { timezone: env.TZ });

// SENDER: every 3 minutes (policy gate handles workday/hours/quota)
cron.schedule('*/3 * * * *', async () => {
  try {
    await runSender();
    lastSenderRun = Date.now();
  } catch (err) { log.error({ err }, 'sender failed'); }
}, { timezone: env.TZ });

// WATCHER: every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    await runWatcher();
    lastWatcherRun = Date.now();
  } catch (err) { log.error({ err }, 'watcher failed'); }
}, { timezone: env.TZ });

// WATCHDOGS: every 30 min
cron.schedule('*/30 * * * *', async () => {
  const senderStale = Date.now() - lastSenderRun > 24 * 3600_000;
  const watcherStale = Date.now() - lastWatcherRun > 3600_000;
  if (senderStale) await notifyError('error', 'Sender watchdog', `Sender has not run in >24h. Last: ${new Date(lastSenderRun).toISOString()}`);
  if (watcherStale) await notifyError('error', 'Watcher watchdog', `Watcher has not run in >1h. Last: ${new Date(lastWatcherRun).toISOString()}`);
}, { timezone: env.TZ });

log.info({ env: env.NODE_ENV, dryRun: env.DRY_RUN }, 'system started');
