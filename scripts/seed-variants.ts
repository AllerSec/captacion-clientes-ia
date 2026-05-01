import { getClient } from '../src/services/supabase.js';

const VARIANTS = [
  {
    name: 'v1_directo',
    prompt_snippet: '',
    active: true,
    weight: 1,
  },
];

async function main() {
  const sb = getClient();
  for (const v of VARIANTS) {
    const { error } = await sb.from('variants').upsert(v, { onConflict: 'name' });
    if (error) { console.error('seed error', v.name, error.message); process.exit(1); }
    console.log('seeded variant', v.name);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
