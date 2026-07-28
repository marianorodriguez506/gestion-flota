function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function cleanEnvKey(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim();
}

async function supabaseFetch(url, serviceKey, path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data, text };
}

async function currentUserFromToken(supabaseUrl, anonKey, token) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Metodo no permitido." });

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(res, 401, { error: "Sesion requerida." });

    const supabaseUrl = process.env.SUPABASE_URL || "https://qnyvwnvfrrtcifnetggv.supabase.co";
    const anonKey = cleanEnvKey(
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_F9WNtGWDuoyTgt1jxYuPjg_GkjADQkP"
    );
    const serviceKey = cleanEnvKey(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
    if (!serviceKey) return json(res, 503, { error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." });

    const currentUser = await currentUserFromToken(supabaseUrl, anonKey, token);
    if (!currentUser) return json(res, 401, { error: "Sesion invalida." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const subscription = body.subscription || {};
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return json(res, 400, { error: "Suscripcion push invalida." });
    }

    const profileResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/profiles?id=eq.${currentUser.id}&select=id,status,account_status`
    );
    if (!profileResult.response.ok) return json(res, profileResult.response.status, { error: "No se pudo verificar usuario." });
    const profile = profileResult.data?.[0];
    const isApproved = profile?.status === "aprobado" && (profile.account_status || "activo") !== "inactivo";
    if (!isApproved) return json(res, 403, { error: "Usuario no aprobado." });

    const upsertResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      "/rest/v1/push_subscriptions?on_conflict=endpoint&select=id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          user_id: currentUser.id,
          endpoint: subscription.endpoint,
          subscription,
          user_agent: String(body.userAgent || req.headers["user-agent"] || "").slice(0, 500),
          active: true,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!upsertResult.response.ok) {
      return json(res, upsertResult.response.status, {
        error: upsertResult.data?.message || upsertResult.text || "No se pudo guardar este celular."
      });
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error.message || "Error inesperado registrando notificaciones." });
  }
};
