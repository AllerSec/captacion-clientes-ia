import { loadEnv } from '../src/config/env.js';
import { getClient } from '../src/services/supabase.js';

async function main() {
  console.log('1) Env...');
  const env = loadEnv();
  console.log('   OK');

  console.log('2) Supabase ping...');
  const { error } = await getClient().from('leads').select('id', { count: 'exact', head: true });
  if (error) { console.error('   FAIL', error.message); process.exit(1); }
  console.log('   OK');

  console.log('3) Anthropic ping...');
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const c = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const r = await c.messages.create({
    model: env.ANTHROPIC_MODEL, max_tokens: 4,
    messages: [{ role: 'user', content: 'di ok' }],
  });
  const txt = r.content.find(b => b.type === 'text');
  console.log('   OK', txt && txt.type === 'text' ? txt.text.slice(0, 20) : '');

  console.log('4) Firecrawl ping...');
  const { scrapeForLeadAnalysis } = await import('../src/services/firecrawl.js');
  const fc = await scrapeForLeadAnalysis('https://example.com');
  if (!fc.ok) { console.error('   FAIL', fc.error); process.exit(1); }
  console.log(`   OK (${fc.statusCode}, ${fc.durationMs}ms)`);

  console.log('5) Gmail ping...');
  const { google } = await import('googleapis');
  const oauth = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth });
  await gmail.users.getProfile({ userId: 'me' });
  console.log('   OK');

  console.log('\nAll healthy.');
}
main().catch(e => { console.error(e); process.exit(1); });
