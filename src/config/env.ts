import { z } from 'zod';
import 'dotenv/config';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APIFY_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  GMAIL_CLIENT_ID: z.string().min(1),
  GMAIL_CLIENT_SECRET: z.string().min(1),
  GMAIL_REFRESH_TOKEN: z.string().min(1),
  GMAIL_USER_EMAIL: z.string().email(),
  SENDER_NAME: z.string().min(1),
  SENDER_WEBSITE: z.string().min(1),
  SENDER_CITY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['trace','debug','info','warn','error']).default('info'),
  DRY_RUN: z.string().default('false').transform(v => v === 'true'),
  TZ: z.string().default('Europe/Madrid'),
  DAILY_QUOTA_OVERRIDE: z.string().optional().transform(v => v ? parseInt(v) : undefined),
  SEND_MIN_INTERVAL_MIN: z.string().default('2').transform(v => parseInt(v)),
  SEND_MAX_INTERVAL_MIN: z.string().default('5').transform(v => parseInt(v)),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error('Invalid env: ' + JSON.stringify(parsed.error.format()));
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() { cached = null; }
