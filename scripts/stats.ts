import { getClient } from '../src/services/supabase.js';

async function main() {
  const sb = getClient();
  const { data: variants } = await sb.from('variants').select('*');
  console.log('=== Variants ===');
  for (const v of variants ?? []) {
    const rate = v.sent_count > 0 ? ((v.reply_count / v.sent_count) * 100).toFixed(1) : '0.0';
    console.log(`  ${v.name}: ${v.sent_count} sent, ${v.reply_count} replies (${rate}%)`);
  }

  const { data: byStatus } = await sb.from('leads').select('status').limit(10000);
  const counts: Record<string, number> = {};
  for (const r of byStatus ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log('\n=== Lead status counts ===');
  for (const [s, n] of Object.entries(counts).sort()) console.log(`  ${s}: ${n}`);

  const since = new Date(); since.setDate(since.getDate() - 7);
  const { count: weekSent } = await sb.from('emails_sent')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', since.toISOString());
  console.log(`\nEmails sent last 7 days: ${weekSent}`);
}
main().catch(e => { console.error(e); process.exit(1); });
