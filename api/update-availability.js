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

    const currentUserResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
    if (!currentUserResponse.ok) return json(res, 401, { error: "Sesion invalida." });
    const currentUser = await currentUserResponse.json();

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const workerId = body.worker_id;
    const date = body.date;
    const status = body.status;
    if (!workerId || !date || !["disponible", "franco"].includes(status)) {
      return json(res, 400, { error: "Falta mecanico, fecha o estado valido." });
    }

    const profileResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/profiles?id=eq.${currentUser.id}&select=id,role,status,account_status`
    );
    if (!profileResult.response.ok) return json(res, profileResult.response.status, { error: "No se pudo verificar usuario." });
    const profile = profileResult.data?.[0];
    const isApproved = profile?.status === "aprobado" && (profile.account_status || "activo") !== "inactivo";
    const isAdmin = ["admin", "administrador", "admin2"].includes(String(profile?.role || "").toLowerCase());

    if (!isApproved) return json(res, 403, { error: "Usuario no aprobado." });
    if (!isAdmin) return json(res, 403, { error: "Solo admin puede cambiar francos." });

    const workerResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/profiles?id=eq.${workerId}&select=id,status,account_status`
    );
    if (!workerResult.response.ok) return json(res, workerResult.response.status, { error: "No se pudo verificar mecanico." });
    if (!workerResult.data?.[0]) return json(res, 404, { error: "Mecanico no encontrado." });

    const payload = {
      worker_id: workerId,
      date,
      status
    };

    const availabilityResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      "/rest/v1/worker_availability?on_conflict=worker_id,date&select=*",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload)
      }
    );

    if (!availabilityResult.response.ok) {
      const message = availabilityResult.data?.message || availabilityResult.text || "No se pudo guardar disponibilidad.";
      return json(res, availabilityResult.response.status, { error: message });
    }

    return json(res, 200, { ok: true, availability: availabilityResult.data?.[0] || null });
  } catch (error) {
    return json(res, 500, { error: error.message || "Error inesperado guardando disponibilidad." });
  }
};