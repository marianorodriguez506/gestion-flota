const webpush = require("web-push");

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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function deactivateSubscription(supabaseUrl, serviceKey, endpoint) {
  await supabaseFetch(
    supabaseUrl,
    serviceKey,
    `/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
    }
  ).catch(() => {});
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Metodo no permitido." });

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(res, 401, { error: "Sesion requerida." });

    const vapidPublicKey = cleanEnvKey(process.env.VAPID_PUBLIC_KEY);
    const vapidPrivateKey = cleanEnvKey(process.env.VAPID_PRIVATE_KEY);
    if (!vapidPublicKey || !vapidPrivateKey) return json(res, 200, { ok: false, skipped: "VAPID no configurado." });

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

    const profileResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/profiles?id=eq.${currentUser.id}&select=id,role,status,account_status`
    );
    if (!profileResult.response.ok) return json(res, profileResult.response.status, { error: "No se pudo verificar usuario." });
    const senderProfile = profileResult.data?.[0];
    const isApproved = senderProfile?.status === "aprobado" && (senderProfile.account_status || "activo") !== "inactivo";
    if (!isApproved) return json(res, 403, { error: "Usuario no aprobado." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const text = String(body.text || "").trim();
    if (!text) return json(res, 400, { error: "Falta texto de notificacion." });

    const adminsResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      "/rest/v1/profiles?select=id,role,status,account_status&status=eq.aprobado&account_status=neq.inactivo"
    );
    if (!adminsResult.response.ok) return json(res, adminsResult.response.status, { error: "No se pudieron buscar admins." });

    const adminIds = (adminsResult.data || [])
      .filter((profile) => ["admin", "administrador", "admin2"].includes(String(profile.role || "").toLowerCase()))
      .map((profile) => profile.id);
    const targetIds = unique([...(body.targetUserId ? [body.targetUserId] : []), ...adminIds]);
    if (!targetIds.length) return json(res, 200, { ok: true, sent: 0 });

    const subscriptionsResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/push_subscriptions?active=eq.true&user_id=in.(${targetIds.join(",")})&select=*`
    );
    if (!subscriptionsResult.response.ok) {
      return json(res, subscriptionsResult.response.status, { error: "No se pudieron buscar celulares." });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@gestion-flota.local",
      vapidPublicKey,
      vapidPrivateKey
    );

    const payload = JSON.stringify({
      title: "Gestion de Flota",
      body: text,
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/icon-192.png",
      tag: body.notificationId || "gestion-flota",
      notificationId: body.notificationId || null,
      url: body.url || "/#notifications"
    });

    let sent = 0;
    const failures = [];
    await Promise.all((subscriptionsResult.data || []).map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent += 1;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await deactivateSubscription(supabaseUrl, serviceKey, row.endpoint);
        } else {
          failures.push({ endpoint: row.endpoint, error: error.message });
        }
      }
    }));

    return json(res, 200, { ok: true, sent, failures: failures.length });
  } catch (error) {
    return json(res, 500, { error: error.message || "Error inesperado enviando push." });
  }
};
