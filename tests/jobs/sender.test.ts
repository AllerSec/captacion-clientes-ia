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

const validSubject = 'Presencia en Google para Taller X: Cómo superar a Taller Juanjo sin pagar miles de euros de golpe';
const validBody = `<p style="margin:0 0 8px 0">Hola, equipo de Taller X:</p><p style="margin:0 0 8px 0">Soy Unax, desarrollador web en Irún. Os escribo porque buscando talleres en Bilbao a través de Google Maps, he visto que <b>Taller Juanjo</b> aparece en los primeros resultados y se está llevando llamadas de la zona que os corresponden, simplemente por tener una web optimizada. Vosotros no aparecéis ahí porque no tenéis página web.</p><p style="margin:0 0 8px 0">Hace poco trabajé con un taller (<a href="https://motosarretxe.com">motosarretxe.com</a>) solucionando esto mismo. Desde que lanzamos su sistema, les entra un flujo constante de llamadas que antes elegían a otros talleres de la zona solo porque los encontraban antes en Google.</p><p style="margin:0 0 8px 0">Sé que las agencias tradicionales os van a pedir entre 2.000€ y 3.000€ de golpe por haceros la web y el posicionamiento. Por eso yo trabajo con un modelo de <b>Renting Web</b>:</p><p style="margin:0 0 4px 0"><b>0€ de pago inicial:</b> No desembolsáis nada por el diseño, el desarrollo ni la optimización de vuestra ficha de Google.</p><p style="margin:0 0 4px 0"><b>Cuota fija de 149€/mes (como el gestor):</b> Incluye la web completa (hasta 5 secciones), hosting, posicionamiento continuo, sistema para conseguir reseñas y soporte por WhatsApp.</p><p style="margin:0 0 8px 0"><b>Garantía de 30 días:</b> Si el primer mes no os convence, os devuelvo el dinero. Sin preguntas.</p><p style="margin:0 0 8px 0">Si os interesa y queréis que os explique en 5 minutos por teléfono cómo lo haríamos, decidme qué día os viene bien que os llame.</p><p style="margin:0 0 8px 0">Un saludo,<br>Unax Aller<br><a href="https://unaxaller.com">unaxaller.com</a> · Irún</p>`;

const leadRow = {
  id: 'L1', business_name: 'Taller X', email: 'a@b.com', rating: 4.7,
  review_count: 50, website: null, web_issues: ['no_website'],
  category: null, city: 'Bilbao', query_used: 'taller mecánico Bilbao',
  top_competitors: [{ name: 'Taller Juanjo', website: 'https://tallerjuanjo.com' }],
};

describe('runSender', () => {
  beforeEach(() => {
    [mockGetByStatus, mockUpdateLead, mockGetVariants, mockRecordSent,
     mockRecordMetric, mockGenerate, mockAddLead].forEach(m => m.mockReset());
  });

  it('queues one lead in Instantly and marks lead QUEUED', async () => {
    mockGetVariants.mockResolvedValue([{ id: 'v1', name: 'v1_directo', prompt_snippet: '', weight: 1 }]);
    mockGetByStatus.mockResolvedValue([leadRow]);
    mockGenerate.mockResolvedValue({ subject: validSubject, body: validBody });
    mockAddLead.mockResolvedValue({ instantlyLeadId: 'iid-123', skipped: false });

    const { runSender } = await import('../../src/jobs/sender.js');
    await runSender({ now: new Date('2026-05-05T10:00:00+02:00') });

    expect(mockAddLead).toHaveBeenCalledWith(expect.objectContaining({
      to: 'a@b.com',
      subject: validSubject,
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
    mockGenerate.mockResolvedValue({ subject: validSubject, body: validBody });
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
