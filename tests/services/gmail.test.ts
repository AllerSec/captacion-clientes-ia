import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
const mockGetThread = vi.fn();
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} getAccessToken() { return Promise.resolve({ token: 'x' }); } } },
    gmail: () => ({
      users: {
        messages: { send: mockSend },
        threads: { get: mockGetThread },
      },
    }),
  },
}));
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({
    GMAIL_CLIENT_ID: 'c', GMAIL_CLIENT_SECRET: 's',
    GMAIL_REFRESH_TOKEN: 'r', GMAIL_USER_EMAIL: 'u@u.com',
    SENDER_NAME: 'Unax',
  }),
}));

describe('gmail service', () => {
  beforeEach(() => { mockSend.mockReset(); mockGetThread.mockReset(); });

  it('sendEmail returns message id and thread id', async () => {
    mockSend.mockResolvedValue({ data: { id: 'm1', threadId: 't1' } });
    const { sendEmail } = await import('../../src/services/gmail.js');
    const out = await sendEmail({
      to: 'a@b.com', subject: 'hi', htmlBody: '<p>hola</p>', textBody: 'hola',
    });
    expect(out.messageId).toBe('m1');
    expect(out.threadId).toBe('t1');
    expect(mockSend).toHaveBeenCalled();
  });

  it('getThreadMessages returns parsed messages', async () => {
    mockGetThread.mockResolvedValue({ data: { messages: [
      { id: 'm1', payload: { headers: [{ name: 'From', value: 'us@us.com' }] } },
      { id: 'm2', payload: { headers: [{ name: 'From', value: 'them@b.com' }],
        parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('hola').toString('base64') } }] } },
    ]}});
    const { getThreadMessages } = await import('../../src/services/gmail.js');
    const out = await getThreadMessages('t1');
    expect(out).toHaveLength(2);
  });
});
