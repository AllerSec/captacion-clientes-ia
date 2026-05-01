import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetByStatus = vi.fn();
const mockGetEmailByLead = vi.fn();
const mockGetThreadMessages = vi.fn();
const mockUpdateLead = vi.fn();
const mockRecordMetric = vi.fn();
const mockClassifyText = vi.fn();

vi.mock('../../src/services/supabase.js', () => ({
  getLeadsByStatus: mockGetByStatus,
  updateLead: mockUpdateLead,
  recordMetric: mockRecordMetric,
  getEmailByLead: mockGetEmailByLead,
}));
vi.mock('../../src/services/gmail.js', () => ({ getThreadMessages: mockGetThreadMessages }));
vi.mock('../../src/services/claude.js', () => ({ classifyReplyText: mockClassifyText }));
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

describe('runWatcher', () => {
  beforeEach(() => {
    [mockGetByStatus, mockGetEmailByLead, mockGetThreadMessages,
     mockUpdateLead, mockRecordMetric, mockClassifyText].forEach(m => m.mockReset());
  });

  it('marks lead RESPONDED on human reply', async () => {
    mockGetByStatus.mockResolvedValue([{ id: 'L1' }]);
    mockGetEmailByLead.mockResolvedValue({ gmail_thread_id: 't1', variant_id: 'v1' });
    mockGetThreadMessages.mockResolvedValue([
      { id: 'm1', isFromUs: true,  fromEmail: 'us@us.com',   bodyText: 'hola',       internalDate: 1 },
      { id: 'm2', isFromUs: false, fromEmail: 'them@b.com',  bodyText: 'sí, contame', internalDate: 2 },
    ]);
    mockClassifyText.mockResolvedValue('human_reply');

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockUpdateLead).toHaveBeenCalledWith('L1', expect.objectContaining({ status: 'RESPONDED' }));
    expect(mockRecordMetric).toHaveBeenCalledWith('replied', 'L1', 'v1', expect.any(Object));
  });

  it('marks AUTO_REPLY for out-of-office without RESPONDED', async () => {
    mockGetByStatus.mockResolvedValue([{ id: 'L2' }]);
    mockGetEmailByLead.mockResolvedValue({ gmail_thread_id: 't2', variant_id: 'v1' });
    mockGetThreadMessages.mockResolvedValue([
      { id: 'm1', isFromUs: true,  fromEmail: 'us@us.com',  bodyText: 'hola',                                          internalDate: 1 },
      { id: 'm2', isFromUs: false, fromEmail: 'them@b.com', bodyText: 'estaré fuera de la oficina hasta el lunes',     internalDate: 2 },
    ]);

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockUpdateLead).toHaveBeenCalledWith('L2', expect.objectContaining({ status: 'AUTO_REPLY' }));
  });

  it('does nothing when no incoming messages', async () => {
    mockGetByStatus.mockResolvedValue([{ id: 'L3' }]);
    mockGetEmailByLead.mockResolvedValue({ gmail_thread_id: 't3', variant_id: 'v1' });
    mockGetThreadMessages.mockResolvedValue([
      { id: 'm1', isFromUs: true, fromEmail: 'us@us.com', bodyText: 'hola', internalDate: 1 },
    ]);

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockUpdateLead).not.toHaveBeenCalled();
  });

  it('marks BOUNCED on bounce text', async () => {
    mockGetByStatus.mockResolvedValue([{ id: 'L4' }]);
    mockGetEmailByLead.mockResolvedValue({ gmail_thread_id: 't4', variant_id: 'v1' });
    mockGetThreadMessages.mockResolvedValue([
      { id: 'm1', isFromUs: true,  fromEmail: 'us@us.com',                  bodyText: 'hi', internalDate: 1 },
      { id: 'm2', isFromUs: false, fromEmail: 'mailer-daemon@google.com',   bodyText: 'Mail Delivery Subsystem - delivery failed', internalDate: 2 },
    ]);

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockUpdateLead).toHaveBeenCalledWith('L4', expect.objectContaining({ status: 'BOUNCED' }));
  });
});
