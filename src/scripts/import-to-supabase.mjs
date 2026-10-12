// scripts/import-to-supabase.mjs
// Valida products.json + categories.json y los importa a Supabase.
//
// USO (desde la carpeta raíz del proyecto):
//   1) Simulación (NO escribe nada, solo revisa y muestra el informe):
//        node scripts/import-to-supabase.mjs --public ./public
//   2) Importar de verdad (solo si el informe no tiene errores):
//        node --env-file=.env scripts/import-to-supabase.mjs --public ./public --apply
//
// Opciones:  --products <ruta>  --categories <ruta>  --public <carpeta public>  --apply
//
// IMPORTANTE
//  • Pensado para correr UNA vez (migración). Si lo repites, vuelve a escribir sobre
//    los productos con lo que diga el JSON (pisaría ediciones hechas luego en el panel).
//    No toca "published" ni "home_section", y no borra nada.
//  • Usa la clave SECRETA de Supabase (service_role): solo en tu computadora, en .env.
//    Nunca la subas a GitHub ni la pongas en la tienda.

import fs from "node:fs";
import path from "node:path";

// ---------- argumentos ----------
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const PRODUCTS_PATH = getArg("--products", "src/data/products.json");
const CATEGORIES_PATH = getArg("--categories", "src/data/categories.json");
const PUBLIC_DIR = getArg("--public", null);

// ---------- informe ----------
const errors = []; // frenan la importación
const warnings = []; // avisos: conviene revisarlos
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const stats = { sinMarca: 0, sinSku: 0, sinSeoTitle: 0, descLarga: 0, sinFotos: 0 };

// ---------- utilidades ----------
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const clean = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const toList = (v) => {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  if (typeof v === "string" && v.trim() !== "") return [v.trim()];
  return [];
};
const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    console.error(`\n✖ No encuentro el archivo: ${file}\n  (usa --products / --categories para indicar otra ruta)`);
    process.exit(1);
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e) {
    console.error(`\n✖ JSON inválido en ${file}\n  ${e.message}\n  Revisa comas finales, comillas o llaves sin cerrar cerca de esa posición.`);
    process.exit(1);
  }
}

