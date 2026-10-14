// src/lib/catalog.mjs
// Lee el catálogo desde Supabase SOLO al construir la tienda (build / dev) y lo
// entrega con la MISMA forma que tenían products.json y categories.json.
// Así las páginas no cambian: los visitantes nunca consultan Supabase.
//
// Variables necesarias (.env en local, y en Cloudflare Pages → Variables):
//   SUPABASE_URL        https://TU-PROYECTO.supabase.co   (también vale PUBLIC_SUPABASE_URL)
//   SUPABASE_ANON_KEY   clave PÚBLICA (publishable / anon). NUNCA la secreta. (también vale PUBLIC_SUPABASE_ANON_KEY)

const readEnv = (name) => process.env[name] ?? import.meta.env?.[name];
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const num = (v) => (v === null || v === undefined ? undefined : Number(v));
const photos = (gallery, key) => (Array.isArray(gallery) ? gallery.map((g) => g?.[key]).filter(Boolean) : []);

// ---------- Filas de Supabase -> forma original del JSON ----------
export function mapCategory(c) {
  return compact({ slug: c.slug, name: c.name, description: c.description ?? undefined });
}

export function mapVariant(v) {
  return compact({
    id: v.key,
    label: v.label,
    shortName: v.short_name ?? undefined,
    sku: v.sku ?? "",
    price: num(v.price),
    oldPrice: num(v.old_price),
    image: photos(v.gallery, "full"),
    images: photos(v.gallery, "thumb"),
  });
}

export function mapProduct(p) {
  const variants = [...(p.product_variants ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(mapVariant);
  const compat = Array.isArray(p.compatibility) ? p.compatibility : [];

  return compact({
    slug: p.slug,
    name: p.name,
    seoTitle: p.seo_title ?? undefined,
    category: p.category,
    price: Number(p.price),
    oldPrice: num(p.old_price),
    image: photos(p.gallery, "full"),
    images: photos(p.gallery, "thumb"),
    productDetails: p.details ?? "",
    productDescription: p.short_description ?? "",
    stock: p.in_stock,
    marca: p.brand ?? "",
    sku: p.sku ?? "",
    specs: Array.isArray(p.specs) ? p.specs : [],
    features: Array.isArray(p.features) ? p.features : [],
    filtros: compat.length ? compat : undefined,
    variants: variants.length ? variants : undefined,
    home: p.home_section ?? undefined,
  });
}

// ---------- Descarga ----------
async function withRetry(fn, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

// Supabase entrega máx. 1000 filas por consulta: se pide por páginas.
async function fetchAll(supabase, table, select, orderBy) {
  const size = 1000;
  const rows = [];
  for (let from = 0; ; from += size) {
    const data = await withRetry(async () => {
      let q = supabase.from(table).select(select).range(from, from + size - 1);
      for (const col of orderBy) q = q.order(col, { ascending: true });
      const { data, error } = await q;
      if (error) throw new Error(`Supabase (${table}): ${error.message}`);
      return data;
    });
    rows.push(...data);
    if (data.length < size) break;
  }
  return rows;
}

async function fetchCatalog() {
  const url = String(readEnv("SUPABASE_URL") ?? readEnv("PUBLIC_SUPABASE_URL") ?? "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const key = String(readEnv("SUPABASE_ANON_KEY") ?? readEnv("PUBLIC_SUPABASE_ANON_KEY") ?? "").trim();
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_ANON_KEY (o PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY) en las variables de BUILD de Cloudflare y en el .env.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [catRows, prodRows] = await Promise.all([
    fetchAll(supabase, "categories", "*", ["sort_order", "slug"]),
    fetchAll(supabase, "products", "*, product_variants(*)", ["sort_order", "slug"]),
  ]);

  // Si algo viene vacío, el build FALLA en vez de publicar una tienda vacía
  // (Cloudflare mantiene la versión anterior en línea).
  if (catRows.length === 0 || prodRows.length === 0) {
    throw new Error(`Supabase devolvió ${prodRows.length} productos y ${catRows.length} categorías; se cancela el build.`);
  }

  const categories = catRows.map(mapCategory);
  const products = prodRows.map(mapProduct);
  const known = new Set(categories.map((c) => c.slug));
  for (const p of products) {
    if (!known.has(p.category)) console.warn(`[catalog] "${p.slug}" tiene una categoría inexistente: ${p.category}`);
  }
  console.log(`[catalog] ${products.length} productos y ${categories.length} categorías cargados desde Supabase`);
  return { categories, products };
}

let cache;
export const loadCatalog = () => (cache ??= fetchCatalog());
