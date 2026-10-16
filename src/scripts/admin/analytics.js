// src/scripts/admin/analytics.js — sección "Analítica": datos de Cloudflare Web Analytics + gráficos Chart.js
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import { $, DATA } from './ui.js';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const cssVar = (n, fb) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
const fmt = (n) => Number(n).toLocaleString('es-PE');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const dayLabel = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
const pct = (c, p) => (p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : null);
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
const EMPTY = '<div style="color:var(--text-3);font-size:13px">Aún no hay datos.</div>';
const CHANNELS = [['Google', /google\./], ['Instagram', /instagram/], ['TikTok', /tiktok/], ['Facebook', /facebook|fb\.com|fb\.me/], ['WhatsApp', /whatsapp|wa\.me/], ['YouTube', /youtube|youtu\.be/]];
const channelOf = (h) => (!h || h.includes('autoboutiqueolga.com') || h.includes('workers.dev') ? 'Directo o sin origen' : (CHANNELS.find(([, re]) => re.test(h))?.[0] || h));

let charts = [], main = null, mainRows = [], last = { at: 0, days: 0 };

const badge = (d) => (d === null ? '' : `<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:${d >= 0 ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'};color:${d >= 0 ? '#22c55e' : '#ef4444'}">${d >= 0 ? '↑' : '↓'} ${Math.abs(d)}%</span>`);
const kpi = (i, icon, color, label, value, d) => `<div class="kpi-card"><div class="kpi-top"><div class="kpi-icon" style="background:${color}22;font-size:16px">${icon}</div>${badge(d)}</div><div><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div><div style="height:36px;margin-top:8px"><canvas id="an-spark-${i}"></canvas></div></div>`;

