// functions/api/publish.js  (Cloudflare Pages Function → responde en /api/publish)
// Recibe el token del administrador, comprueba que SEA administrador y recién entonces
// ordena reconstruir la tienda. La URL del deploy hook queda guardada como secreto aquí,
// nunca en el navegador.
//
// Variables en Cloudflare Pages: SUPABASE_URL, SUPABASE_ANON_KEY, DEPLOY_HOOK_URL (secreta)
export async function onRequestPost({ request, env }) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.DEPLOY_HOOK_URL) return json({ error: "Faltan variables en Cloudflare (SUPABASE_URL, SUPABASE_ANON_KEY, DEPLOY_HOOK_URL)." }, 500);

  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autorizado" }, 401);

  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };

  // ¿Es administrador? (las reglas RLS solo le muestran su fila a un admin)
  const adm = await fetch(`${base}/rest/v1/admin_users?select=user_id`, { headers: h });
  const rows = adm.ok ? await adm.json() : [];
  if (!rows.length) return json({ error: "Sin permiso de administrador" }, 403);

  // ¿Hay algo nuevo? Si no, no gastamos un build (el plan gratis tiene 500 al mes)
  const st = await fetch(`${base}/rest/v1/site_state?select=*&id=eq.1`, { headers: h });
  const s = st.ok ? (await st.json())[0] : null;
  if (s?.last_published_at && Date.parse(s.last_published_at) >= Date.parse(s.content_changed_at)) return json({ ok: true, nothing: true });

  const hook = await fetch(env.DEPLOY_HOOK_URL, { method: "POST" });
  if (!hook.ok) return json({ error: "Cloudflare no aceptó la orden de publicar" }, 502);

  await fetch(`${base}/rest/v1/site_state?id=eq.1`, {
    method: "PATCH", headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ last_published_at: new Date().toISOString() }),
  });
  return json({ ok: true });
}
