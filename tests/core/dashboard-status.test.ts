import { describe, it, expect } from 'vitest';
import { buildDashboardStatus, type DashboardInput } from '../../src/core/dashboard-status.js';

const NOW = new Date('2026-05-30T18:00:00Z').getTime();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function base(over: Partial<DashboardInput> = {}): DashboardInput {
  return {
    now: NOW,
    sentToday: 15,
    queued: 10,
    lastSentAt: NOW - 30 * 60000, // hace 30 min
    totalContacted: 24,
    recentQuotaErrors: 0,
    lastEnrichAt: NOW - 2 * HOUR,
    lastSenderRun: NOW - 3 * 60000,
    lastWatcherRun: NOW - 4 * 60000,
    deployCommit: 'ee5de0cabc123',
    totalResponded: 1,
    lastRespondedAt: null,
    ...over,
  };
}

describe('buildDashboardStatus', () => {
  it('todo verde en operación normal', () => {
    const s = buildDashboardStatus(base());
    expect(s.global).toBe('green');
    expect(s.envios.light).toBe('green');
    expect(s.creditos.light).toBe('green');
    expect(s.sistema.light).toBe('green');
    expect(s.respuestas.light).toBe('green');
  });

  it('envíos en rojo si >24h sin enviar', () => {
    const s = buildDashboardStatus(base({ lastSentAt: NOW - 2 * DAY }));
    expect(s.envios.light).toBe('red');
    expect(s.global).toBe('red');
  });

  it('envíos en ámbar si nunca se ha enviado (arranque)', () => {
    const s = buildDashboardStatus(base({ lastSentAt: null }));
    expect(s.envios.light).toBe('amber');
    expect(s.global).toBe('green'); // ámbar no es alerta global
  });

  it('créditos en rojo si hay fallos de quota recientes', () => {
    const s = buildDashboardStatus(base({ recentQuotaErrors: 5 }));
    expect(s.creditos.light).toBe('red');
    expect(s.creditos.lines[0]).toContain('5');
    expect(s.global).toBe('red');
  });

  it('sistema en rojo si el sender lleva >24h sin correr', () => {
    const s = buildDashboardStatus(base({ lastSenderRun: NOW - 2 * DAY }));
    expect(s.sistema.light).toBe('red');
    expect(s.global).toBe('red');
  });

  it('sistema en rojo si el watcher lleva >1h sin correr', () => {
    const s = buildDashboardStatus(base({ lastWatcherRun: NOW - 2 * HOUR }));
    expect(s.sistema.light).toBe('red');
  });

  it('sistema en rojo si los timestamps son null (arranque sin tick aún)', () => {
    const s = buildDashboardStatus(base({ lastSenderRun: null, lastWatcherRun: null }));
    expect(s.sistema.light).toBe('red');
  });

  it('respuestas en ámbar si hay respuesta reciente', () => {
    const s = buildDashboardStatus(base({ lastRespondedAt: NOW - 2 * HOUR }));
    expect(s.respuestas.light).toBe('amber');
    expect(s.respuestas.lines[0]).toContain('reciente');
    expect(s.global).toBe('green'); // sigue siendo buena señal
  });

  it('muestra el commit recortado a 7 chars', () => {
    const s = buildDashboardStatus(base());
    expect(s.sistema.lines.some(l => l.includes('ee5de0c'))).toBe(true);
  });

  it('muestra "desconocido" si no hay commit', () => {
    const s = buildDashboardStatus(base({ deployCommit: null }));
    expect(s.sistema.lines.some(l => l.includes('desconocido'))).toBe(true);
  });

  it('formatea el tiempo relativo (min/h/d/nunca)', () => {
    const s = buildDashboardStatus(base({
      lastSentAt: NOW - 5 * 60000,
      lastEnrichAt: NOW - 3 * HOUR,
      lastRespondedAt: null,
    }));
    expect(s.envios.lines.some(l => l.includes('min'))).toBe(true);
    expect(s.creditos.lines.some(l => l.includes('h'))).toBe(true);
    expect(s.respuestas.lines.some(l => l.includes('nunca'))).toBe(true);
  });
});
