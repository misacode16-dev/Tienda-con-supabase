// src/scripts/admin/ui.js — interfaz del panel: navegación, avisos, ventanas, tema, búsqueda.
// Los botones del HTML usan onclick="nombre()", por eso las funciones se publican en window.
export const DATA = { categories: [], products: [] };
const catName = slug => (DATA.categories.find(c=>c.slug===slug)||{}).name || slug;
export const countIn = c => DATA.products.filter(p=>p.category===c.slug).length;
const badge = st => `<span class="badge ${st==='En stock'?'badge-success':'badge-danger'}">${st}</span>`;
export const actionBtns = h => `<div class="action-btns">${h}</div>`;
export const $ = id => document.getElementById(id);

// ===== NAVEGACIÓN =====
export let currentPage='dashboard';
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
  const el=$('page-'+page); if(el) el.classList.add('active');
  const b=btn||document.querySelector(`[data-page="${page}"]`); if(b) b.classList.add('active');
  currentPage=page;
  const labels={dashboard:'Dashboard',products:'Productos',categories:'Categorías',analytics:'Analítica',settings:'Configuración'};
  $('breadcrumb').innerHTML=`Inicio / <strong>${labels[page]||page}</strong>`;
  closeSidebar(); renderPage(page);
}
export function renderPage(page){
  if(page==='dashboard'){renderKPIs();renderCatBars();renderOutOfStock();}
  if(page==='products') applyProductFilters();
  if(page==='categories') window.renderCategories?.();
  if(page==='analytics') window.loadAnalytics?.();
}

// ===== DASHBOARD =====
function renderKPIs(){
  const out=DATA.products.filter(p=>!p.stock).length;
  const k=[
    {l:'Productos',v:DATA.products.length,i:'📦',bg:'var(--primary-light)'},
    {l:'Disponibles',v:DATA.products.length-out,i:'✅',bg:'var(--success-light)'},
    {l:'Agotados',v:out,i:'⚠️',bg:'var(--warning-light)'},
    {l:'Categorías',v:DATA.categories.length,i:'🗂',bg:'var(--info-light)'},
  ];
  $('kpi-grid').innerHTML=k.map(x=>`<div class="kpi-card"><div class="kpi-top"><div class="kpi-icon" style="background:${x.bg};font-size:16px">${x.i}</div></div><div><div class="kpi-value">${x.v}</div><div class="kpi-label">${x.l}</div></div></div>`).join('');
}
function renderCatBars(){
  const max=Math.max(1,...DATA.categories.map(countIn));
  $('cat-bars').innerHTML=DATA.categories.map(c=>`<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:600">${c.name}</span><strong style="font-size:12px">${countIn(c)}</strong></div><div class="progress-bar-wrap"><div class="progress-bar" style="width:${countIn(c)/max*100}%;background:var(--primary)"></div></div></div>`).join('');
}
function renderOutOfStock(){
  const l=DATA.products.filter(p=>!p.stock);
  $('oos-list').innerHTML=l.length?l.map(p=>`<div style="padding:10px 0;border-bottom:1px solid var(--border-light)"><div class="fw-600" style="font-size:13px">${p.name}</div><div style="font-size:11px;color:var(--text-3)">${p.sku||p.slug}</div></div>`).join(''):'<div style="color:var(--text-3);font-size:13px">No hay productos agotados 🎉</div>';
}

