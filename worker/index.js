// worker/index.js
// Tu tienda se publica como un Worker de Cloudflare (*.workers.dev), donde la carpeta "functions/" no existe.
// Este Worker atiende solo /api/publish y /api/analytics; todo lo demás lo sirve la tienda estática.
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
  const grp = (alias, dim) => `${alias}: rumPageloadEventsAdaptiveGroups(filter: ${f}, limit: 1000) { count sum { visits } dimensions { ${dim} } }`;
  const query = `{ viewer { accounts(filter: { accountTag: "${acc}" }) {
    total: rumPageloadEventsAdaptiveGroups(filter: ${f}, limit: 1) { count sum { visits } }
    ${grp("paths", "requestPath")}
    ${grp("referers", "refererHost")}
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
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/publish" || pathname === "/api/analytics") {
      if (request.method !== "POST") return json({ error: "Usa POST" }, 405);
      return pathname === "/api/publish" ? publish(request, env) : analytics(request, env);
    }
    return env.ASSETS.fetch(request); // el resto: la tienda estática
  },
};