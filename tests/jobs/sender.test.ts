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

// Secuencia válida en el NUEVO diseño (2026-05-31): email1 SIN precio, con
// competidor + enlace del caso; precio SOLO en FU3; unaxaller.com en FU2.
const validSubject = 'taller en Bilbao';
const validBody = `<p style="margin:0 0 10px 0">Hola, Taller X:</p>`
  + `<p style="margin:0 0 10px 0">Si alguien busca taller en Bilbao, encuentra a <b>Taller Juanjo</b> y a ti no, porque no tienes web. Esas llamadas se van al que sí aparece.</p>`
  + `<p style="margin:0 0 10px 0">A otro taller le hice la web (<a href="https://motosarretxe.com">motosarretxe.com</a>) y dejó de perderlas. Lo mismo haría por ti.</p>`
  + `<p style="margin:0 0 10px 0">¿Te viene bien que te lo cuente en una llamada de 5 minutos? O por WhatsApp, como prefieras.</p>`
  + `<p style="margin:0 0 10px 0">Un saludo,<br>Unax</p>`;

const fu1 = `<p style="margin:0 0 10px 0">Cuando alguien te busca en Google y no sales, ni te ve. Llama al primero que aparece. ¿Miro tu caso?</p><p style="margin:0 0 10px 0">Unax</p>`;
const fu2 = `<p style="margin:0 0 10px 0">Mejor que contártelo, que lo veas: tienes ejemplos de talleres como el tuyo en <a href="https://unaxaller.com">unaxaller.com</a>. ¿Le echas un ojo?</p>`;
const fu3 = `<p style="margin:0 0 10px 0">Lo pongo fácil: empiezas sin poner nada y son <b>149€/mes</b>, como el gestor. El primer mes va a prueba: si no te trae más llamadas, no lo pagas. ¿Te enseño cómo quedaría?</p><p style="margin:0 0 10px 0">Unax</p>`;
const fu4 = `<p style="margin:0 0 10px 0">Lo dejo aquí, último correo. 1 = me interesa, 2 = ahora no, 3 = déjalo. Un abrazo, Unax</p>`;
const validBodies = [validBody, fu1, fu2, fu3, fu4];

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
    mockGenerate.mockResolvedValue({ subject: validSubject, bodies: validBodies });
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
    mockGenerate.mockResolvedValue({ subject: validSubject, bodies: validBodies });
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
