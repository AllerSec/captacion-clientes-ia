import cron from 'node-cron';
import http from 'node:http';
import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { runScraperAuto } from './jobs/scraper.js';
import { runSender } from './jobs/sender.js';
import { runWatcher } from './jobs/watcher.js';
import { notifyError } from './core/health-monitor.js';
import { runDailySummary } from './jobs/daily-summary.js';
import { ensureVariantsSeeded } from './config/variants.js';
import { ensureCampaignSequence } from './services/instantly.js';
import { PANEL_HTML } from './web/panel-html.js';
import { getDashboardData } from './services/dashboard-data.js';
import { markSenderRun, markWatcherRun, getRuntimeState } from './core/runtime-state.js';
import { isPanelAuthorized, extractToken } from './core/panel-auth.js';
import { tryAcquireScrape, releaseScrape } from './core/scrape-lock.js';

const env = loadEnv();
const log = logger.child({ component: 'main' });

// Idempotent: upserts variant definitions on every deploy. Safe to fail (sender will warn).
ensureVariantsSeeded().catch(err => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, 'variant seed failed at boot');
  notifyError('warn', 'Variant seed failed at boot', err instanceof Error ? (err.stack ?? err.message) : String(err))
    .catch(() => { /* health-monitor itself broken, swallow */ });
});

// Idempotent: ensures the Instantly campaign has the 5-step follow-up sequence.
// Safe to fail (leads still queue; follow-ups just won't fire until fixed).
ensureCampaignSequence().catch(err => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, 'campaign sequence setup failed at boot');
  notifyError('warn', 'Campaign sequence setup failed at boot', err instanceof Error ? (err.stack ?? err.message) : String(err))
    .catch(() => { /* health-monitor itself broken, swallow */ });
});

// Marca de arranque del proceso. El watchdog la usa como referencia cuando un
// job aún no ha corrido (lastSenderRun/lastWatcherRun == null), para no quedarse
// fail-open si un deploy arranca el proceso pero no ejecuta los crons.
const bootAt = Date.now();

// Health + panel server for Railway
const port = parseInt(process.env.PORT ?? '3000');
http.createServer(async (req, res) => {
  const url = (req.url ?? '').split('?')[0];
  if (url === '/health') {
    const { lastSenderRun, lastWatcherRun } = getRuntimeState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', lastSenderRun, lastWatcherRun }));
  } else if (url === '/panel' || url === '/panel/data') {
    // Gate opcional por token (PANEL_TOKEN). Si no está configurado, acceso abierto.
    if (!isPanelAuthorized(env.PANEL_TOKEN, extractToken(req.url ?? '', req.headers['authorization']))) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }
    if (url === '/panel') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PANEL_HTML);
      return;
    }
    try {
      const data = await getDashboardData();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch (err) {
      // No filtramos el mensaje crudo de Supabase al cliente: log server-side,
      // respuesta genérica. El panel solo necesita saber que no pudo leer.
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'panel data failed');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'internal' }));
    }
  } else if (url === '/panel/action/scrape') {
    // Acción que EJECUTA: token obligatorio siempre + solo POST + candado anti-repetición.
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
      return;
    }
    // El token es obligatorio aquí aunque el panel base no lo tenga configurado:
    // una acción que ejecuta NUNCA debe quedar abierta.
    if (!env.PANEL_TOKEN || !isPanelAuthorized(env.PANEL_TOKEN, extractToken(req.url ?? '', req.headers['authorization']))) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }
    if (!tryAcquireScrape()) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'scrape_already_running' }));
      return;
    }
    // Lanza en segundo plano: respondemos ya, el scrape sigue en el proceso.
    log.info('manual scrape triggered from panel');
    runScraperAuto()
      .then(() => log.info('manual scrape finished'))
      .catch(err => log.error({ err: err instanceof Error ? err.message : String(err) }, 'manual scrape failed'))
      .finally(() => releaseScrape());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, started: true }));
  } else {
    res.writeHead(404); res.end();
  }
}).listen(port, () => log.info({ port }, 'health+panel server up'));

// SCRAPER: 07:00 ES every day
cron.schedule('0 7 * * *', async () => {
  log.info('scraper auto tick');
  try { await runScraperAuto(); } catch (err) { log.error({ err }, 'scraper failed'); }
}, { timezone: env.TZ });

// SENDER: every 3 minutes (policy gate handles workday/hours/quota)
cron.schedule('*/3 * * * *', async () => {
  try {
    await runSender();
    markSenderRun();
  } catch (err) { log.error({ err }, 'sender failed'); }
}, { timezone: env.TZ });

// WATCHER: every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    await runWatcher();
    markWatcherRun();
  } catch (err) { log.error({ err }, 'watcher failed'); }
}, { timezone: env.TZ });

// WATCHDOGS: every 30 min
cron.schedule('*/30 * * * *', async () => {
  const { lastSenderRun, lastWatcherRun } = getRuntimeState();
  // Fail-safe: si un job NUNCA ha corrido (null), lo tratamos como caído una vez
  // pasado el periodo de gracia desde el arranque. Así un deploy que arranca el
  // proceso pero no ejecuta los crons SÍ dispara alerta (no se queda callado).
  const sinceSender = lastSenderRun ?? bootAt;
  const sinceWatcher = lastWatcherRun ?? bootAt;
  const senderStale = Date.now() - sinceSender > 24 * 3600_000;
  const watcherStale = Date.now() - sinceWatcher > 3600_000;
  const desc = (ts: number | null) => ts == null ? 'nunca desde el arranque' : new Date(ts).toISOString();
  if (senderStale) await notifyError('error', 'Sender watchdog', `Sender lleva >24h sin ejecutarse. Último: ${desc(lastSenderRun)}`);
  if (watcherStale) await notifyError('error', 'Watcher watchdog', `Watcher lleva >1h sin ejecutarse. Último: ${desc(lastWatcherRun)}`);
}, { timezone: env.TZ });

// DAILY SUMMARY: every day at 21:00 ES
cron.schedule('0 21 * * *', async () => {
  log.info('daily summary tick');
  try { await runDailySummary(); } catch (err) { log.error({ err }, 'daily summary failed'); }
}, { timezone: env.TZ });

log.info({ env: env.NODE_ENV, dryRun: env.DRY_RUN }, 'system started');
