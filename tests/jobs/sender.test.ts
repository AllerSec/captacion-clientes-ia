import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetByStatus = vi.fn();
const mockUpdateLead = vi.fn();
const mockCountSent = vi.fn();
const mockLastSent = vi.fn();
const mockFirstSent = vi.fn();
const mockGetVariants = vi.fn();
const mockRecordSent = vi.fn();
const mockRecordMetric = vi.fn();
const mockGenerate = vi.fn();
const mockSendEmail = vi.fn();

vi.mock('../../src/services/supabase.js', () => ({
  getLeadsByStatus: mockGetByStatus,
  updateLead: mockUpdateLead,
  countSentToday: mockCountSent,
  getLastSentAt: mockLastSent,
  getFirstSentAt: mockFirstSent,
  getActiveVariants: mockGetVariants,
  recordEmailSent: mockRecordSent,
  recordMetric: mockRecordMetric,
}));
vi.mock('../../src/services/claude.js', () => ({ generateEmail: mockGenerate }));
vi.mock('../../src/services/gmail.js', () => ({ sendEmail: mockSendEmail }));
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({
    DRY_RUN: false,
    SEND_MIN_INTERVAL_MIN: 2,
    SEND_MAX_INTERVAL_MIN: 5,
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

describe('runSender', () => {
  beforeEach(() => {
    [mockGetByStatus, mockUpdateLead, mockCountSent, mockLastSent, mockFirstSent,
     mockGetVariants, mockRecordSent, mockRecordMetric, mockGenerate, mockSendEmail]
       .forEach(m => m.mockReset());
  });

  it('skips send when policy blocks (weekend)', async () => {
    const saturday = new Date('2026-05-09T10:00:00+02:00');
    mockCountSent.mockResolvedValue(0);
    mockLastSent.mockResolvedValue(null);
    mockFirstSent.mockResolvedValue(null);

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: saturday });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends one email and marks lead CONTACTED', async () => {
    const tuesday = new Date('2026-05-05T10:00:00+02:00');
    mockCountSent.mockResolvedValue(0);
    mockLastSent.mockResolvedValue(null);
    mockFirstSent.mockResolvedValue(null);
    mockGetVariants.mockResolvedValue([{ id: 'v1', name: 'v1_directo', prompt_snippet: '', weight: 1 }]);
    mockGetByStatus.mockResolvedValue([{
      id: 'L1', business_name: 'Taller X', email: 'a@b.com', rating: 4.7,
      review_count: 50, website: null, web_issues: ['no_website'],
      category: null, city: 'Bilbao', query_used: 'taller mecánico Bilbao',
    }]);
    mockGenerate.mockResolvedValue({
      subject: 'Pregunta muy rápida',
      body: `<p>Hola,</p><p>Te lo cuento muy rápido que sé que estáis liados.</p><p>Soy Unax, desarrollador web de Irún. Busqué talleres en Google Maps por la zona y no os encontré web, así que os escribo.</p><p>El caso es que hice la web de un taller hace poco (motosarretxe.com, por si le echáis un vistazo) y sé que a muchos mecánicos sin web se les escapan llamadas solo porque no aparecen cuando alguien busca en Google. Puede que a vosotros os pase lo mismo, puede que no jeje.</p><p>Os preparo una web de prueba <b>gratis y sin compromiso</b> para que veáis cómo quedaría la vuestra.</p><p>¿Os apetece echarle un vistazo?</p><p>¡Un saludo! Unax<br>unaxaller.com · Irún</p>`,
    });
    mockSendEmail.mockResolvedValue({ messageId: 'm1', threadId: 't1' });

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: tuesday });

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com' }));
    expect(mockRecordSent).toHaveBeenCalledWith(expect.objectContaining({ gmail_message_id: 'm1' }));
    expect(mockUpdateLead).toHaveBeenCalledWith('L1', expect.objectContaining({ status: 'CONTACTED' }));
    expect(mockRecordMetric).toHaveBeenCalledWith('sent', 'L1', 'v1', expect.any(Object));
  });

  it('skips send when no active variants', async () => {
    const tuesday = new Date('2026-05-05T10:00:00+02:00');
    mockCountSent.mockResolvedValue(0);
    mockLastSent.mockResolvedValue(null);
    mockFirstSent.mockResolvedValue(null);
    mockGetVariants.mockResolvedValue([]);  // no variants

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: tuesday });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('skips when no READY_TO_SEND leads', async () => {
    const tuesday = new Date('2026-05-05T10:00:00+02:00');
    mockCountSent.mockResolvedValue(0);
    mockLastSent.mockResolvedValue(null);
    mockFirstSent.mockResolvedValue(null);
    mockGetVariants.mockResolvedValue([{ id: 'v1', name: 'v1', prompt_snippet: '', weight: 1 }]);
    mockGetByStatus.mockResolvedValue([]);

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: tuesday });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
