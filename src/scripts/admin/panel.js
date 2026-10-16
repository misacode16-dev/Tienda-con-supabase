// src/scripts/admin/panel.js — acceso, productos, categorías y publicación (Supabase).
import { createClient } from '@supabase/supabase-js';
import { $, DATA, currentPage, showToast, closeModal, closeConfirm, seoCount, fillCategorySelects, renderPage, countIn, actionBtns } from './ui.js';
const sb = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY);
const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const slugify = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const val = (id) => document.getElementById(id).value.trim();
const lines = (id) => val(id).split('\n').map((l) => l.trim()).filter(Boolean);
const numOrNull = (t) => (String(t).trim() === '' ? null : Number(t));
const fail = (e, ctx) => showToast('danger', `${ctx}: ${e.message}`);
const galleryText = (g) => (g || []).map((x) => (x.thumb && x.thumb !== x.full ? `${x.full} | ${x.thumb}` : x.full)).join('\n');
const parseGallery = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [a, b] = l.split('|').map((x) => x.trim()); return { full: a, thumb: b || a }; });
let editing = null, editingCat = null, delTarget = null, state = null;

// ---------- acceso ----------
function showLogin(msg = '') { $('login').style.display = 'flex'; $('login-error').textContent = msg; }
async function enter() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  const { data, error } = await sb.from('admin_users').select('user_id');
  if (error || !data?.length) { await sb.auth.signOut(); return showLogin('Tu usuario no tiene permiso de administrador.'); }
  $('login').style.display = 'none';
  $('user-email').textContent = session.user.email;
  await loadAll();
}
window.doLogin = async () => {
  const { error } = await sb.auth.signInWithPassword({ email: val('login-email'), password: $('login-pass').value });
  if (error) return showLogin('Correo o contraseña incorrectos.');
  enter();
};
window.doLogout = async () => { await sb.auth.signOut(); location.reload(); };

