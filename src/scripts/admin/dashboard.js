// src/scripts/admin/dashboard.js — Dashboard: gráfico de barras con las visitas a la tienda (Cloudflare Web Analytics + Chart.js)
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { $ } from './ui.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const fmt = (n) => Number(n).toLocaleString('es-PE');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const dayLabel = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
let chart = null, cache = { at: 0, days: 0, data: null };

function draw(j) {
  chart?.destroy(); chart = null;
  const byDate = new Map(j.daily.map((d) => [d.date, d]));
  const rows = [];
  for (let i = j.days - 1; i >= 0; i--) { const d = iso(Date.now() - i * 864e5); rows.push({ date: d, visits: byDate.get(d)?.visits ?? 0, views: byDate.get(d)?.views ?? 0 }); }
  $('dash-status').textContent = `Total: ${fmt(rows.reduce((s, r) => s + r.visits, 0))} visitas en los últimos ${j.days} días`;

  const tick = getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim() || '#64748b';
  const valueLabels = { // número encima de cada barra (solo con pocos días, para que no se amontone)
    id: 'valueLabels',
    afterDatasetsDraw(c) {
      if (j.days > 14) return;
      const { ctx } = c; ctx.save(); ctx.fillStyle = tick; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center';
      c.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(c.data.datasets[0].data[i], bar.x, bar.y - 6));
      ctx.restore();
    },
  };
  chart = new Chart($('dash-traffic'), {
    type: 'bar',
    data: { labels: rows.map((r) => dayLabel(r.date)), datasets: [{ data: rows.map((r) => r.visits), backgroundColor: '#3b82f6', hoverBackgroundColor: '#60a5fa', borderRadius: 6, maxBarThickness: 48 }] },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 18 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => ` ${fmt(i.parsed.y)} visitas`, afterLabel: (i) => ` ${fmt(rows[i.dataIndex].views)} páginas vistas` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: tick, maxTicksLimit: 10, maxRotation: 0 } },
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.15)' }, ticks: { color: tick, precision: 0 } },
      },
    },
    plugins: [valueLabels],
  });
}

window.renderDashChart = async (force) => {
  if (!$('dash-traffic')) return;
  const days = Number($('dash-days').value) || 7;
  if (force !== true && cache.data && cache.days === days && Date.now() - cache.at < 60000) return draw(cache.data);
  const token = await window.getAccessToken?.();
  if (!token) return; // todavía sin sesión
  $('dash-status').textContent = 'Cargando…';
  const res = await fetch('/api/analytics', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ days }) }).catch(() => null);
  const fail = (m) => { chart?.destroy(); chart = null; $('dash-status').textContent = m; };
  if (!res) return fail('Sin conexión.');
  if (res.status === 404) return fail('Las estadísticas solo funcionan en el sitio ya publicado, no en local.');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return fail(j.error || `No se pudo cargar (código ${res.status})`);
  cache = { at: Date.now(), days, data: j };
  draw(j);
};
// ui.js ya llama a este nombre al abrir el Dashboard (antes dibujaba productos por categoría)
window.renderCatChart = window.renderDashChart;