// Une cada foto grande con SU miniatura (igual que getGalleryImages de la tienda)
function buildGallery(where, image, images) {
  const full = toList(image);
  const thumb = toList(images);
  if (full.length !== thumb.length) {
    warn(where, `tiene ${full.length} foto(s) grande(s) y ${thumb.length} miniatura(s); se emparejan por posición`);
  }
  const n = Math.max(full.length, thumb.length);
  const gallery = [];
  for (let i = 0; i < n; i++) gallery.push({ full: full[i] || thumb[i], thumb: thumb[i] || full[i] });
  if (PUBLIC_DIR) {
    for (const g of gallery) {
      for (const p of new Set([g.full, g.thumb])) {
        if (!fs.existsSync(path.join(PUBLIC_DIR, p.replace(/^\//, "")))) warn(where, `la foto no existe en ${PUBLIC_DIR}: ${p}`);
      }
    }
  }
  return gallery;
}

function unknownKeys(where, obj, known) {
  for (const k of Object.keys(obj)) if (!known.has(k)) warn(where, `campo desconocido "${k}" (no se importará)`);
}

// ---------- 1) categorías ----------
const categoriesRaw = readJson(CATEGORIES_PATH);
if (!Array.isArray(categoriesRaw)) {
  console.error("✖ categories.json debe ser una lista [ ... ]");
  process.exit(1);
}
const categories = [];
const catSlugs = new Set();
categoriesRaw.forEach((c, i) => {
  const where = `categoría #${i + 1} (${c?.slug ?? "sin slug"})`;
  if (!c || typeof c !== "object") return err(where, "no es un objeto");
  if (!SLUG_RE.test(c.slug || "")) return err(where, "slug vacío o inválido (solo minúsculas, números y guiones)");
  if (catSlugs.has(c.slug)) return err(where, "slug repetido");
  if (!clean(c.name)) err(where, "nombre vacío");
  catSlugs.add(c.slug);
  categories.push({ slug: c.slug, name: clean(c.name), description: clean(c.description), sort_order: i });
});

// ---------- 2) productos y variantes ----------
const productsRaw = readJson(PRODUCTS_PATH);
if (!Array.isArray(productsRaw)) {
  console.error("✖ products.json debe ser una lista [ ... ]");
  process.exit(1);
}
const PRODUCT_KEYS = new Set(["slug", "name", "seoTitle", "category", "price", "oldPrice", "image", "images", "productDetails", "productDescription", "stock", "marca", "sku", "filtros", "specs", "features", "variants"]);
const VARIANT_KEYS = new Set(["id", "label", "shortName", "sku", "price", "oldPrice", "image", "images"]);

const products = [];
const variants = []; // cada una lleva product_slug; el id real se asigna al importar
const slugs = new Set();
const productSkus = new Map();
const variantSkus = new Map();
const perCategory = new Map();

productsRaw.forEach((p, i) => {
  const where = `producto #${i + 1} (${p?.slug ?? p?.name ?? "sin slug"})`;
  if (!p || typeof p !== "object") return err(where, "no es un objeto");
  unknownKeys(where, p, PRODUCT_KEYS);

  // slug
  if (!SLUG_RE.test(p.slug || "")) err(where, "slug vacío o inválido (solo minúsculas, números y guiones)");
  else if (slugs.has(p.slug)) err(where, "slug repetido");
  else slugs.add(p.slug);

  // nombre y categoría
  const name = clean(p.name);
  if (!name) err(where, "nombre vacío");
  if (!catSlugs.has(p.category)) err(where, `la categoría "${p.category}" no existe en categories.json`);
  else perCategory.set(p.category, (perCategory.get(p.category) || 0) + 1);

  // precios
  const price = toNum(p.price);
  if (price === null || !Number.isFinite(price) || price < 0) err(where, `precio inválido (${p.price})`);
  const oldPrice = toNum(p.oldPrice) || null; // 0 / vacío = sin precio anterior
  if (oldPrice !== null && !Number.isFinite(oldPrice)) err(where, `precio anterior inválido (${p.oldPrice})`);
  else if (oldPrice !== null && price !== null && oldPrice <= price) warn(where, `el precio anterior (${oldPrice}) no es mayor que el precio (${price})`);

  // stock
  if (typeof p.stock !== "boolean") warn(where, `"stock" no es true/false (${JSON.stringify(p.stock)}); se importará como true`);

  // marca y SKU: pueden estar vacíos → NULL
  const brand = clean(p.marca);
  const sku = clean(p.sku);
  if (!brand) stats.sinMarca++;
  if (!sku) stats.sinSku++;
  if (sku) {
    if (productSkus.has(sku)) err(where, `SKU "${sku}" repetido (ya lo usa ${productSkus.get(sku)})`);
    else productSkus.set(sku, where);
  }

  // textos
  const short = clean(p.productDescription);
  const details = clean(p.productDetails);
  if (!short) warn(where, "sin productDescription (descripción corta para Google)");
  else if (short.length > 160) stats.descLarga++;
  if (!details) warn(where, "sin productDetails (descripción detallada)");
  const seoTitle = clean(p.seoTitle);
  if (!seoTitle) stats.sinSeoTitle++;
  else if (seoTitle.length + 20 > 60) warn(where, `seoTitle de ${seoTitle.length} caracteres (+20 de la marca pasa de 60)`);

  // listas
  const features = toList(p.features);
  const specs = [];
  if (p.specs !== undefined && !Array.isArray(p.specs)) err(where, '"specs" debe ser una lista');
  (Array.isArray(p.specs) ? p.specs : []).forEach((s, k) => {
    if (clean(s?.label) && clean(s?.value)) specs.push({ label: s.label.trim(), value: s.value.trim() });
    else warn(where, `especificación #${k + 1} sin label o value; se omite`);
  });
  const compatibility = [];
  if (p.filtros !== undefined && !Array.isArray(p.filtros)) err(where, '"filtros" debe ser una lista');
  (Array.isArray(p.filtros) ? p.filtros : []).forEach((f, k) => {
    if (!clean(f?.brand)) warn(where, `filtro #${k + 1} sin brand; se omite`);
    else {
      // Un filtro con marca y sin modelo es válido hoy en la tienda: se conserva tal cual.
      if (!clean(f.model)) warn(where, `filtro #${k + 1} (${f.brand}) sin model; se importa igual, con el modelo vacío`);
      compatibility.push({ brand: f.brand.trim(), model: clean(f.model) || "" });
    }
  });

  // fotos
  const gallery = buildGallery(where, p.image, p.images);
  if (gallery.length === 0) {
    stats.sinFotos++;
    warn(where, "sin fotos");
  }

  products.push({
    slug: p.slug,
    name,
    seo_title: seoTitle,
    category: p.category,
    brand,
    sku,
    price,
    old_price: oldPrice,
    in_stock: typeof p.stock === "boolean" ? p.stock : true,
    short_description: short,
    details,
    features,
    specs,
    compatibility,
    gallery,
    sort_order: i, // orden original del JSON
  });

  // variantes
  if (p.variants !== undefined && !Array.isArray(p.variants)) err(where, '"variants" debe ser una lista');
  const list = Array.isArray(p.variants) ? p.variants : [];
  if (list.length === 1) warn(where, "tiene 1 sola variante (la web solo muestra el selector con 2 o más)");
  const keys = new Set();
  list.forEach((v, j) => {
    const vw = `${where} → variante #${j + 1} (${v?.id ?? "sin id"})`;
    if (!v || typeof v !== "object") return err(vw, "no es un objeto");
    unknownKeys(vw, v, VARIANT_KEYS);
    if (!SLUG_RE.test(v.id || "")) err(vw, 'id vacío o inválido (ej. "bt-a20")');
    else if (keys.has(v.id)) err(vw, "id repetido dentro del mismo producto");
    else keys.add(v.id);
    const label = clean(v.label);
    if (!label) err(vw, "label vacío");
    const vsku = clean(v.sku);
    if (vsku) {
      if (variantSkus.has(vsku)) err(vw, `SKU "${vsku}" repetido (ya lo usa ${variantSkus.get(vsku)})`);
      else variantSkus.set(vsku, vw);
    }
    const vprice = toNum(v.price);
    if (vprice !== null && (!Number.isFinite(vprice) || vprice < 0)) err(vw, `precio inválido (${v.price})`);
    const voldPrice = toNum(v.oldPrice) || null;
    if (voldPrice !== null && !Number.isFinite(voldPrice)) err(vw, `precio anterior inválido (${v.oldPrice})`);
    variants.push({
      product_slug: p.slug,
      key: v.id,
      label,
      short_name: clean(v.shortName),
      sku: vsku,
      price: vprice,
      old_price: voldPrice,
      gallery: buildGallery(vw, v.image, v.images),
      position: j,
    });
  });
});

// ---------- 3) informe ----------
const line = "─".repeat(60);
console.log(`\n${line}\n  INFORME DE VALIDACIÓN\n${line}`);
console.log(`  Categorías ........ ${categories.length}`);
console.log(`  Productos ......... ${products.length}`);
console.log(`  Variantes ......... ${variants.length}`);
console.log(`\n  Datos vacíos (permitidos, se guardan como vacío real):`);
console.log(`    sin marca: ${stats.sinMarca}   sin SKU: ${stats.sinSku}   sin seoTitle: ${stats.sinSeoTitle}`);
if (stats.descLarga) console.log(`    descripciones cortas de más de 160 caracteres: ${stats.descLarga}`);
const empty = categories.filter((c) => !perCategory.has(c.slug)).map((c) => c.slug);
if (empty.length) console.log(`    categorías sin productos: ${empty.join(", ")}`);

const show = (title, list, max) => {
  if (!list.length) return;
  console.log(`\n  ${title} (${list.length})`);
  list.slice(0, max).forEach((m) => console.log(`   - ${m}`));
  if (list.length > max) console.log(`   … y ${list.length - max} más`);
};
show("✖ ERRORES (hay que corregirlos antes de importar)", errors, 60);
show("⚠ AVISOS (revisa cuando puedas)", warnings, 40);

if (errors.length) {
  console.log(`\n${line}\n  ✖ NO se importó nada: corrige los errores y vuelve a correr.\n${line}\n`);
  process.exit(1);
}
if (!APPLY) {
  console.log(`\n${line}\n  ✔ Sin errores. Esto fue una SIMULACIÓN: no se escribió nada.\n  Para importar:  node --env-file=.env scripts/import-to-supabase.mjs --public ./public --apply\n${line}\n`);
  process.exit(0);
}

// ---------- 4) importación ----------
class ImportAbort extends Error {}

// Limpia el valor leído del .env: quita espacios, comillas, "/" final y "/rest/v1".
const unquote = (v) => String(v ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
function normalizeSupabaseUrl(raw) {
  const url = unquote(raw).replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.pathname !== "/" || u.search || u.hash) return { url, ok: false };
    return { url: u.origin, ok: true };
  } catch {
    return { url, ok: false };
  }
}

const fail = (step, error) => {
  console.error(`\n✖ Falló "${step}": ${error.message}${error.details ? `\n  ${error.details}` : ""}`);
  if (/invalid path/i.test(error.message)) {
    console.error("  → Casi seguro SUPABASE_URL está mal. Debe ser SOLO: https://TU-PROYECTO.supabase.co (sin / al final, sin /rest/v1 y sin enlaces del dashboard).");
  }
  console.error("  Lo ya importado no se pierde; corrige y vuelve a correr (es seguro repetir).");
  throw new ImportAbort();
};

try {
  const { createClient } = await import("@supabase/supabase-js");
  const key = unquote(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { url, ok } = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  if (!url || !key) {
    console.error("\n✖ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el archivo .env\n");
    throw new ImportAbort();
  }
  if (!ok) {
    console.error(`\n✖ SUPABASE_URL no tiene el formato correcto.\n  Leí: ${url}\n  Debe ser solo:  https://TU-PROYECTO.supabase.co   (Project Settings → API → Project URL)\n`);
    throw new ImportAbort();
  }
  console.log(`\n  Conectando a ${url} …`);
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  console.log("  Importando…");

  {
    const { error } = await supabase.from("categories").upsert(categories, { onConflict: "slug" });
    if (error) fail("categorías", error);
    console.log(`   ✔ ${categories.length} categorías`);
  }

  const idBySlug = new Map();
  for (const part of chunk(products, 100)) {
    const { data, error } = await supabase.from("products").upsert(part, { onConflict: "slug" }).select("id, slug");
    if (error) fail("productos", error);
    data.forEach((r) => idBySlug.set(r.slug, r.id));
  }
  console.log(`   ✔ ${products.length} productos`);

  const variantRows = variants.map(({ product_slug, ...v }) => ({ ...v, product_id: idBySlug.get(product_slug) }));
  for (const part of chunk(variantRows, 200)) {
    const { error } = await supabase.from("product_variants").upsert(part, { onConflict: "product_id,key" });
    if (error) fail("variantes", error);
  }
  console.log(`   ✔ ${variantRows.length} variantes`);

  // verificación final
  for (const t of ["categories", "products", "product_variants"]) {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
    if (error) fail(`conteo de ${t}`, error);
    console.log(`   • ${t}: ${count} filas en Supabase`);
  }
  console.log(`\n${line}\n  ✔ Importación terminada. Revisa Table Editor en Supabase.\n${line}\n`);
} catch (e) {
  if (!(e instanceof ImportAbort)) console.error(`\n✖ Error inesperado: ${e.message}\n`);
  process.exitCode = 1; // sale sin cortar de golpe (evita el aviso "Assertion failed" de Windows)
}