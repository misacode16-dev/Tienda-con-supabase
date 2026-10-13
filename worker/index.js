// worker/index.js
// Tu tienda se publica como un Worker de Cloudflare (dirección *.workers.dev),
// donde la carpeta "functions/" NO existe (eso es solo de Cloudflare Pages).
// Este Worker atiende únicamente /api/publish; todo lo demás lo sirve la tienda estática.
//
// Secretos (Worker → Settings → Variables and Secrets, tipo "Secret"):
//   SUPABASE_URL, SUPABASE_ANON_KEY, DEPLOY_HOOK_URL

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

async function publish(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.DEPLOY_HOOK_URL) {
    return json({ error: "Faltan secretos en el Worker (SUPABASE_URL, SUPABASE_ANON_KEY, DEPLOY_HOOK_URL)." }, 500);
  }
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autorizado" }, 401);

  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };

  // ¿Es administrador? (las reglas RLS solo le muestran su fila a un admin)
  const adm = await fetch(`${base}/rest/v1/admin_users?select=user_id`, { headers: h });
  const rows = adm.ok ? await adm.json() : [];
  if (!rows.length) return json({ error: "Sin permiso de administrador" }, 403);

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

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/publish") {
      if (request.method !== "POST") return json({ error: "Usa POST" }, 405);
      return publish(request, env);
    }
    return env.ASSETS.fetch(request); // el resto: la tienda estática
  },
};