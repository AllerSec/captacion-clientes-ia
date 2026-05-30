/**
 * Estado en memoria del proceso, compartido entre el loop de cron (index.ts) y
 * el panel. Puro y sin dependencias para que cualquiera pueda leerlo/escribirlo.
 * Se reinicia a null en cada arranque (que es justo lo que queremos: tras un
 * deploy, "nunca" hasta que el primer tick corra).
 */

let lastSenderRun: number | null = null;
let lastWatcherRun: number | null = null;

export function markSenderRun(ts = Date.now()): void {
  lastSenderRun = ts;
}

export function markWatcherRun(ts = Date.now()): void {
  lastWatcherRun = ts;
}

export function getRuntimeState(): { lastSenderRun: number | null; lastWatcherRun: number | null } {
  return { lastSenderRun, lastWatcherRun };
}

/** Solo para tests: vuelve a null. */
export function resetRuntimeState(): void {
  lastSenderRun = null;
  lastWatcherRun = null;
}
