// scripts/check-parity.mjs
// Comprueba que lo que sale de Supabase es IGUAL a tu products.json (la copia corregida).
// Uso:  node --env-file=.env scripts/check-parity.mjs
// Necesita en .env:  SUPABASE_URL  y  SUPABASE_ANON_KEY (pública)
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const toList = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim())
  : typeof v === "string" && v.trim() ? [v.trim()] : [];
const pairs = (image, images) => {
  const f = toList(image), t = toList(images), n = Math.max(f.length, t.length);
  return Array.from({ length: n }, (_, i) => ({ full: f[i] || t[i], thumb: t[i] || f[i] }));
};
const s = (v) => (typeof v === "string" ? v.trim() : "");

// Forma común para comparar (igual de tolerante que el importador)
export function norm(p) {
  return {
    slug: p.slug, name: s(p.name), seoTitle: s(p.seoTitle) || null, category: p.category,
    price: Number(p.price), oldPrice: Number(p.oldPrice) || null,
    stock: typeof p.stock === "boolean" ? p.stock : true,
    marca: s(p.marca), sku: s(p.sku), short: s(p.productDescription), details: s(p.productDetails),
    features: toList(p.features),
    specs: (Array.isArray(p.specs) ? p.specs : []).filter((x) => s(x?.label) && s(x?.value)).map((x) => ({ label: s(x.label), value: s(x.value) })),
    filtros: (Array.isArray(p.filtros) ? p.filtros : []).filter((x) => s(x?.brand)).map((x) => ({ brand: s(x.brand), model: s(x.model) })),
    gallery: pairs(p.image, p.images),
    variants: (Array.isArray(p.variants) ? p.variants : []).map((v) => ({
      id: v.id, label: s(v.label), shortName: s(v.shortName) || null, sku: s(v.sku),
      price: v.price === undefined || v.price === null ? null : Number(v.price),
      oldPrice: Number(v.oldPrice) || null, gallery: pairs(v.image, v.images),
    })),
  };
}

async function main() {
  const { loadCatalog } = await import("../src/lib/catalog.mjs");
  const jsonPath = process.argv[2] ?? "src/data/products.json";
  const fromJson = JSON.parse(fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, ""));
  const { products: fromDb } = await loadCatalog();

  const dbBySlug = new Map(fromDb.map((p) => [p.slug, p]));
  const problems = [];
  for (const j of fromJson) {
    const d = dbBySlug.get(j.slug);
    if (!d) { problems.push(`${j.slug}: NO está en Supabase`); continue; }
    const a = norm(j), b = norm(d);
    const diff = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (diff.length) problems.push(`${j.slug}: difiere en → ${diff.join(", ")}`);
  }
  const jsonSlugs = new Set(fromJson.map((p) => p.slug));
  for (const d of fromDb) if (!jsonSlugs.has(d.slug)) problems.push(`${d.slug}: está en Supabase pero NO en el JSON`);
  const sameOrder = fromJson.map((p) => p.slug).join("|") === fromDb.map((p) => p.slug).join("|");

  console.log(`\nJSON: ${fromJson.length} productos | Supabase: ${fromDb.length} productos`);
  console.log(`Mismo orden de productos: ${sameOrder ? "SÍ ✔" : "NO ✖ (¿corriste el SQL de orden y reimportaste?)"}`);
  if (problems.length) { console.log(`\n✖ ${problems.length} diferencias:`); problems.slice(0, 40).forEach((m) => console.log(" -", m)); process.exitCode = 1; }
  else console.log(sameOrder ? "\n✔ Todo coincide con tu JSON.\n" : "\n✔ Los datos coinciden (revisa el orden).\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main().catch((e) => { console.error("\n✖", e.message); process.exitCode = 1; });
