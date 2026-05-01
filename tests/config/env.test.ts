import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetEnvCache } from '../../src/config/env.js';

describe('loadEnv', () => {
  const original = { ...process.env };
  beforeEach(() => { resetEnvCache(); });
  afterEach(() => { process.env = { ...original }; resetEnvCache(); });

  it('loads valid env', async () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    process.env.APIFY_TOKEN = 't';
    process.env.ANTHROPIC_API_KEY = 'a';
    process.env.GMAIL_CLIENT_ID = 'c';
    process.env.GMAIL_CLIENT_SECRET = 's';
    process.env.GMAIL_REFRESH_TOKEN = 'r';
    process.env.GMAIL_USER_EMAIL = 'u@u.com';
    process.env.SENDER_NAME = 'Unax';
    process.env.SENDER_WEBSITE = 'unaxaller.com';
    process.env.SENDER_CITY = 'Irún';

    const { loadEnv } = await import('../../src/config/env.js');
    const env = loadEnv();
    expect(env.GMAIL_USER_EMAIL).toBe('u@u.com');
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(env.DRY_RUN).toBe(false);
  });

  it('throws on missing required var', async () => {
    delete process.env.SUPABASE_URL;
    const { loadEnv } = await import('../../src/config/env.js');
    expect(() => loadEnv()).toThrow();
  });
});
