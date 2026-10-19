// worker/index.js
// Tu tienda se publica como un Worker de Cloudflare (*.workers.dev), donde la carpeta "functions/" no existe.
// Este Worker atiende solo /api/publish y /api/analytics; todo lo demás lo sirve la tienda estática.
//
// Fotos: binding R2 "IMAGES" (wrangler.jsonc) y variable R2_PUBLIC_URL (dirección pública del bucket).
//
// Secretos (Worker → Settings → Variables and Secrets, tipo "Secret"):
//   Publicar:   SUPABASE_URL, SUPABASE_ANON_KEY, DEPLOY_HOOK_URL
//   Analítica:  CF_API_TOKEN (permiso Account Analytics: Read), CF_ACCOUNT_ID, CF_WA_SITE_TAG

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

// Comprueba que quien llama sea administrador (las reglas RLS solo le muestran su fila a un admin)
async function auth(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { res: json({ error: "No autorizado" }, 401) };
  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  const adm = await fetch(`${base}/rest/v1/admin_users?select=user_id`, { headers: h });
  const rows = adm.ok ? await adm.json() : [];
  if (!rows.length) return { res: json({ error: "Sin permiso de administrador" }, 403) };
  return { base, h };
}

async function publish(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.DEPLOY_HOOK_URL) {
    return json({ error: "Faltan secretos en el Worker (SUPABASE_URL, SUPABASE_ANON_KEY, DEPLOY_HOOK_URL)." }, 500);
  }
  const a = await auth(request, env);
  if (a.res) return a.res;
  const { base, h } = a;

  // ¿Hay algo nuevo? Si no, no se gasta un build
  const st = await fetch(`${base}/rest/v1/site_state?select=*&id=eq.1`, { headers: h });
  const s = st.ok ? (await st.json())[0] : null;
  if (s?.last_published_at && Date.parse(s.last_published_at) >= Date.parse(s.content_changed_at)) {
    return json({ ok: true, nothing: true });
  }
  const hook = await fetch(env.DEPLOY_HOOK_URL, { method: "POST" });
  if (!hook.ok) return json({ error: `Cloudflare no aceptó la orden de publicar (código ${hook.status})` }, 502);

  await fetch(`${base}/rest/v1/site_state?id=eq.1`, {
    method: "PATCH",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ last_published_at: new Date().toISOString() }),
  });
  return json({ ok: true });
}

// Lee Cloudflare Web Analytics (visitas, páginas y orígenes) para mostrarlo en el panel
async function analytics(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: "Faltan SUPABASE_URL y SUPABASE_ANON_KEY en el Worker." }, 500);
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_WA_SITE_TAG) {
    return json({ error: "Faltan secretos de analítica en el Worker (CF_API_TOKEN, CF_ACCOUNT_ID, CF_WA_SITE_TAG)." }, 500);
  }
  const a = await auth(request, env);
  if (a.res) return a.res;

  const body = await request.json().catch(() => ({}));
  const days = body.days === 30 ? 30 : 7;
  const acc = String(env.CF_ACCOUNT_ID).trim(), site = String(env.CF_WA_SITE_TAG).trim();
  if (!/^[A-Za-z0-9]+$/.test(acc) || !/^[A-Za-z0-9]+$/.test(site)) return json({ error: "CF_ACCOUNT_ID o CF_WA_SITE_TAG tienen caracteres no válidos." }, 500);

  const dates = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const f = `{ date_in: ${JSON.stringify(dates)}, siteTag: "${site}" }`;
  // el doble de días: el periodo actual + el anterior (para calcular el % de cambio)
  const dates2 = Array.from({ length: days * 2 }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const f2 = `{ date_in: ${JSON.stringify(dates2)}, siteTag: "${site}" }`;
  const grp = (alias, dim, flt = f) => `${alias}: rumPageloadEventsAdaptiveGroups(filter: ${flt}, limit: 1000) { count sum { visits } dimensions { ${dim} } }`;
  const query = `{ viewer { accounts(filter: { accountTag: "${acc}" }) {
    total: rumPageloadEventsAdaptiveGroups(filter: ${f}, limit: 1) { count sum { visits } }
    ${grp("paths", "requestPath")}
    ${grp("referers", "refererHost")}
    ${grp("daily", "date", f2)}
  } } }`;

  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.errors?.length) return json({ error: j?.errors?.[0]?.message || `Cloudflare respondió ${r.status}` }, 502);

  const acct = j.data?.viewer?.accounts?.[0] || {};
  const rows = (g, key) => (g || []).map((x) => ({ name: x.dimensions?.[key] || "", visits: x.sum?.visits ?? 0, views: x.count ?? 0 }));
  return json({
    days,
    visits: acct.total?.[0]?.sum?.visits ?? 0,
    views: acct.total?.[0]?.count ?? 0,
    paths: rows(acct.paths, "requestPath"),
    referers: rows(acct.referers, "refererHost"),
    daily: rows(acct.daily, "date").map((x) => ({ date: x.name, visits: x.visits, views: x.views })),
  });
}

// Sube una foto (grande + miniatura, ya convertidas a WebP por el panel) al bucket R2
const isWebp = (b) => {
  if (!b || b.byteLength < 12) return false;
  const u = new Uint8Array(b, 0, 12), t = (i, n) => String.fromCharCode(...u.slice(i, i + n));
  return t(0, 4) === "RIFF" && t(8, 4) === "WEBP";
};

async function upload(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: "Faltan SUPABASE_URL y SUPABASE_ANON_KEY en el Worker." }, 500);
  if (!env.IMAGES || !env.R2_PUBLIC_URL) return json({ error: "Falta configurar R2: el binding IMAGES (wrangler.jsonc) y la variable R2_PUBLIC_URL." }, 500);
  const a = await auth(request, env);
  if (a.res) return a.res;

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Formulario inválido" }, 400); }
  const full = form.get("full"), thumb = form.get("thumb");
  if (typeof full?.arrayBuffer !== "function" || typeof thumb?.arrayBuffer !== "function") return json({ error: "Faltan los archivos full y thumb" }, 400);
  const [bf, bt] = [await full.arrayBuffer(), await thumb.arrayBuffer()];
  if (bf.byteLength > 2_500_000 || bt.byteLength > 400_000) return json({ error: "La imagen es demasiado pesada" }, 413);
  if (!isWebp(bf) || !isWebp(bt)) return json({ error: "Solo se aceptan imágenes WebP (el panel las convierte solo)" }, 400);

  // nombre legible para buscadores: <slug-del-producto>-<código>.webp
  const slug = String(form.get("slug") || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "producto";
  const base = `products/${slug}-${crypto.randomUUID().slice(0, 8)}`;
  const opts = { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } };
  await env.IMAGES.put(`${base}.webp`, bf, opts);
  await env.IMAGES.put(`${base}-mini.webp`, bt, opts);

  const pub = env.R2_PUBLIC_URL.replace(/\/+$/, "");
  return json({ ok: true, full: `${pub}/${base}.webp`, thumb: `${pub}/${base}-mini.webp` });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const routes = { "/api/publish": publish, "/api/analytics": analytics, "/api/upload": upload };
    if (routes[pathname]) {
      if (request.method !== "POST") return json({ error: "Usa POST" }, 405);
      return routes[pathname](request, env);
    }
    return env.ASSETS.fetch(request); // el resto: la tienda estática
  },
};