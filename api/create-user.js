function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s._-]/g, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, ".")
    .replace(/\.+/g, ".");
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function supabaseFetch(url, serviceKey, path, options = {}) {
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { error: "Método no permitido." });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return json(res, 401, { error: "Sesión requerida." });
    }

    const supabaseUrl = process.env.SUPABASE_URL || "https://qnyvwnvfrrtcifnetggv.supabase.co";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!serviceKey) {
      return json(res, 503, { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel." });
    }

  const currentUserResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!currentUserResponse.ok) {
    return json(res, 401, { error: "Sesión inválida." });
  }

  const currentUser = await currentUserResponse.json();
  const profileResponse = await supabaseFetch(
    supabaseUrl,
    serviceKey,
    `/rest/v1/profiles?id=eq.${currentUser.id}&select=role,status,account_status`
  );
  const profiles = await profileResponse.json();
  const adminProfile = profiles[0];

  if (
    !adminProfile ||
    adminProfile.role !== "admin" ||
    adminProfile.status !== "aprobado" ||
    adminProfile.account_status === "inactivo"
  ) {
    return json(res, 403, { error: "Solo el administrador puede crear mecánicos." });
  }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { name, username, password, specialty } = body;
  const normalizedUsername = normalizeUsername(username);

  if (!name || !normalizedUsername || !password || !specialty) {
    return json(res, 400, { error: "Completá nombre, usuario, contraseña y especialidad." });
  }

  const email = `marianorodriguez506+${normalizedUsername}@gmail.com`;

  const createResponse = await supabaseFetch(supabaseUrl, serviceKey, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        username: normalizedUsername,
        role: "mecanico",
        specialty
      }
    })
  });

  const created = await createResponse.json();
  if (!createResponse.ok) {
    return json(res, createResponse.status, { error: created.msg || created.message || "No se pudo crear el usuario." });
  }

  const profilePayload = {
    id: created.id,
    email,
    name,
    username: normalizedUsername,
    role: "mecanico",
    status: "aprobado",
    account_status: "activo",
    specialty,
    created_at: new Date().toISOString()
  };

  const profileUpsert = await supabaseFetch(supabaseUrl, serviceKey, "/rest/v1/profiles", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(profilePayload)
  });

  if (!profileUpsert.ok) {
    const profileError = await profileUpsert.json().catch(() => ({}));
    return json(res, profileUpsert.status, { error: profileError.message || "El usuario Auth se creó, pero falló el perfil." });
  }

    return json(res, 200, {
      ok: true,
      username: normalizedUsername
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Error inesperado creando usuario." });
  }
};
