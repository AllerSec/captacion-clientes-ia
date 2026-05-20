import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetEmailByLead = vi.fn();
const mockUpdateLead = vi.fn();
const mockRecordMetric = vi.fn();
const mockGetCursor = vi.fn();
const mockSetCursor = vi.fn();

const mockListByStatus = vi.fn();
const mockListContactedSince = vi.fn();

vi.mock('../../src/services/supabase.js', () => ({
  updateLead: mockUpdateLead,
  recordMetric: mockRecordMetric,
  getEmailByLead: mockGetEmailByLead,
  getWatcherCursor: mockGetCursor,
  setWatcherCursor: mockSetCursor,
}));
vi.mock('../../src/services/instantly.js', () => ({
  listLeadsByStatus: mockListByStatus,
  listLeadsContactedSince: mockListContactedSince,
  getLeadDbIdFromCustom: (lead: { custom_variables?: { lead_db_id?: unknown } | null }) => {
    const v = lead.custom_variables?.lead_db_id;
    return typeof v === 'string' ? v : null;
  },
}));
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock('../../src/core/health-monitor.js', () => ({ notifyError: vi.fn() }));

function instantlyLead(opts: { id: string; dbId: string; status?: number; lastContact?: string; lastReply?: string }) {
  return {
    id: opts.id,
    email: 'x@y.com',
    status: opts.status ?? 1,
    timestamp_last_contact: opts.lastContact ?? null,
    timestamp_last_reply: opts.lastReply ?? null,
    email_reply_count: 0,
    custom_variables: { lead_db_id: opts.dbId },
  };
}

describe('runWatcher', () => {
  beforeEach(() => {
    [mockGetEmailByLead, mockUpdateLead, mockRecordMetric, mockGetCursor, mockSetCursor,
     mockListByStatus, mockListContactedSince].forEach(m => m.mockReset());
    mockGetCursor.mockResolvedValue(null);
    mockGetEmailByLead.mockResolvedValue({ variant_id: 'v1' });
    mockListContactedSince.mockResolvedValue([]);
    mockListByStatus.mockResolvedValue([]);
  });

  it('marks newly-contacted lead as CONTACTED', async () => {
    mockListContactedSince.mockResolvedValue([
      instantlyLead({ id: 'iid-1', dbId: 'L1', lastContact: '2026-05-20T09:00:00Z' }),
    ]);

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockUpdateLead).toHaveBeenCalledWith('L1', expect.objectContaining({
      status: 'CONTACTED',
      contacted_at: '2026-05-20T09:00:00Z',
    }));
    expect(mockRecordMetric).toHaveBeenCalledWith('sent', 'L1', 'v1', expect.any(Object));
    expect(mockSetCursor).toHaveBeenCalled();
  });

  it('marks lead RESPONDED when Instantly reports reply', async () => {
    mockListByStatus.mockImplementation(async (filter: string) => {
      if (filter === 'FILTER_VAL_REPLIED') {
        return [instantlyLead({ id: 'iid-2', dbId: 'L2', lastReply: '2026-05-20T10:00:00Z' })];
      }
      return [];
    });

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockUpdateLead).toHaveBeenCalledWith('L2', expect.objectContaining({
      status: 'RESPONDED',
      responded_at: '2026-05-20T10:00:00Z',
    }));
    expect(mockRecordMetric).toHaveBeenCalledWith('replied', 'L2', 'v1', expect.any(Object));
  });

  it('marks BOUNCED leads', async () => {
    mockListByStatus.mockImplementation(async (filter: string) => {
      if (filter === 'FILTER_VAL_BOUNCED') {
        return [instantlyLead({ id: 'iid-3', dbId: 'L3' })];
      }
      return [];
    });

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockUpdateLead).toHaveBeenCalledWith('L3', expect.objectContaining({ status: 'BOUNCED' }));
    expect(mockRecordMetric).toHaveBeenCalledWith('bounced', 'L3', 'v1', expect.any(Object));
  });

  it('skips Instantly leads without lead_db_id custom var', async () => {
    mockListContactedSince.mockResolvedValue([{
      id: 'iid-x', email: 'x@y.com', status: 1,
      timestamp_last_contact: '2026-05-20T09:00:00Z',
      timestamp_last_reply: null, email_reply_count: 0,
      custom_variables: null,
    }]);

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockUpdateLead).not.toHaveBeenCalled();
  });

  it('uses watcher cursor as since for listLeadsContactedSince', async () => {
    const cursor = new Date('2026-05-19T00:00:00Z');
    mockGetCursor.mockResolvedValue(cursor);

    const { runWatcher } = await import('../../src/jobs/watcher.js');
    await runWatcher();

    expect(mockListContactedSince).toHaveBeenCalledWith(cursor);
  });
});
