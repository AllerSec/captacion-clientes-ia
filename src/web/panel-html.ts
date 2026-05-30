/**
 * HTML del panel de estado. Una sola página, sin framework ni build.
 * Diseño: design system de ui-ux-pro-max → "Real-Time / Operations", Dark Mode OLED.
 * Hace fetch a /panel/data cada 30s y repinta. Sin scroll, responsive a 1 columna.
 */
export const PANEL_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Captación IA · Estado</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;600&family=Fira+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg: #0F172A; --surface: #1E293B; --muted: #272F42; --border: #475569;
    --fg: #F8FAFC; --fg-dim: #94A3B8;
    --green: #22C55E; --amber: #F59E0B; --red: #EF4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: 'Fira Sans', system-ui, sans-serif;
    min-height: 100dvh; display: flex; flex-direction: column;
    padding: clamp(16px, 3vw, 32px); gap: clamp(16px, 2.5vw, 28px);
  }
  .mono { font-family: 'Fira Code', monospace; font-variant-numeric: tabular-nums; }

  header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand h1 { font-size: clamp(18px, 2.2vw, 26px); font-weight: 600; letter-spacing: .5px; }
  .brand p { color: var(--fg-dim); font-size: 13px; }
  .global {
    display: flex; align-items: center; gap: 12px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 12px 20px;
  }
  .global .label { font-weight: 600; font-size: clamp(15px, 1.8vw, 19px); }
  .updated { color: var(--fg-dim); font-size: 12px; }

  .dot {
    width: 14px; height: 14px; border-radius: 50%; flex: 0 0 auto;
    transition: background .3s ease;
  }
  .dot.green { background: var(--green); box-shadow: 0 0 10px var(--green); }
  .dot.amber { background: var(--amber); box-shadow: 0 0 10px var(--amber); }
  .dot.red   { background: var(--red);   box-shadow: 0 0 10px var(--red); }
  .dot.big { width: 20px; height: 20px; }

  .grid {
    flex: 1; display: grid; gap: clamp(14px, 2vw, 22px);
    grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr);
  }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 18px; padding: clamp(18px, 2.2vw, 28px);
    display: flex; flex-direction: column; gap: 14px;
  }
  .card-head { display: flex; align-items: center; gap: 12px; }
  .card-head svg { width: 22px; height: 22px; color: var(--fg-dim); flex: 0 0 auto; }
  .card-head h2 { font-size: clamp(15px, 1.7vw, 19px); font-weight: 600; flex: 1; }
  .lines { display: flex; flex-direction: column; gap: 8px; }
  .lines .row { color: var(--fg); font-size: clamp(14px, 1.5vw, 16px); }
  .lines .row.dim { color: var(--fg-dim); font-size: 13px; }
  .lines .strong { font-weight: 600; }

  footer { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; }
  footer a {
    color: var(--fg-dim); text-decoration: none; font-size: 13px;
    border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px;
    transition: color .2s ease, border-color .2s ease; cursor: pointer;
  }
  footer a:hover { color: var(--fg); border-color: var(--fg-dim); }
  footer a:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }

  @media (max-width: 760px) {
    .grid { grid-template-columns: 1fr; grid-template-rows: none; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
  <header>
    <div class="brand">
      <span id="g-dot" class="dot big green"></span>
      <div>
        <h1>Captación IA · Estado</h1>
        <p id="g-label">cargando…</p>
      </div>
    </div>
    <div class="global">
      <span class="label">Resumen</span>
      <span class="updated" id="updated">—</span>
    </div>
  </header>

  <main class="grid" id="grid">
    <!-- tarjetas inyectadas por JS -->
  </main>

  <footer>
    <a href="https://app.instantly.ai" target="_blank" rel="noopener">Instantly ↗</a>
    <a href="https://console.apify.com/billing" target="_blank" rel="noopener">Apify (créditos) ↗</a>
    <a href="https://serper.dev/dashboard" target="_blank" rel="noopener">Serper (créditos) ↗</a>
    <a href="https://railway.app" target="_blank" rel="noopener">Railway ↗</a>
  </footer>

<script>
const ICONS = {
  envios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
  creditos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2 2 0 0 1 0 4H9"/></svg>',
  sistema: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/></svg>',
  respuestas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};
const LABEL = { green: 'TODO OK', amber: 'ATENCIÓN', red: 'PROBLEMA' };
const ORDER = ['envios','creditos','sistema','respuestas'];

function light(v){ return (v === 'green' || v === 'amber' || v === 'red') ? v : 'red'; }
function card(key, b) {
  const lines = b.lines.map((l, idx) =>
    '<div class="row ' + (idx === 0 ? 'strong' : (idx > 1 ? 'dim' : '')) + '">' + escape(l) + '</div>'
  ).join('');
  return '<section class="card">'
    + '<div class="card-head">' + (ICONS[key] || '')
    + '<h2>' + escape(b.title) + '</h2>'
    + '<span class="dot ' + light(b.light) + '"></span></div>'
    + '<div class="lines">' + lines + '</div></section>';
}
function escape(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

// Lee el token de la URL UNA vez (para abrir desde favorito), lo guarda en memoria
// y lo borra de la barra de direcciones para que no quede en el historial.
const PANEL_KEY = (function () {
  const k = new URLSearchParams(location.search).get('key');
  if (k) history.replaceState(null, '', location.pathname);
  return k;
})();

async function refresh() {
  try {
    // El token va por header Authorization (no en la URL → fuera de los logs).
    const headers = PANEL_KEY ? { 'Authorization': 'Bearer ' + PANEL_KEY } : {};
    const r = await fetch('/panel/data', { headers, cache: 'no-store' });
    const d = await r.json();
    if (d.ok === false) throw new Error(d.error || 'sin datos');
    const g = light(d.global);
    document.getElementById('g-dot').className = 'dot big ' + g;
    document.getElementById('g-label').textContent = LABEL[g] || '—';
    const now = new Date(d.updatedAt);
    document.getElementById('updated').textContent =
      'actualizado ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('grid').innerHTML =
      ORDER.map(k => card(k, d[k])).join('');
  } catch (e) {
    document.getElementById('g-dot').className = 'dot big red';
    document.getElementById('g-label').textContent = 'No se pudo leer el estado';
  }
}
refresh();
setInterval(refresh, 30000);
</script>
</body>
</html>`;