const bars = (el, entries, total) => {
  el.innerHTML = entries.length ? entries.map(([name, n], i) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:600">${esc(name)}</span><span style="font-size:12px"><strong>${fmt(n)}</strong> <span style="color:var(--text-3)">${total ? Math.round((n / total) * 100) : 0}%</span></span></div><div class="progress-bar-wrap"><div class="progress-bar" style="width:${total ? (n / total) * 100 : 0}%;background:${COLORS[i % COLORS.length]}"></div></div></div>`).join('') : EMPTY;
};

function sparkline(i, data, color) {
  const c = $('an-spark-' + i); if (!c) return;
  charts.push(new Chart(c, { type: 'line', data: { labels: data.map((_, k) => k), datasets: [{ data, borderColor: color, borderWidth: 2, tension: 0.35, pointRadius: 0, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } } }));
}

function render(j) {
  charts.forEach((c) => c.destroy()); charts = [];
  const days = j.days, byDate = new Map(j.daily.map((d) => [d.date, d]));
  const range = (from, to) => { const out = []; for (let i = from; i >= to; i--) { const d = iso(Date.now() - i * 864e5); out.push({ date: d, visits: byDate.get(d)?.visits ?? 0, views: byDate.get(d)?.views ?? 0 }); } return out; };
  const cur = range(days - 1, 0), prev = range(2 * days - 1, days);

  // páginas -> productos y categorías
  const prod = new Map(), cat = new Map(), catOf = new Map(DATA.products.map((p) => [p.slug, p.category]));
  for (const r of j.paths) {
    let m = r.name.match(/^\/tienda\/([^/?#]+)\/?$/);
    if (m) { const s = safeDecode(m[1]); prod.set(s, (prod.get(s) || 0) + r.views); const c = catOf.get(s); if (c) cat.set(c, (cat.get(c) || 0) + r.views); continue; }
    m = r.name.match(/^\/categoria\/([^/?#]+)\/?$/);
    if (m) { const c = safeDecode(m[1]); cat.set(c, (cat.get(c) || 0) + r.views); }
  }
  const prodViews = [...prod.values()].reduce((a, b) => a + b, 0);

  // tarjetas con mini gráfico y % frente al periodo anterior
  const v = sum(cur, 'visits'), pv = sum(prev, 'visits'), w = sum(cur, 'views'), pw = sum(prev, 'views');
  const ppv = v ? w / v : 0, pppv = pv ? pw / pv : 0;
  $('an-kpis').innerHTML = kpi(0, '👥', COLORS[0], 'Visitas', fmt(v), pct(v, pv)) + kpi(1, '📄', COLORS[2], 'Páginas vistas', fmt(w), pct(w, pw))
    + kpi(2, '🔁', COLORS[1], 'Páginas por visita', ppv.toFixed(1), pct(ppv, pppv)) + kpi(3, '📦', COLORS[3], 'Fichas de producto vistas', fmt(prodViews), null);
  sparkline(0, cur.map((d) => d.visits), COLORS[0]); sparkline(1, cur.map((d) => d.views), COLORS[2]);
  sparkline(2, cur.map((d) => (d.visits ? d.views / d.visits : 0)), COLORS[1]);

  // gráfico principal (Visitas / Páginas vistas)
  const tick = cssVar('--text-3', '#64748b'), grid = 'rgba(148,163,184,.15)';
  mainRows = cur; $('an-range').textContent = `${dayLabel(cur[0].date)} – ${dayLabel(cur[cur.length - 1].date)}`;
  main = new Chart($('an-main'), { type: 'line', data: { labels: cur.map((d) => dayLabel(d.date)), datasets: [{ data: cur.map((d) => d.visits), borderColor: COLORS[0], backgroundColor: COLORS[0] + '22', fill: true, tension: 0.3, pointRadius: days > 14 ? 0 : 3, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: tick, maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: grid }, ticks: { color: tick, precision: 0 } } } } });
  charts.push(main); window.anTab('visits');

  // productos más vistos (con foto)
  const names = new Map(DATA.products.map((p) => [p.slug, p])), cname = (s) => DATA.categories.find((c) => c.slug === s)?.name || '';
  const topP = [...prod].sort((a, b) => b[1] - a[1]).slice(0, 5);
  $('an-products').innerHTML = topP.length ? topP.map(([s, n], i) => { const p = names.get(s);
    const thumb = p?.img ? `<img class="prod-thumb" src="${esc(p.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="prod-thumb">📦</div>';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light)"><span style="width:22px;font-size:11px;color:var(--text-3)">${String(i + 1).padStart(2, '0')}</span>${thumb}<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p?.name || s)}</div><div style="font-size:11px;color:var(--text-3)">${esc(cname(p?.category))}</div></div><div style="text-align:right"><strong style="font-size:13px">${fmt(n)}</strong><div style="font-size:11px;color:var(--text-3)">vistas</div></div></div>`; }).join('') : EMPTY;

  // categorías y canales
  const topC = [...cat].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s, n]) => [cname(s) || s, n]);
  bars($('an-categories'), topC, [...cat.values()].reduce((a, b) => a + b, 0));
  const ch = new Map(); for (const r of j.referers) { const k = channelOf(r.name); ch.set(k, (ch.get(k) || 0) + r.visits); }
  bars($('an-channels'), [...ch].sort((a, b) => b[1] - a[1]).slice(0, 8), [...ch.values()].reduce((a, b) => a + b, 0));
}

window.anTab = (kind) => {
  if (!main) return;
  main.data.datasets[0].data = mainRows.map((d) => d[kind]); main.update();
  $('an-tab-visits').className = 'btn btn-sm ' + (kind === 'visits' ? 'btn-primary' : 'btn-secondary');
  $('an-tab-views').className = 'btn btn-sm ' + (kind === 'views' ? 'btn-primary' : 'btn-secondary');
};

window.loadAnalytics = async (force) => {
  const days = Number($('an-days').value) || 7;
  if (force !== true && last.days === days && Date.now() - last.at < 60000) return;
  $('an-status').textContent = 'Cargando…';
  const token = await window.getAccessToken();
  const res = await fetch('/api/analytics', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ days }) }).catch(() => null);
  if (!res) { $('an-status').textContent = 'Sin conexión.'; return; }
  if (res.status === 404) { $('an-status').textContent = 'Las estadísticas solo funcionan en el sitio ya publicado, no en local.'; return; }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { $('an-status').textContent = j.error || `No se pudo cargar (código ${res.status})`; return; }
  last = { at: Date.now(), days }; $('an-status').textContent = '';
  render(j);
};