import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetByStatus = vi.fn();
const mockUpdateLead = vi.fn();
const mockGetVariants = vi.fn();
const mockRecordSent = vi.fn();
const mockRecordMetric = vi.fn();
const mockGenerate = vi.fn();
const mockAddLead = vi.fn();

vi.mock('../../src/services/supabase.js', () => ({
  getLeadsByStatus: mockGetByStatus,
  updateLead: mockUpdateLead,
  getActiveVariants: mockGetVariants,
  recordEmailSent: mockRecordSent,
  recordMetric: mockRecordMetric,
}));
vi.mock('../../src/services/claude.js', () => ({ generateEmail: mockGenerate }));
vi.mock('../../src/services/instantly.js', () => ({ addLeadToCampaign: mockAddLead }));
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({
    DRY_RUN: false,
    KILL_SWITCH: false,
    SENDER_NAME: 'Unax',
    SENDER_WEBSITE: 'unaxaller.com',
    SENDER_CITY: 'Irún',
  }),
}));
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock('../../src/core/health-monitor.js', () => ({ notifyError: vi.fn() }));

const validBody = `<p>Hola,</p><p>Te lo cuento muy rápido que sé que estáis liados.</p><p>Soy Unax, desarrollador web de Irún. Busqué talleres en Google Maps por la zona y no os encontré web, así que os escribo.</p><p>El caso es que hice la web de un taller hace poco (motosarretxe.com, por si le echáis un vistazo) y sé que a muchos mecánicos sin web se les escapan llamadas solo porque no aparecen cuando alguien busca en Google. Puede que a vosotros os pase lo mismo, puede que no jeje.</p><p>Os preparo una web de prueba <b>gratis y sin compromiso</b> para que veáis cómo quedaría la vuestra.</p><p>¿Os apetece echarle un vistazo?</p><p>¡Un saludo! Unax<br>unaxaller.com · Irún</p>`;

const leadRow = {
  id: 'L1', business_name: 'Taller X', email: 'a@b.com', rating: 4.7,
  review_count: 50, website: null, web_issues: ['no_website'],
  category: null, city: 'Bilbao', query_used: 'taller mecánico Bilbao',
};

describe('runSender', () => {
  beforeEach(() => {
    [mockGetByStatus, mockUpdateLead, mockGetVariants, mockRecordSent,
     mockRecordMetric, mockGenerate, mockAddLead].forEach(m => m.mockReset());
  });

  it('queues one lead in Instantly and marks lead QUEUED', async () => {
    mockGetVariants.mockResolvedValue([{ id: 'v1', name: 'v1_directo', prompt_snippet: '', weight: 1 }]);
    mockGetByStatus.mockResolvedValue([leadRow]);
    mockGenerate.mockResolvedValue({ subject: 'Pregunta muy rápida', body: validBody });
    mockAddLead.mockResolvedValue({ instantlyLeadId: 'iid-123', skipped: false });

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: new Date('2026-05-05T10:00:00+02:00') });

    expect(mockAddLead).toHaveBeenCalledWith(expect.objectContaining({
      to: 'a@b.com',
      subject: 'Pregunta muy rápida',
      leadDbId: 'L1',
    }));
    expect(mockRecordSent).toHaveBeenCalledWith(expect.objectContaining({
      gmail_message_id: 'iid-123',
      gmail_thread_id: '',
    }));
    expect(mockUpdateLead).toHaveBeenCalledWith('L1', expect.objectContaining({ status: 'QUEUED' }));
    expect(mockRecordMetric).toHaveBeenCalledWith('queued', 'L1', 'v1', expect.any(Object));
  });

  it('marks lead SKIPPED when Instantly reports duplicate', async () => {
    mockGetVariants.mockResolvedValue([{ id: 'v1', name: 'v1', prompt_snippet: '', weight: 1 }]);
    mockGetByStatus.mockResolvedValue([leadRow]);
    mockGenerate.mockResolvedValue({ subject: 'Pregunta muy rápida', body: validBody });
    mockAddLead.mockResolvedValue({ instantlyLeadId: '', skipped: true });

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: new Date('2026-05-05T10:00:00+02:00') });

    expect(mockUpdateLead).toHaveBeenCalledWith('L1', expect.objectContaining({
      status: 'SKIPPED',
      notes: 'instantly_duplicate',
    }));
    expect(mockRecordSent).not.toHaveBeenCalled();
  });

  it('skips when no active variants', async () => {
    mockGetVariants.mockResolvedValue([]);

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: new Date('2026-05-05T10:00:00+02:00') });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockAddLead).not.toHaveBeenCalled();
  });

  it('skips when no READY_TO_SEND leads', async () => {
    mockGetVariants.mockResolvedValue([{ id: 'v1', name: 'v1', prompt_snippet: '', weight: 1 }]);
    mockGetByStatus.mockResolvedValue([]);

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: new Date('2026-05-05T10:00:00+02:00') });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockAddLead).not.toHaveBeenCalled();
  });
});
