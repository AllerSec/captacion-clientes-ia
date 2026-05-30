/**
 * Centro de Mando (panel v3). Una página, sin framework ni build.
 * Diseño ui-ux-pro-max → Dark Mode OLED. Tres zonas:
 *  1) Estado en vivo  2) Créditos centralizados (botón por servicio)
 *  3) Acciones del sistema (forzar scrape protegido + enlaces).
 * Autorefresco 30s. Token por header Authorization (lee ?key= una vez).
 */
export const PANEL_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Captación IA · Centro de Mando</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600&family=Fira+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg:#0F172A; --surface:#1E293B; --muted:#272F42; --border:#334155;
    --fg:#F8FAFC; --fg-dim:#94A3B8;
    --green:#22C55E; --amber:#F59E0B; --red:#EF4444; --blue:#38BDF8;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body {
    background:var(--bg); color:var(--fg);
    font-family:'Fira Sans',system-ui,sans-serif;
    min-height:100dvh; padding:clamp(14px,2.5vw,26px); gap:20px;
    display:flex; flex-direction:column;
  }
  .mono { font-family:'Fira Code',monospace; font-variant-numeric:tabular-nums; }

  header { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
  .brand { display:flex; align-items:center; gap:13px; }
  .brand h1 { font-size:clamp(17px,2vw,23px); font-weight:600; letter-spacing:.4px; }
  .brand p { color:var(--fg-dim); font-size:13px; }
  .updated { color:var(--fg-dim); font-size:12px; }

  .zone-title { font-size:12px; font-weight:600; color:var(--fg-dim); text-transform:uppercase; letter-spacing:1px; margin-bottom:-6px; }

  .dot { width:13px; height:13px; border-radius:50%; flex:0 0 auto; transition:background .3s; }
  .dot.green { background:var(--green); box-shadow:0 0 10px var(--green); }
  .dot.amber { background:var(--amber); box-shadow:0 0 10px var(--amber); }
  .dot.red   { background:var(--red);   box-shadow:0 0 10px var(--red); }
  .dot.big { width:19px; height:19px; }

  .grid { display:grid; gap:clamp(12px,1.6vw,18px); grid-template-columns:repeat(4,1fr); }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:clamp(15px,1.8vw,22px); display:flex; flex-direction:column; gap:11px; }
  .card.wide { grid-column:span 2; }
  .card-head { display:flex; align-items:center; gap:10px; }
  .card-head svg { width:19px; height:19px; color:var(--fg-dim); flex:0 0 auto; }
  .card-head h2 { font-size:14px; font-weight:600; flex:1; }
  .lines { display:flex; flex-direction:column; gap:6px; }
  .lines .row { font-size:14px; }
  .lines .row.dim { color:var(--fg-dim); font-size:12px; }
  .lines .strong { font-weight:600; font-size:15px; }

  .bar { height:8px; background:var(--muted); border-radius:99px; overflow:hidden; margin-top:2px; }
  .bar > span { display:block; height:100%; background:var(--green); border-radius:99px; transition:width .4s; }
  .bar.warn > span { background:var(--amber); }
  .bar.danger > span { background:var(--red); }

  .chart { display:flex; align-items:flex-end; gap:6px; height:90px; padding-top:6px; }
  .chart .col { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:flex-end; }
  .chart .bar2 { width:100%; background:var(--blue); border-radius:4px 4px 0 0; min-height:3px; transition:height .4s; }
  .chart .lbl { font-size:10px; color:var(--fg-dim); }
  .chart .val { font-size:10px; color:var(--fg); }

  .funnel { display:flex; flex-direction:column; gap:6px; }
  .funnel .step { display:flex; align-items:center; gap:8px; }
  .funnel .fbar { height:22px; background:linear-gradient(90deg,var(--blue),#0EA5E9); border-radius:5px; min-width:28px; display:flex; align-items:center; padding:0 8px; font-size:12px; font-weight:600; color:#04121f; transition:width .4s; }
  .funnel .fname { font-size:12px; color:var(--fg-dim); width:92px; flex:0 0 auto; }

  /* botones */
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; border-radius:10px; padding:10px 14px; font-size:13px; font-weight:500; cursor:pointer; text-decoration:none; border:1px solid var(--border); transition:background .2s,border-color .2s,transform .1s; font-family:inherit; }
  .btn:hover { transform:translateY(-1px); }
  .btn:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
  .btn.link { background:var(--muted); color:var(--fg); }
  .btn.link:hover { background:#334155; }
  .btn.action { background:#7C2D12; color:#FED7AA; border-color:#9A3412; width:100%; }
  .btn.action:hover { background:#9A3412; }
  .btn.go { background:var(--blue); color:#04121f; border:none; }

  .credits { display:grid; gap:clamp(12px,1.6vw,18px); grid-template-columns:repeat(5,1fr); }
  .ccard { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:9px; }
  .ccard .name { font-weight:600; font-size:14px; }
  .ccard .val { font-size:13px; color:var(--fg-dim); min-height:18px; }
  .ccard .big { font-size:18px; font-weight:600; color:var(--fg); }

  .cmd { background:#0B1120; border:1px solid var(--border); border-radius:10px; padding:11px; font-family:'Fira Code',monospace; font-size:12px; color:var(--green); word-break:break-all; line-height:1.5; }

  footer { color:var(--fg-dim); font-size:11px; text-align:center; margin-top:6px; }

  @media (max-width:1100px){ .grid{grid-template-columns:repeat(2,1fr);} .card.wide{grid-column:span 2;} .credits{grid-template-columns:repeat(3,1fr);} }
  @media (max-width:640px){ .grid{grid-template-columns:1fr;} .card.wide{grid-column:span 1;} .credits{grid-template-columns:1fr 1fr;} }
  @media (prefers-reduced-motion:reduce){ *{transition:none !important;} }
</style>
</head>
<body>
  <header>
    <div class="brand">
      <span id="g-dot" class="dot big green"></span>
      <div><h1>Captación IA · Centro de Mando</h1><p id="g-label">cargando…</p></div>
    </div>
    <span class="updated" id="updated">—</span>
  </header>

  <div class="zone-title">Estado en vivo</div>
  <main class="grid" id="grid"></main>

  <div class="zone-title">Créditos &amp; servicios</div>
  <section class="credits" id="credits"></section>

  <div class="zone-title">Acciones</div>
  <section class="grid" id="actions"></section>

  <footer id="foot">—</footer>

<script>
const PANEL_KEY = (function(){ const k=new URLSearchParams(location.search).get('key'); if(k) history.replaceState(null,'',location.pathname); return k; })();
const LABEL = { green:'TODO OK', amber:'ATENCIÓN', red:'PROBLEMA' };
function light(v){ return (v==='green'||v==='amber'||v==='red')?v:'red'; }
function esc(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

const ICONS = {
  envios:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
  proximo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  grafica:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></svg>',
  embudo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>',
  instantly:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>',
  sistema:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/></svg>',
  respuestas:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};

function head(key,title,lightVal){ return '<div class="card-head">'+(ICONS[key]||'')+'<h2>'+esc(title)+'</h2><span class="dot '+light(lightVal)+'"></span></div>'; }
function lineRows(lines){ return '<div class="lines">'+lines.map((l,i)=>'<div class="row '+(i===0?'strong':(i>1?'dim':''))+'">'+esc(l)+'</div>').join('')+'</div>'; }

function renderState(d){
  const c=[];
  c.push('<section class="card">'+head('envios',d.envios.title,d.envios.light)+lineRows(d.envios.lines)+'</section>');
  c.push('<section class="card">'+head('proximo',d.proximo.title,d.proximo.light)+lineRows(d.proximo.lines)+'</section>');
  c.push('<section class="card">'+head('instantly',d.instantly.title,d.instantly.light)+lineRows(d.instantly.lines)+'</section>');
  c.push('<section class="card">'+head('respuestas',d.respuestas.title,d.respuestas.light)+lineRows(d.respuestas.lines)+'</section>');
  const bars=d.grafica.bars, max=Math.max(1,...bars.map(b=>b.count));
  const chart='<div class="chart">'+bars.map(b=>{const h=Math.round((b.count/max)*100);const dd=new Date(b.day+'T00:00:00').toLocaleDateString('es-ES',{weekday:'short'}).slice(0,2);return '<div class="col"><span class="val">'+b.count+'</span><div class="bar2" style="height:'+h+'%"></div><span class="lbl">'+esc(dd)+'</span></div>';}).join('')+'</div>';
  c.push('<section class="card wide">'+head('grafica',d.grafica.title,d.grafica.light)+lineRows(d.grafica.lines)+chart+'</section>');
  const f=d.embudo.funnel, fmax=Math.max(1,f.scraped);
  const steps=[['Scrapeados',f.scraped],['Con email',f.withEmail],['En cola',f.queued],['Contactados',f.contacted],['Respondidos',f.responded]];
  const funnel='<div class="funnel">'+steps.map(([n,v])=>{const w=Math.max(6,Math.round((v/fmax)*100));return '<div class="step"><span class="fname">'+esc(n)+'</span><div class="fbar" style="width:'+w+'%">'+v+'</div></div>';}).join('')+'</div>';
  c.push('<section class="card wide">'+head('embudo',d.embudo.title,d.embudo.light)+funnel+'</section>');
  c.push('<section class="card">'+head('sistema',d.sistema.title,d.sistema.light)+lineRows(d.sistema.lines)+'</section>');
  document.getElementById('grid').innerHTML=c.join('');
}

function renderCredits(d){
  const cr=d.creditos;
  const cards=[];
  // Apify (en vivo)
  let apifyBar='';
  if(cr.apifyPct!=null){ const p=cr.apifyPct, cls=p>=90?'danger':(p>=70?'warn':''); apifyBar='<div class="bar '+cls+'"><span style="width:'+Math.min(100,p)+'%"></span></div>'; }
  const apifyVal = cr.apify ? ('$'+cr.apify.usedUsd.toFixed(2)+' / $'+cr.apify.limitUsd) : 'n/d';
  cards.push(ccard('Apify', apifyVal, cr.apify?(cr.apifyPct+'% usado'):'API no disponible', apifyBar, 'https://console.apify.com/billing','Ver créditos'));
  // Serper (sin API de saldo)
  cards.push(ccard('Serper', '2.500 gratis', 'saldo en su panel', '', 'https://serper.dev/dashboard','Ver créditos'));
  // Instantly
  const inst = d.instantly.light==='green' ? d.instantly.lines[0] : 'API no disponible';
  cards.push(ccard('Instantly', inst, 'campaña', '', 'https://app.instantly.ai','Abrir'));
  // Railway
  cards.push(ccard('Railway', 'en su panel', d.sistema.lines.find(l=>l.includes('Deploy'))||'', '', 'https://railway.app','Ver uso'));
  // Supabase
  cards.push(ccard('Supabase', (cr.dbRows||0)+' filas', 'base de datos', '', 'https://supabase.com/dashboard','Abrir'));
  document.getElementById('credits').innerHTML=cards.join('');
}

function ccard(name, big, sub, extra, href, btn){
  return '<div class="ccard"><div class="name">'+esc(name)+'</div>'
    +'<div class="big">'+esc(big)+'</div>'
    +'<div class="val">'+esc(sub)+'</div>'+extra
    +'<a class="btn go" href="'+href+'" target="_blank" rel="noopener">'+esc(btn)+' ↗</a></div>';
}

function renderActions(){
  const cmd='cd D:\\\\Downloads\\\\Zona-Trabajo\\\\Captacion-Clientes-IA; claude --dangerously-skip-permissions';
  const a=[];
  a.push('<section class="card"><div class="card-head"><h2>Forzar scrape ahora</h2></div>'
    +'<div class="lines"><div class="row dim">Lanza una búsqueda de leads inmediata (gasta créditos de Apify).</div></div>'
    +'<button class="btn action" onclick="forceScrape(this)">Forzar scrape</button>'
    +'<div class="row dim" id="scrape-msg"></div></section>');
  a.push('<section class="card"><div class="card-head"><h2>Ver en Supabase</h2></div>'
    +'<a class="btn link" href="https://supabase.com/dashboard/project/wtwonijrnzjaknlysenl/editor" target="_blank" rel="noopener">Leads en cola / enviados ↗</a></section>');
  a.push('<section class="card"><div class="card-head"><h2>Respuestas (Unibox)</h2></div>'
    +'<a class="btn link" href="https://app.instantly.ai/app/unibox" target="_blank" rel="noopener">Abrir Unibox ↗</a></section>');
  a.push('<section class="card"><div class="card-head"><h2>Lanzar Claude</h2></div>'
    +'<div class="cmd" id="cmdtext">'+esc(cmd)+'</div>'
    +'<button class="btn link" onclick="copyCmd(this)">Copiar comando</button></section>');
  document.getElementById('actions').innerHTML=a.join('');
}

function copyCmd(btn){ const t=document.getElementById('cmdtext').textContent; navigator.clipboard.writeText(t).then(()=>{const o=btn.textContent;btn.textContent='¡Copiado!';setTimeout(()=>btn.textContent=o,1500);}); }

async function forceScrape(btn){
  if(!confirm('¿Lanzar un scrape ahora? Gastará créditos de Apify.')) return;
  const msg=document.getElementById('scrape-msg');
  btn.disabled=true; msg.textContent='Lanzando…';
  try{
    const headers={'Content-Type':'application/json'};
    if(PANEL_KEY) headers['Authorization']='Bearer '+PANEL_KEY;
    const r=await fetch('/panel/action/scrape',{method:'POST',headers});
    const d=await r.json();
    if(d.ok){ msg.textContent='✓ Scrape iniciado. Míralo en Railway logs.'; }
    else if(d.error==='scrape_already_running'){ msg.textContent='Ya hay un scrape en marcha.'; }
    else if(d.error==='unauthorized'){ msg.textContent='No autorizado (falta token).'; }
    else { msg.textContent='Error: '+d.error; }
  }catch(e){ msg.textContent='Error de red.'; }
  setTimeout(()=>{ btn.disabled=false; },3000);
}

async function refresh(){
  try{
    const headers=PANEL_KEY?{'Authorization':'Bearer '+PANEL_KEY}:{};
    const r=await fetch('/panel/data',{headers,cache:'no-store'});
    const d=await r.json();
    if(d.ok===false) throw new Error(d.error||'sin datos');
    const g=light(d.global);
    document.getElementById('g-dot').className='dot big '+g;
    document.getElementById('g-label').textContent=LABEL[g]||'—';
    document.getElementById('updated').textContent='actualizado '+new Date(d.updatedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    renderState(d); renderCredits(d);
    document.getElementById('foot').textContent='Apify '+(d.creditos.apify?('$'+d.creditos.apify.usedUsd.toFixed(2)+'/$'+d.creditos.apify.limitUsd):'n/d')+' · '+(d.creditos.dbRows||0)+' leads en DB';
  }catch(e){
    document.getElementById('g-dot').className='dot big red';
    document.getElementById('g-label').textContent='No se pudo leer el estado';
  }
}
renderActions();
refresh();
setInterval(refresh,30000);
</script>
</body>
</html>`;
