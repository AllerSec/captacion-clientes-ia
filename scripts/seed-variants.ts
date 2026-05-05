import { ensureVariantsSeeded, VARIANT_DEFINITIONS } from '../src/config/variants.js';

async function main() {
  await ensureVariantsSeeded();
  for (const v of VARIANT_DEFINITIONS) console.log('seeded variant', v.name);
}

main().catch(e => { console.error(e); process.exit(1); });