// ---------- datos ----------
async function loadAll() {
  const [c, p, st] = await Promise.all([
    sb.from('categories').select('*').order('sort_order').order('slug'),
    sb.from('products').select('*, product_variants(*)').order('sort_order').order('slug').range(0, 999),
    sb.from('site_state').select('*').eq('id', 1).maybeSingle(),
  ]);
  if (c.error || p.error) return fail(c.error || p.error, 'No se pudo cargar');
  DATA.categories = c.data.map((x) => ({ slug: x.slug, name: x.name, description: x.description }));
  DATA.products = p.data.map((r) => ({ slug: r.slug, name: r.name, seoTitle: r.seo_title || '', category: r.category, price: +r.price, oldPrice: +r.old_price || 0, stock: r.in_stock, marca: r.brand || '', sku: r.sku || '', variants: r.product_variants.length, home: r.home_section || '', home: r.home_section || '', img: r.gallery?.[0]?.thumb || r.gallery?.[0]?.full || '', _r: r }));
  state = st.data; fillCategorySelects(); renderPage(currentPage); paintPublish();
}
function paintPublish() {
  const pending = state && (!state.last_published_at || Date.parse(state.content_changed_at) > Date.parse(state.last_published_at));
  const b = $('publish-btn'); b.className = 'btn btn-sm ' + (pending ? 'btn-primary' : 'btn-secondary');
  b.textContent = pending ? 'Publicar cambios ●' : 'Publicar cambios'; b.title = pending ? 'Hay cambios sin publicar' : 'Todo está publicado';
}
window.publishSite = async () => {
  if (!confirm('¿Publicar los cambios en la tienda? Tarda de 1 a 3 minutos en verse.')) return;
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch('/api/publish', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
  if (!res) return showToast('danger', 'Sin conexión');
  if (res.status === 404) return showToast('warning', 'Publicar solo funciona en el sitio ya publicado, no en local.');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return showToast('danger', j.error || 'No se pudo publicar');
  showToast('success', j.nothing ? 'No hay cambios nuevos para publicar.' : 'Publicación iniciada: en 1 a 3 minutos estará en la tienda.');
  const st = await sb.from('site_state').select('*').eq('id', 1).maybeSingle(); state = st.data; paintPublish();
};

// ---------- productos ----------
window.addVariantRow = (v = {}) => {
  const f = (l, i, c = '') => `<div class="${c}"><label class="form-label">${l}</label>${i}</div>`;
  const inp = (k, ph, x, t = 'text') => `<input class="form-control" data-f="${k}" type="${t}" placeholder="${ph}" value="${esc(x)}">`;
  const d = document.createElement('div'); d.className = 'variant-card'; d.dataset.key = v.key || '';
  d.innerHTML = `<div class="variant-grid">${f('Etiqueta', inp('label', 'Q-125', v.label))}${f('SKU', inp('sku', 'Q-125', v.sku))}${f('Nombre corto', inp('short_name', 'Alarma Quality Q-125', v.short_name), 'v-wide')}${f('Precio (S/)', inp('price', '0.00', v.price, 'number'))}${f('Precio anterior (S/)', inp('old_price', '0.00', v.old_price, 'number'))}${f('Fotos (una por línea: grande | miniatura)', `<textarea class="form-control" data-f="gallery" rows="3">${esc(galleryText(v.gallery))}</textarea>`, 'v-wide')}</div><div class="variant-actions"><button class="btn btn-danger btn-sm v-remove" type="button" onclick="this.closest('.variant-card').remove()">Quitar variante</button></div>`;
  $('variants-list').appendChild(d);
};
window.openProductModal = (slug) => {
  const r = DATA.products.find((x) => x.slug === slug)?._r; editing = r || null;
  $('pm-title').textContent = r ? 'Editar producto' : 'Agregar producto';
  const set = (id, v) => { $(id).value = v ?? ''; };
  set('pm-name', r?.name); set('pm-seo', r?.seo_title); set('pm-slug', r?.slug); set('pm-brand', r?.brand); set('pm-sku', r?.sku);
  set('pm-price', r?.price); set('pm-old', r?.old_price); set('pm-stock', r?.in_stock === false ? '0' : '1');
  set('pm-published', r?.published === false ? '0' : '1'); set('pm-home', r?.home_section);
  set('pm-short', r?.short_description); set('pm-details', r?.details); set('pm-features', (r?.features || []).join('\n'));
  set('pm-specs', (r?.specs || []).map((s) => `${s.label}: ${s.value}`).join('\n'));
  set('pm-compat', (r?.compatibility || []).map((c) => `${c.brand} | ${c.model}`).join('\n'));
  set('pm-gallery', galleryText(r?.gallery));
  if (r) $('pm-cat').value = r.category;
  $('variants-list').innerHTML = '';
  [...(r?.product_variants || [])].sort((a, b) => a.position - b.position).forEach((v) => addVariantRow(v));
  seoCount(); $('product-modal').classList.add('open');
};
window.saveProduct = async () => {
  const row = {
    slug: val('pm-slug'), name: val('pm-name'), seo_title: val('pm-seo') || null, category: $('pm-cat').value,
    brand: val('pm-brand') || null, sku: val('pm-sku') || null, price: numOrNull(val('pm-price')), old_price: numOrNull(val('pm-old')) || null,
    in_stock: $('pm-stock').value === '1', published: $('pm-published').value === '1', home_section: $('pm-home').value || null,
    short_description: val('pm-short') || null, details: val('pm-details') || null, features: lines('pm-features'),
    specs: lines('pm-specs').map((l) => { const i = l.indexOf(':'); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null; }).filter(Boolean),
    compatibility: lines('pm-compat').map((l) => { const [b, m] = l.split('|').map((x) => x.trim()); return b ? { brand: b, model: m || '' } : null; }).filter(Boolean),
    gallery: parseGallery($('pm-gallery').value),
  };
  if (!row.name) return showToast('warning', 'Escribe el nombre del producto');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug)) return showToast('warning', 'El slug solo admite minúsculas, números y guiones');
  if (row.price === null || !(row.price >= 0)) return showToast('warning', 'Escribe un precio válido');
  const bad = row.gallery.find((g) => !/^(\/|https?:\/\/)/.test(g.full)); if (bad) return showToast('warning', `Foto inválida: ${bad.full}`);
  const variants = [...document.querySelectorAll('#variants-list .variant-card')].map((el, i) => {
    const g = (k) => el.querySelector(`[data-f="${k}"]`).value.trim(); const label = g('label'); if (!label) return null;
    return { key: el.dataset.key || slugify(label), label, short_name: g('short_name') || null, sku: g('sku') || null, price: numOrNull(g('price')), old_price: numOrNull(g('old_price')) || null, gallery: parseGallery(g('gallery')), position: i };
  }).filter(Boolean);
  const keys = variants.map((v) => v.key); if (new Set(keys).size !== keys.length) return showToast('warning', 'Dos variantes tienen la misma etiqueta');

  let id = editing?.id;
  if (editing) { const { error } = await sb.from('products').update(row).eq('id', id); if (error) return fail(error, 'No se pudo guardar'); }
  else { row.sort_order = Math.max(0, ...DATA.products.map((p) => p._r.sort_order)) + 1; const { data, error } = await sb.from('products').insert(row).select('id').single(); if (error) return fail(error, 'No se pudo crear'); id = data.id; }
  const removed = (editing?.product_variants || []).map((v) => v.key).filter((k) => !keys.includes(k));
  if (removed.length) { const { error } = await sb.from('product_variants').delete().eq('product_id', id).in('key', removed); if (error) return fail(error, 'Variantes'); }
  if (variants.length) { const { error } = await sb.from('product_variants').upsert(variants.map((v) => ({ ...v, product_id: id })), { onConflict: 'product_id,key' }); if (error) return fail(error, 'Variantes'); }
  closeModal('product-modal'); showToast('success', 'Producto guardado'); await loadAll();
};

