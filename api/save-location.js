function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function cleanEnvKey(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim();
}

function normalizeLocationName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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
    const name = String(body.name || "").trim();
    const normalizedName = normalizeLocationName(name);
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = body.accuracy == null ? null : Number(body.accuracy);

    if (!normalizedName || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json(res, 400, { error: "Falta nombre o coordenadas validas." });
    }

    const profileResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/profiles?id=eq.${currentUser.id}&select=id,name,role,status,account_status`
    );
    if (!profileResult.response.ok) return json(res, profileResult.response.status, { error: "No se pudo verificar usuario." });
    const profile = profileResult.data?.[0];
    const isApproved = profile?.status === "aprobado" && (profile.account_status || "activo") !== "inactivo";
    if (!isApproved) return json(res, 403, { error: "Usuario no aprobado." });

    const existingResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/saved_locations?normalized_name=eq.${encodeURIComponent(normalizedName)}&select=*&limit=1`
    );
    if (!existingResult.response.ok) {
      const message = existingResult.data?.message || existingResult.text || "No se pudo buscar ubicacion.";
      return json(res, existingResult.response.status, { error: message });
    }

    const existing = existingResult.data?.[0];
    if (existing) {
      return json(res, 200, { ok: true, location: existing, created: false });
    }

    const insertResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      "/rest/v1/saved_locations?select=*",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name,
          normalized_name: normalizedName,
          latitude,
          longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          created_by: currentUser.id,
          source_report_id: body.report_id || null,
          source_equipment: body.equipment || null
        })
      }
    );

    if (!insertResult.response.ok) {
      const message = insertResult.data?.message || insertResult.text || "No se pudo guardar ubicacion.";
      return json(res, insertResult.response.status, { error: message });
    }

    return json(res, 200, { ok: true, location: insertResult.data?.[0] || null, created: true });
  } catch (error) {
    return json(res, 500, { error: error.message || "Error inesperado guardando ubicacion." });
  }
};