// ===== PRODUCTOS =====
export function fillCategorySelects(){
  const opts=DATA.categories.map(c=>`<option value="${c.slug}">${c.name}</option>`).join('');
  $('prod-cat').innerHTML='<option value="">Todas las categorías</option>'+DATA.categories.map(c=>`<option value="${c.slug}">${c.name}</option>`).join('');
  $('pm-cat').innerHTML=opts;
}
function applyProductFilters(){
  const q=$('prod-search').value.toLowerCase(), cat=$('prod-cat').value, st=$('prod-stock').value;
  const list=DATA.products.filter(p=>
    (!q||(p.name+' '+p.sku+' '+(p.seoTitle||'')).toLowerCase().includes(q)) &&
    (!cat||p.category===cat) &&
    (st===''||String(+p.stock)===st));
  renderProducts(list);
}
function renderProducts(list){
  $('products-body').innerHTML=list.map(p=>`<tr>
    <td><div class="product-cell">${p.img ? `<img class="prod-thumb" src="${p.img.replace(/"/g,'&quot;')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="prod-thumb">📦</div>'}<div><div class="fw-600">${p.name}</div>${p.seoTitle?`<div style="font-size:11px;color:var(--text-3)">SEO: ${p.seoTitle}</div>`:'<div style="font-size:11px;color:var(--warning)">Sin título SEO</div>'}</div></div></td>
    <td class="td-mono">${p.sku||'—'}</td>
    <td style="color:var(--text-2)">${catName(p.category)}</td>
    <td class="fw-600">S/ ${p.price}${p.oldPrice?` <s style="color:var(--text-3);font-weight:400">S/ ${p.oldPrice}</s>`:''}</td>
    <td style="color:var(--text-2)">${p.variants||'—'}</td>
    <td style="color:var(--text-2);font-size:12px">${{popular:'Populares',best:'Lo más vendido'}[p.home]||'—'}</td>
    <td>${badge(p.stock?'En stock':'Agotado')}</td>
    <td>${actionBtns(`<button class="btn btn-secondary btn-sm" onclick="openProductModal('${p.slug}')">Editar</button><button class="btn btn-danger btn-sm" onclick="confirmDelete('${p.slug}')">Eliminar</button>`)}</td>
  </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-3)">Sin resultados</td></tr>';
  $('prod-count').textContent=`Mostrando ${list.length} de ${DATA.products.length} productos`;
}
export function seoCount(){
  const n=$('pm-seo').value.length+20; // + " | Autoboutique Olga"
  $('seo-count').textContent=n>20?`(${n}/60 con la marca)`:''; $('seo-count').style.color=n>60?'var(--danger)':'var(--text-3)';
}
// ===== CATEGORÍAS =====
// ===== MODALES / CONFIRMAR / TOAST =====
export function closeModal(id){ $(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('open'); }));
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open')); $('global-search').classList.remove('open'); closeConfirm(); }
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){ e.preventDefault(); openGlobalSearch(); }
});
export function closeConfirm(){ $('confirm-dialog').classList.remove('open'); }
export function showToast(type,msg){
  const t=document.createElement('div'); t.className=`toast toast-${type}`;
  t.innerHTML=`<span>${{success:'✓',warning:'⚠',danger:'✕',info:'ℹ'}[type]||'ℹ'}</span> ${msg}<span class="toast-close" onclick="removeToast(this.parentElement)">×</span>`;
  $('toast-container').appendChild(t); setTimeout(()=>removeToast(t),3500);
}
function removeToast(t){ if(!t||!t.parentElement) return; t.classList.add('out'); setTimeout(()=>t.remove(),300); }

// ===== BÚSQUEDA GLOBAL (productos y categorías) =====
function openGlobalSearch(){ $('global-search').classList.add('open'); setTimeout(()=>$('gs-input').focus(),100); gsSearch(''); }
function closeGlobalSearch(e){ if(e.target===$('global-search')) $('global-search').classList.remove('open'); }
function gsSearch(q){
  const res=$('gs-results'), ql=q.trim().toLowerCase();
  if(!ql){ res.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-3);font-size:13px">Escribe para buscar...</div>'; return; }
  const hits=[
    ...DATA.products.filter(p=>(p.name+' '+p.sku).toLowerCase().includes(ql)).map(p=>({t:'products',n:p.name,s:p.sku||p.slug,i:'📦'})),
    ...DATA.categories.filter(c=>c.name.toLowerCase().includes(ql)).map(c=>({t:'categories',n:c.name,s:c.slug,i:'🗂'})),
  ].slice(0,8);
  res.innerHTML=hits.map(h=>`<div class="gs-item" onclick="gsGo('${h.t}')"><div class="gs-item-icon">${h.i}</div><div><div class="gs-item-name">${h.n}</div><div class="gs-item-sub">${h.s}</div></div></div>`).join('')||'<div style="text-align:center;padding:20px;color:var(--text-3);font-size:13px">Sin resultados</div>';
}
function gsGo(page){ $('global-search').classList.remove('open'); navigate(page,null); }

// ===== SIDEBAR / TEMA / MENÚ USUARIO / AJUSTES =====
function openSidebar(){ $('sidebar').classList.add('open'); $('sidebar-overlay').classList.add('active'); }
function closeSidebar(){ $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('active'); }
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t); localStorage.setItem('admin-theme',t);
  $('dark-label').textContent=t==='dark'?'Modo claro':'Modo oscuro';
  $('dark-icon').innerHTML=t==='dark'?'<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>':'<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
}
function toggleDark(){ applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'); }
function toggleUserDropdown(){ const d=$('user-dropdown'); d.classList.toggle('open'); $('user-menu').setAttribute('aria-expanded',d.classList.contains('open')); }
document.addEventListener('click',e=>{ if(!$('user-menu').contains(e.target)) $('user-dropdown').classList.remove('open'); });
// ===== INICIO =====
(function init(){
  applyTheme(localStorage.getItem('admin-theme')||'light');
  fillCategorySelects(); renderPage('dashboard');
})();

Object.assign(window, { applyProductFilters, applyTheme, closeConfirm, closeGlobalSearch, closeModal, closeSidebar, fillCategorySelects, gsGo, gsSearch, navigate, openGlobalSearch, openSidebar, removeToast, renderCatBars, renderKPIs, renderOutOfStock, renderPage, renderProducts, seoCount, showToast, toggleDark, toggleUserDropdown });
