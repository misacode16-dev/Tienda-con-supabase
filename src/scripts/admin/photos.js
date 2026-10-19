// src/scripts/admin/photos.js — subir fotos desde el panel (se convierten a WebP en el navegador y van a Cloudflare R2)
// Se activa solo: añade el botón "Subir fotos" y la vista previa sobre cada caja de fotos (producto y variantes).
const MAX_FULL = 1200, MAX_THUMB = 400;
let picker = null;

const lines = (ta) => ta.value.split('\n').map((l) => l.trim()).filter(Boolean);
const setLines = (ta, arr) => { ta.value = arr.join('\n'); ta.dispatchEvent(new Event('input')); };

async function toWebp(bitmap, max, quality) {
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height)); // nunca agranda
  const c = document.createElement('canvas'); c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/webp', quality));
}

function render(tools, ta) {
  const strip = tools.querySelector('.photo-strip'); strip.innerHTML = '';
  const mini = (txt, title, css, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = title; b.style.cssText = `position:absolute;border:0;cursor:pointer;background:rgba(0,0,0,.65);color:#fff;border-radius:6px;font-size:11px;line-height:1;padding:3px 5px;${css}`; b.onclick = fn; return b; };
  lines(ta).forEach((l, i, all) => {
    const [full, thumb] = l.split('|').map((s) => s.trim());
    const cell = document.createElement('div'); cell.style.cssText = 'position:relative;width:84px;height:84px;border:1px solid var(--border);border-radius:8px;background:#fff;overflow:hidden';
    const img = document.createElement('img'); img.src = thumb || full; img.alt = ''; img.style.cssText = 'width:100%;height:100%;object-fit:contain'; img.onerror = () => { img.style.visibility = 'hidden'; };
    cell.append(img, mini('✕', 'Quitar', 'top:3px;right:3px', () => setLines(ta, all.filter((_, k) => k !== i))));
    if (i > 0) cell.append(mini('◀', 'Mover a la izquierda', 'bottom:3px;left:3px', () => { const a = [...all]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setLines(ta, a); }));
    else cell.append(Object.assign(document.createElement('span'), { textContent: 'Portada', style: 'position:absolute;bottom:3px;left:3px;background:#2563eb;color:#fff;border-radius:6px;font-size:10px;padding:2px 5px' }));
    strip.appendChild(cell);
  });
}

async function handleFiles(files, tools, ta) {
  const status = tools.querySelector('.photo-status'), slug = (document.getElementById('pm-slug')?.value || '').trim();
  const token = await window.getAccessToken?.(); if (!token) return;
  const added = []; let error = '';
  for (let i = 0; i < files.length && !error; i++) {
    status.textContent = `Subiendo ${i + 1} de ${files.length}…`;
    try {
      const bmp = await createImageBitmap(files[i], { imageOrientation: 'from-image' });
      const full = await toWebp(bmp, MAX_FULL, 0.82), thumb = await toWebp(bmp, MAX_THUMB, 0.8); bmp.close?.();
      if (!full || !thumb) throw new Error('no se pudo convertir');
      const fd = new FormData(); fd.append('full', full, 'full.webp'); fd.append('thumb', thumb, 'thumb.webp'); fd.append('slug', slug);
      const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }).catch(() => null);
      if (!res) throw new Error('sin conexión');
      if (res.status === 404) throw new Error('la subida solo funciona en el sitio ya publicado, no en local');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `error ${res.status}`);
      added.push(`${j.full} | ${j.thumb}`);
    } catch (e) { error = `${files[i].name}: ${e.message}`; }
  }
  if (added.length) setLines(ta, [...lines(ta), ...added]);
  status.textContent = error ? `✖ ${error}` : `✔ ${added.length} foto(s) subida(s). Pulsa "Guardar producto" para conservarlas.`;
}

function pick(tools, ta) {
  if (!picker) { picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.multiple = true; picker.style.display = 'none'; document.body.appendChild(picker); }
  picker.value = ''; picker.onchange = () => handleFiles([...picker.files], tools, ta); picker.click();
}

function enhance(ta) {
  if (ta.photoTools) return;
  const tools = document.createElement('div'); tools.style.marginBottom = '8px';
  tools.innerHTML = '<div class="photo-strip" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px"></div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-secondary btn-sm">📷 Subir fotos</button><span class="photo-status" style="font-size:12px;color:var(--text-3)"></span></div>';
  ta.parentNode.insertBefore(tools, ta); ta.photoTools = tools;
  tools.querySelector('button').addEventListener('click', () => pick(tools, ta));
  ta.addEventListener('input', () => render(tools, ta));
}

function refreshAll() { document.querySelectorAll('#pm-gallery, [data-f="gallery"]').forEach((ta) => { enhance(ta); render(ta.photoTools, ta); }); }

// panel.js ya cargó: se envuelven sus funciones para activar las herramientas al abrir el formulario o añadir variantes
['openProductModal', 'addVariantRow'].forEach((name) => { const f = window[name]; if (typeof f === 'function') window[name] = (...a) => { const r = f(...a); refreshAll(); return r; }; });