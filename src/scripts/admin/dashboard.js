// src/scripts/admin/dashboard.js — gráfico de barras "Productos por categoría" del Dashboard (Chart.js)
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { $, DATA } from './ui.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

// "Parlantes para auto" -> "Parlantes" (el nombre completo se ve al pasar el mouse)
const short = (n) => n.replace(/\s+para\s+(auto|autos|carro)\b/i, '');
let chart = null;

window.renderCatChart = () => {
  const canvas = $('dash-cats'); if (!canvas) return;
  chart?.destroy(); chart = null;

  const rows = DATA.categories
    .map((c) => ({ name: c.name, n: DATA.products.filter((p) => p.category === c.slug).length }))
    .sort((a, b) => b.n - a.n);
  const tick = getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim() || '#64748b';

  // escribe el número encima de cada barra
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(c) {
      const { ctx } = c; ctx.save(); ctx.fillStyle = tick; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center';
      c.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(c.data.datasets[0].data[i], bar.x, bar.y - 6));
      ctx.restore();
    },
  };

  chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: rows.map((r) => short(r.name)), datasets: [{ data: rows.map((r) => r.n), backgroundColor: '#3b82f6', hoverBackgroundColor: '#60a5fa', borderRadius: 6, maxBarThickness: 42 }] },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 18 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => rows[it[0].dataIndex].name, label: (i) => (i.parsed.y === 1 ? ' 1 producto' : ` ${i.parsed.y} productos`) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: tick, autoSkip: false, minRotation: 45, maxRotation: 60, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.15)' }, ticks: { color: tick, precision: 0 } },
      },
    },
    plugins: [valueLabels],
  });
};