// ---------- categorías ----------
window.renderCategories = () => {
  $('categories-body').innerHTML = DATA.categories.map((c) => `<tr><td class="fw-600">${esc(c.name)}</td><td class="td-mono">/categoria/${c.slug}</td><td class="fw-600">${countIn(c)}</td><td>${actionBtns(`<button class="btn btn-secondary btn-sm" onclick="openCategoryModal('${c.slug}')">Editar</button><button class="btn btn-danger btn-sm" onclick="confirmDeleteCat('${c.slug}')">Eliminar</button>`)}</td></tr>`).join('');
};
window.openCategoryModal = (slug) => {
  const c = DATA.categories.find((x) => x.slug === slug); editingCat = c || null;
  document.querySelector('#category-modal h2').textContent = c ? 'Editar categoría' : 'Nueva categoría';
  $('cat-name').value = c?.name ?? ''; $('cat-slug').value = c?.slug ?? ''; $('cat-desc').value = c?.description ?? '';
  $('category-modal').classList.add('open');
};
window.saveCategory = async () => {
  const name = val('cat-name'), slug = val('cat-slug') || slugify(name);
  if (!name) return showToast('warning', 'Escribe el nombre'); if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return showToast('warning', 'Slug inválido (minúsculas, números y guiones)');
  const row = { name, slug, description: val('cat-desc') || null };
  const { error } = editingCat ? await sb.from('categories').update(row).eq('slug', editingCat.slug) : await sb.from('categories').insert({ ...row, sort_order: DATA.categories.length });
  if (error) return fail(error, 'No se pudo guardar'); closeModal('category-modal'); showToast('success', 'Categoría guardada'); await loadAll();
};

// ---------- eliminar ----------
const askDelete = (t, slug, msg) => { delTarget = { t, slug }; $('confirm-title').textContent = msg; $('confirm-dialog').classList.add('open'); };
window.confirmDelete = (slug) => askDelete('p', slug, '¿Eliminar este producto? No se puede deshacer.');
window.confirmDeleteCat = (slug) => askDelete('c', slug, '¿Eliminar esta categoría? Solo se puede si no tiene productos.');
window.doDelete = async () => {
  closeConfirm(); const { t, slug } = delTarget;
  const { error } = await sb.from(t === 'p' ? 'products' : 'categories').delete().eq('slug', slug);
  if (error) return fail(error, t === 'c' ? 'No se pudo eliminar (¿tiene productos?)' : 'No se pudo eliminar');
  showToast('success', 'Eliminado'); await loadAll();
};

// ---------- analítica (Cloudflare Web Analytics) ----------
const CHANNELS = [['Google', /google\./], ['Instagram', /instagram/], ['TikTok', /tiktok/], ['Facebook', /facebook|fb\.com|fb\.me/], ['WhatsApp', /whatsapp|wa\.me/], ['YouTube', /youtube|youtu\.be/]];
const channelOf = (h) => (!h || h.includes('autoboutiqueolga.com') || h.includes('workers.dev') ? 'Directo o sin origen' : (CHANNELS.find(([, re]) => re.test(h))?.[0] || h));
const anRow = (name, n) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-light);font-size:13px"><span>${esc(name)}</span><strong>${n.toLocaleString('es-PE')}</strong></div>`;
const anEmpty = '<div style="color:var(--text-3);font-size:13px">Aún no hay datos.</div>';
let anCache = { at: 0, days: 0 };

window.loadAnalytics = async (force) => {
  const days = Number($('an-days').value) || 7;
  if (force !== true && anCache.days === days && Date.now() - anCache.at < 60000) return;
  $('an-status').textContent = 'Cargando…';
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch('/api/analytics', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ days }) }).catch(() => null);
  if (!res) { $('an-status').textContent = 'Sin conexión.'; return; }
  if (res.status === 404) { $('an-status').textContent = 'Las estadísticas solo funcionan en el sitio ya publicado, no en local.'; return; }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { $('an-status').textContent = j.error || `No se pudo cargar (código ${res.status})`; return; }
  anCache = { at: Date.now(), days }; $('an-status').textContent = '';
  $('an-visits').textContent = j.visits.toLocaleString('es-PE'); $('an-views').textContent = j.views.toLocaleString('es-PE');

  // productos más vistos: las páginas /tienda/<slug>, con el nombre del producto
  const names = new Map(DATA.products.map((p) => [p.slug, p.name])); const prod = new Map();
  for (const r of j.paths) { const m = r.name.match(/^\/tienda\/([^/?#]+)\/?$/); if (m) { const s = decodeURIComponent(m[1]); prod.set(s, (prod.get(s) || 0) + r.views); } }
  const topP = [...prod].sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('an-products').innerHTML = topP.length ? topP.map(([s, v]) => anRow(names.get(s) || s, v)).join('') : anEmpty;

  // canales: Google, Instagram, TikTok, etc.
  const ch = new Map(); for (const r of j.referers) { const k = channelOf(r.name); ch.set(k, (ch.get(k) || 0) + r.visits); }
  const topC = [...ch].sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('an-channels').innerHTML = topC.length ? topC.map(([k, v]) => anRow(k, v)).join('') : anEmpty;
};


enter();
