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
    const reportId = body.id;
    const updates = body.updates || {};
    if (!reportId || !updates || typeof updates !== "object") {
      return json(res, 400, { error: "Falta reporte o cambios." });
    }

    const profileResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/profiles?id=eq.${currentUser.id}&select=id,role,status,account_status`
    );
    if (!profileResult.response.ok) return json(res, profileResult.response.status, { error: "No se pudo verificar usuario." });
    const profile = profileResult.data?.[0];
    const isApproved = profile?.status === "aprobado" && (profile.account_status || "activo") !== "inactivo";
    const isAdmin = ["admin", "administrador"].includes(String(profile?.role || "").toLowerCase());
    if (!isApproved) return json(res, 403, { error: "Usuario no aprobado." });

    const reportResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/reports?id=eq.${reportId}&select=*`
    );
    if (!reportResult.response.ok) return json(res, reportResult.response.status, { error: "No se pudo buscar el reporte." });
    const report = reportResult.data?.[0];
    if (!report) return json(res, 404, { error: "Reporte no encontrado." });

    if (!isAdmin && report.mechanic_id !== currentUser.id) {
      return json(res, 403, { error: "No tenes permiso para modificar este reporte." });
    }

    const allowedForWorker = new Set(["status", "previous_status", "repair_note", "repaired_by", "repaired_at", "operation_note", "operated_by"]);
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => isAdmin || allowedForWorker.has(key))
    );
    if (!Object.keys(safeUpdates).length) return json(res, 400, { error: "No hay cambios permitidos." });

    const updateResult = await supabaseFetch(
      supabaseUrl,
      serviceKey,
      `/rest/v1/reports?id=eq.${reportId}&select=*`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(safeUpdates)
      }
    );
    if (!updateResult.response.ok) {
      return json(res, updateResult.response.status, {
        error: updateResult.data?.message || updateResult.text || "No se pudo actualizar el reporte."
      });
    }

    return json(res, 200, { ok: true, report: updateResult.data?.[0] || null });
  } catch (error) {
    return json(res, 500, { error: error.message || "Error inesperado actualizando reporte." });
  }
};
