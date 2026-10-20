// src/scripts/admin/photos.js — subir fotos desde el panel (se convierten a WebP en el navegador y van a Cloudflare R2)
// Se activa solo: sobre cada caja de fotos (producto y variantes) pone una zona para arrastrar, la vista previa
// y deja las rutas escritas a mano escondidas detrás de "Editar rutas manualmente".
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
  const strip = tools.querySelector('.photo-strip'), all = lines(ta), n = all.length;
  const drop = tools.querySelector('.photo-drop');
  drop.style.padding = n ? '10px' : '22px';
  drop.querySelector('.drop-title').textContent = n ? 'Arrastra más fotos aquí o haz clic para elegirlas' : 'Arrastra tus fotos aquí o haz clic para elegirlas';
  drop.querySelector('.drop-sub').style.display = n ? 'none' : 'block';

  strip.innerHTML = '';
  const mini = (txt, title, css, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = title; b.style.cssText = `position:absolute;border:0;cursor:pointer;background:rgba(0,0,0,.65);color:#fff;border-radius:6px;font-size:11px;line-height:1;padding:3px 5px;${css}`; b.onclick = fn; return b; };
  all.forEach((l, i) => {
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
  const status = tools.querySelector('.photo-status');
  files = files.filter((f) => f.type.startsWith('image/'));
  if (!files.length) { status.textContent = 'Solo se aceptan imágenes (JPG, PNG, WebP…).'; return; }
  if (tools.dataset.busy) return; tools.dataset.busy = '1';
  const slug = (document.getElementById('pm-slug')?.value || '').trim();
  const token = await window.getAccessToken?.();
  const added = []; let error = '';
  if (!token) error = 'tu sesión venció, vuelve a entrar';
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
  delete tools.dataset.busy;
}

function pick(tools, ta) {
  if (!picker) { picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.multiple = true; picker.style.display = 'none'; document.body.appendChild(picker); }
  picker.value = ''; picker.onchange = () => handleFiles([...picker.files], tools, ta); picker.click();
}

function enhance(ta) {
  if (ta.photoTools) return;
  const parent = ta.parentNode;
  // Ocultar la caja de texto, la etiqueta y el hint — ya no hacen falta
  const label = ta.previousElementSibling?.tagName === 'LABEL' ? ta.previousElementSibling : null;
  const hint = ta.nextElementSibling?.tagName === 'DIV' ? ta.nextElementSibling : null;
  [label, ta, hint].forEach((el) => { if (el) el.style.display = 'none'; });

  const tools = document.createElement('div'); tools.style.marginBottom = '4px';
  tools.innerHTML = `
    <div class="photo-drop" tabindex="0" role="button" style="border:2px dashed var(--border);border-radius:10px;padding:22px;text-align:center;cursor:pointer;color:var(--text-3);font-size:13px;transition:border-color .15s,background .15s">
      <div style="font-size:22px;line-height:1.2">📷</div>
      <div class="drop-title" style="color:var(--text-2);font-weight:600;margin-top:2px"></div>
      <div class="drop-sub" style="font-size:11px;margin-top:4px">JPG, PNG o WebP · se optimizan solas · la primera foto es la portada</div>
    </div>
    <div class="photo-strip" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div>
    <div class="photo-status" style="font-size:12px;color:var(--text-3);margin-top:6px;min-height:16px"></div>`;

  parent.insertBefore(tools, label || ta); ta.photoTools = tools;

  const drop = tools.querySelector('.photo-drop');
  const mark = (on) => { drop.style.borderColor = on ? 'var(--primary)' : 'var(--border)'; drop.style.background = on ? 'rgba(59,130,246,.08)' : 'transparent'; };
  drop.addEventListener('click', () => pick(tools, ta));
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(tools, ta); } });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); mark(true); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); mark(false); }));
  drop.addEventListener('drop', (e) => handleFiles([...(e.dataTransfer?.files || [])], tools, ta));
  ta.addEventListener('input', () => render(tools, ta));
}

function refreshAll() { document.querySelectorAll('#pm-gallery, [data-f="gallery"]').forEach((ta) => { enhance(ta); render(ta.photoTools, ta); }); }

// si sueltas una foto fuera de la zona, el navegador no la abre (y no te saca del panel)
['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }));

// Espera a que panel.js termine de definir sus funciones en window, luego las envuelve.
// panel.js llama enter() al final, que hace loadAll(); refreshAll se conecta justo antes de que
// el usuario pueda abrir el formulario por primera vez.
function patchWhenReady() {
  ['openProductModal', 'addVariantRow'].forEach((name) => {
    const f = window[name];
    if (typeof f === 'function' && !f._photos) {
      const wrapped = (...a) => { const r = f(...a); setTimeout(refreshAll, 0); return r; };
      wrapped._photos = true; window[name] = wrapped;
    }
  });
}
// Intenta ahora y cada 200 ms hasta que las funciones existan (máx. 5 seg)
let attempts = 0;
const wait = setInterval(() => {
  patchWhenReady();
  if (window.openProductModal?._photos || ++attempts > 25) clearInterval(wait);
}, 200);