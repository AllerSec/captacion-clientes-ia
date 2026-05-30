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
    lastSentAt: NOW - 30 * 60000,
    lastEmailedBusiness: 'Óptica X',
    nextLead: { business_name: 'Taller Y', city: 'Bilbao' },
    dailySent: [
      { day: '2026-05-24', count: 2 }, { day: '2026-05-25', count: 3 },
      { day: '2026-05-26', count: 0 }, { day: '2026-05-27', count: 5 },
      { day: '2026-05-28', count: 4 }, { day: '2026-05-29', count: 1 },
      { day: '2026-05-30', count: 15 },
    ],
    funnel: { scraped: 2400, withEmail: 920, queued: 10, contacted: 24, responded: 1 },
    recentQuotaErrors: 0,
    lastEnrichAt: NOW - 2 * HOUR,
    apify: { usedUsd: 11.4, limitUsd: 29, cycleEnd: '2026-06-14T23:59:59Z' },
    instantly: { emailsSent: 48, contacted: 24, opens: 36, replies: 1, bounced: 0 },
    lastSenderRun: NOW - 3 * 60000,
    lastWatcherRun: NOW - 4 * 60000,
    deployCommit: 'ee5de0cabc123',
    dbRows: 2411,
    totalResponded: 1,
    lastRespondedAt: null,
    ...over,
  };
}

describe('buildDashboardStatus (ampliado)', () => {
  it('todo verde en operación normal', () => {
    const s = buildDashboardStatus(base());
    expect(s.global).toBe('green');
    expect(s.envios.light).toBe('green');
    expect(s.creditos.light).toBe('green');
    expect(s.sistema.light).toBe('green');
  });

  it('envíos en rojo si >24h sin enviar', () => {
    const s = buildDashboardStatus(base({ lastSentAt: NOW - 2 * DAY }));
    expect(s.envios.light).toBe('red');
    expect(s.global).toBe('red');
  });

  it('muestra el negocio del último email y del próximo', () => {
    const s = buildDashboardStatus(base());
    expect(s.envios.lines.some(l => l.includes('Óptica X'))).toBe(true);
    expect(s.proximo.lines).toContain('Taller Y');
    expect(s.proximo.lines).toContain('Bilbao');
  });

  it('próximo en ámbar si la cola está vacía', () => {
    const s = buildDashboardStatus(base({ nextLead: null }));
    expect(s.proximo.light).toBe('amber');
    expect(s.proximo.lines).toContain('Cola vacía');
  });

  it('créditos: muestra Apify en vivo y % correcto', () => {
    const s = buildDashboardStatus(base());
    expect(s.creditos.apifyPct).toBe(39); // 11.4/29
    expect(s.creditos.lines[0]).toContain('$11.40 / $29');
  });

  it('créditos en rojo si Apify >=90% del límite', () => {
    const s = buildDashboardStatus(base({ apify: { usedUsd: 27, limitUsd: 29, cycleEnd: null } }));
    expect(s.creditos.light).toBe('red');
    expect(s.global).toBe('red');
  });

  it('créditos en rojo si hay fallos de quota', () => {
    const s = buildDashboardStatus(base({ recentQuotaErrors: 5 }));
    expect(s.creditos.light).toBe('red');
  });

  it('créditos: Apify n/d si la API falló', () => {
    const s = buildDashboardStatus(base({ apify: null }));
    expect(s.creditos.apifyPct).toBe(null);
    expect(s.creditos.lines[0]).toContain('n/d');
  });

  it('créditos: expone apify y dbRows para las tarjetas del centro de mando', () => {
    const s = buildDashboardStatus(base());
    expect(s.creditos.dbRows).toBe(2411);
    expect(s.creditos.apify?.limitUsd).toBe(29);
  });

  it('instantly: muestra métricas en vivo', () => {
    const s = buildDashboardStatus(base());
    expect(s.instantly.light).toBe('green');
    expect(s.instantly.lines.some(l => l.includes('48'))).toBe(true);
    expect(s.instantly.lines.some(l => l.includes('36'))).toBe(true);
  });

  it('instantly en ámbar si la API no responde', () => {
    const s = buildDashboardStatus(base({ instantly: null }));
    expect(s.instantly.light).toBe('amber');
    expect(s.instantly.lines).toContain('API no disponible');
    expect(s.global).toBe('green'); // ámbar no tumba el global
  });

  it('gráfica: total semanal y barras', () => {
    const s = buildDashboardStatus(base());
    expect(s.grafica.bars).toHaveLength(7);
    expect(s.grafica.lines[0]).toContain('30'); // 2+3+0+5+4+1+15
  });

  it('embudo: lleva los conteos', () => {
    const s = buildDashboardStatus(base());
    expect(s.embudo.funnel.scraped).toBe(2400);
    expect(s.embudo.funnel.responded).toBe(1);
  });

  it('sistema en rojo si sender >24h o timestamps null', () => {
    expect(buildDashboardStatus(base({ lastSenderRun: NOW - 2 * DAY })).sistema.light).toBe('red');
    expect(buildDashboardStatus(base({ lastSenderRun: null, lastWatcherRun: null })).sistema.light).toBe('red');
  });

  it('respuestas en ámbar si hay respuesta reciente', () => {
    const s = buildDashboardStatus(base({ lastRespondedAt: NOW - 2 * HOUR }));
    expect(s.respuestas.light).toBe('amber');
    expect(s.global).toBe('green');
  });
});
