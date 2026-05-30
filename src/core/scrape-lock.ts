/**
 * Candado en memoria para que no se lancen dos scrapes manuales (o uno manual
 * encima del cron) a la vez. Puro y sin dependencias → testeable.
 */

let running = false;
let startedAt: number | null = null;

export function isScrapeRunning(): boolean {
  return running;
}

/** Intenta tomar el candado. Devuelve true si lo consigue, false si ya estaba ocupado. */
export function tryAcquireScrape(now = Date.now()): boolean {
  if (running) return false;
  running = true;
  startedAt = now;
  return true;
}

export function releaseScrape(): void {
  running = false;
  startedAt = null;
}

export function getScrapeStartedAt(): number | null {
  return startedAt;
}
