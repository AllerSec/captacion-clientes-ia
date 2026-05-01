import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { getClient } from '../src/services/supabase.js';

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const name = (await rl.question('Variant name (e.g. v2_pregunta): ')).trim();
  const snippet = (await rl.question('Extra system snippet (single line): ')).trim();
  const weightStr = (await rl.question('Weight (default 1): ')).trim() || '1';
  rl.close();

  const sb = getClient();
  const { error } = await sb.from('variants').insert({
    name, prompt_snippet: snippet, weight: parseInt(weightStr), active: true,
  });
  if (error) { console.error(error.message); process.exit(1); }
  console.log('Created variant', name);
}
main().catch(e => { console.error(e); process.exit(1); });
