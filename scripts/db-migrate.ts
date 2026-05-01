import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getClient } from '../src/services/supabase.js';

async function main() {
  const dir = 'sql';
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const sb = getClient();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    console.log('Applying', f);
    let error: { message: string } | null = null;
    try {
      const result = await sb.rpc('exec_sql', { sql });
      error = result.error;
    } catch (e) {
      error = { message: 'no exec_sql RPC' };
    }
    if (error) {
      console.error('\n[!] Cannot run via RPC. Use Supabase SQL editor manually for:', f);
      console.error('--- BEGIN SQL ---');
      console.error(sql);
      console.error('--- END SQL ---\n');
      process.exit(1);
    }
  }
  console.log('All migrations applied.');
}
main().catch(e => { console.error(e); process.exit(1); });
