import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendEmail = vi.fn();
const mockShouldFire = vi.fn();
vi.mock('../../src/services/gmail.js', () => ({ sendEmail: mockSendEmail }));
vi.mock('../../src/services/supabase.js', () => ({ shouldFireAlert: mockShouldFire }));
vi.mock('../../src/config/env.js', () => ({ loadEnv: () => ({ GMAIL_USER_EMAIL: 'u@u.com' }) }));
vi.mock('../../src/lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

describe('notifyError', () => {
  beforeEach(() => { mockSendEmail.mockReset(); mockShouldFire.mockReset(); });

  it('sends email when allowed by dedup', async () => {
    mockShouldFire.mockResolvedValue(true);
    mockSendEmail.mockResolvedValue({ messageId: 'm', threadId: 't' });
    const { notifyError } = await import('../../src/core/health-monitor.js');
    await notifyError('error', 'Apify down', 'No credits');
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'u@u.com',
      subject: expect.stringContaining('[CAPTACION-IA]'),
    }));
  });

  it('suppresses duplicate within cooldown', async () => {
    mockShouldFire.mockResolvedValue(false);
    const { notifyError } = await import('../../src/core/health-monitor.js');
    await notifyError('error', 'Apify down', 'No credits');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
