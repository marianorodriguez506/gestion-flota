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

function cleanEnvKey(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
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

async function findAuthUserByEmail(supabaseUrl, serviceKey, email) {
  const usersResponse = await supabaseFetch(supabaseUrl, serviceKey, "/auth/v1/admin/users?page=1&per_page=1000");
  if (!usersResponse.ok) return null;

  const usersData = await usersResponse.json().catch(() => ({}));
  return (usersData.users || []).find((user) => String(user.email || "").toLowerCase() === email.toLowerCase()) || null;
}

async function signInUser(supabaseUrl, anonKey, email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.msg || data.message || "No se pudo iniciar sesion interna del mecanico.");
  }

  return data;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { error: "Metodo no permitido." });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return json(res, 401, { error: "Sesion requerida." });
    }

    const supabaseUrl = process.env.SUPABASE_URL || "https://qnyvwnvfrrtcifnetggv.supabase.co";
    const anonKey = cleanEnvKey(
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_F9WNtGWDuoyTgt1jxYuPjg_GkjADQkP"
    );
    const serviceKey = cleanEnvKey(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

    if (!serviceKey) {
      return json(res, 503, { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel." });
    }

    const currentUserResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`
      }
    });

    if (!currentUserResponse.ok) {
      return json(res, 401, { error: "Sesion invalida." });
    }

    const currentUser = await currentUserResponse.json();
    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${currentUser.id}&select=role,status`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!profileResponse.ok) {
      return json(res, profileResponse.status, { error: "No se pudo verificar el perfil administrador." });
    }

    const profiles = await profileResponse.json();
    const adminProfile = profiles[0];
    const role = String(adminProfile?.role || "").toLowerCase();
    const status = String(adminProfile?.status || "").toLowerCase();

    if (
      !adminProfile ||
      !["admin", "administrador"].includes(role) ||
      status !== "aprobado"
    ) {
      return json(res, 403, { error: "Solo el administrador puede crear mecanicos." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { name, username, password, specialty } = body;
    const normalizedUsername = normalizeUsername(username);

    if (!name || !normalizedUsername || !password || !specialty) {
      return json(res, 400, { error: "Completa nombre, usuario, contrasena y especialidad." });
    }

    // --- ACÁ ESTÁ LA MAGIA ---
    // Leemos la especialidad para saber si es Admin 2 o trabajador
    const finalRole = (specialty === "Administracion") ? "admin2" : "trabajador";
    // -------------------------

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
          role: finalRole, // ACÁ SACAMOS LA PALABRA HARDCODEADA
          specialty
        }
      })
    });

    const created = await createResponse.json();
    let authUser = created;

    if (!createResponse.ok) {
      const createError = created.msg || created.message || "";
      const existingUser = /already|registered|exists|exist|duplicate/i.test(createError)
        ? await findAuthUserByEmail(supabaseUrl, serviceKey, email)
        : null;

      if (!existingUser?.id) {
        return json(res, createResponse.status, {
          error: createError || "No se pudo crear el usuario."
        });
      }

      const updateResponse = await supabaseFetch(supabaseUrl, serviceKey, `/auth/v1/admin/users/${existingUser.id}`, {
        method: "PUT",
        body: JSON.stringify({
          password,
          email_confirm: true,
          user_metadata: {
            name,
            username: normalizedUsername,
            role: finalRole, // ACÁ TAMBIÉN
            specialty
          }
        })
      });

      const updated = await updateResponse.json().catch(() => ({}));
      if (!updateResponse.ok) {
        return json(res, updateResponse.status, {
          error: updated.msg || updated.message || "No se pudo actualizar el usuario existente."
        });
      }

      authUser = updated;
    }

    const mechanicSession = await signInUser(supabaseUrl, anonKey, email, password);
    const existingProfileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${mechanicSession.user.id}&select=id,status`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (existingProfileResponse.ok) {
      const existingProfiles = await existingProfileResponse.json().catch(() => []);
      if (existingProfiles[0]?.id) {
        return json(res, 200, {
          ok: true,
          username: normalizedUsername
        });
      }
    }

    const profilePayload = {
      id: mechanicSession.user.id || authUser.id,
      email,
      name,
      username: normalizedUsername,
      role: finalRole, // Y ACÁ LA ESTOCADA FINAL
      status: "pendiente",
      specialty,
      created_at: new Date().toISOString()
    };

    const profileUpsert = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${mechanicSession.access_token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(profilePayload)
    });

    if (!profileUpsert.ok) {
      const profileError = await profileUpsert.json().catch(() => ({}));
      return json(res, profileUpsert.status, {
        error: profileError.message || "El usuario Auth se creo, pero fallo el perfil."
      });
    }

    const profileApproval = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${profilePayload.id}`, {
      method: "PATCH",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: "aprobado" })
    });

    if (!profileApproval.ok) {
      const approvalError = await profileApproval.json().catch(() => ({}));
      return json(res, profileApproval.status, {
        error: approvalError.message || "El usuario se creo, pero no se pudo aprobar el perfil."
      });
    }

    return json(res, 200, {
      ok: true,
      username: normalizedUsername
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Error inesperado creando usuario." });
  }
};