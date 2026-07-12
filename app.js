(function () {
  const SPECIALTY_OPTIONS = [
    { value: "mecanico-maquinaria-pesada", label: "Mecánico de maquinaria pesada" },
    { value: "electricista", label: "Electricista" },
    { value: "soldador", label: "Soldador" },
    { value: "mecanico-vehiculos-livianos", label: "Mecánico de vehículos livianos" }
  ];

  const screens = {
    auth: { id: "authScreen", title: "Acceso", label: "Inicio de sesión" },
    home: { id: "homeScreen", title: "Gestión de Flota", label: "Inicio" },
    immediate: { id: "immediateScreen", title: "Reporte inmediato", label: "Tablero" },
    tomorrow: { id: "tomorrowScreen", title: "Plan mañana", label: "Asignaciones" },
    mechanic: { id: "mechanicScreen", title: "Reporte mecánico", label: "Observaciones" },
    orders: { id: "ordersScreen", title: "Pedidos", label: "Solicitudes" },
    history: { id: "historyScreen", title: "Historial de pedidos", label: "Consulta" },
    fleet: { id: "fleetScreen", title: "Información de flota", label: "Equipos" },
    users: { id: "usersScreen", title: "Gestión de usuarios", label: "Usuarios" },
    notifications: { id: "notificationsScreen", title: "Notificaciones", label: "Avisos" }
  };

  const config = window.SUPABASE_CONFIG || {};
  const supabase = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(config.url || "https://your-project.supabase.co", config.anonKey || "your-anon-key")
    : null;

  let state = {
    currentUser: null,
    users: [],
    reports: [],
    orders: [],
    fleet: [],
    notifications: []
  };

  let activeScreen = "auth";
  let realtimeChannel = null;

  const el = {
    backBtn: document.getElementById("backBtn"),
    notifyBtn: document.getElementById("notifyBtn"),
    screenTitle: document.getElementById("screenTitle"),
    screenLabel: document.getElementById("screenLabel"),
    loginForm: document.getElementById("loginForm"),
    registerForm: document.getElementById("registerForm"),
    registerFeedback: document.getElementById("registerFeedback"),
    logoutBtn: document.getElementById("logoutBtn"),
    userInfoStrip: document.getElementById("userInfoStrip"),
    userNameDisplay: document.getElementById("userNameDisplay"),
    loginError: document.getElementById("loginError"),
    rolePill: document.getElementById("rolePill"),
    welcomeText: document.getElementById("welcomeText"),
    homeFeed: document.getElementById("homeFeed"),
    immediateForm: document.getElementById("immediateForm"),
    immediateList: document.getElementById("immediateList"),
    reportPaste: document.getElementById("reportPaste"),
    processReportBtn: document.getElementById("processReportBtn"),
    activeReportSearch: document.getElementById("activeReportSearch"),
    tomorrowList: document.getElementById("tomorrowList"),
    mechanicForm: document.getElementById("mechanicForm"),
    mechanicList: document.getElementById("mechanicList"),
    orderForm: document.getElementById("orderForm"),
    orderFilter: document.getElementById("orderFilter"),
    ordersList: document.getElementById("ordersList"),
    historyList: document.getElementById("historyList"),
    fleetForm: document.getElementById("fleetForm"),
    fleetList: document.getElementById("fleetList"),
    userForm: document.getElementById("userForm"),
    userFeedback: document.getElementById("userFeedback"),
    userFilter: document.getElementById("userFilter"),
    usersList: document.getElementById("usersList"),
    usersBtn: document.getElementById("usersBtn"),
    notificationsList: document.getElementById("notificationsList"),
    clearNotifications: document.getElementById("clearNotifications")
  };

  function uid() {
    return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function specialtyLabel(value) {
    return SPECIALTY_OPTIONS.find((option) => option.value === value)?.label || value || "Sin especialidad";
  }

  function normalizeUser(row) {
    return {
      id: row.id,
      name: row.name || "",
      username: row.username || "",
      email: row.email || "",
      role: row.role || "trabajador",
      status: row.status || "pendiente",
      specialty: row.specialty || "",
      requestedAt: row.created_at || ""
    };
  }

  function normalizeEquipment(value) {
  const text = String(value || "")
  .trim()
  .toUpperCase()
  .replace(/^T0/, "TO")
  .replace(/[_\s]+/g, "-")
  .replace(/-+/g, "-");

  const match = text.match(/^([A-Z]+)-?(\d+)$/);

  if (!match) return text;

  return `${match[1]}-${match[2]}`;
}

  function normalizeReport(row) {
    return {
      id: row.id,
      equipment: normalizeEquipment(row.equipment),
      location: row.location || "",
      deviation: row.deviation || "",
      status: row.status || "Pendiente",
      mechanicId: row.mechanic_id || null,
      createdAt: row.created_at || "",
      validatedBy: row.validated_by || "",
      operationNote: row.operation_note || "",
      operatedBy: row.operated_by || ""
    };
  }

  function normalizeOrder(row) {
    return {
      id: row.id,
      equipment: normalizeEquipment(row.equipment),
      requesterId: row.requester_id || null,
      requesterName: row.requester_name || "",
      need: row.need || "",
      status: row.status || "Pedido",
      createdAt: row.created_at || ""
    };
  }

  function normalizeFleet(row) {
    return {
      id: row.id,
      equipment: normalizeEquipment(row.equipment),
      parts: row.parts || "",
      notes: row.notes || ""
    };
  }

  function normalizeNotification(row) {
    return {
      id: row.id,
      text: row.text || "",
      at: row.created_at || "",
      read: Boolean(row.is_read)
    };
  }

  function card(title, tag, body, actions) {
    const article = document.createElement("article");
    article.className = "card";
    article.innerHTML = `
      <div class="card-head">
        <h2></h2>
        <span class="tag"></span>
      </div>
      <p class="meta"></p>
      <div class="card-actions"></div>
    `;
    article.querySelector("h2").textContent = title;
    const tagEl = article.querySelector(".tag");
    tagEl.textContent = tag;
    tagEl.classList.toggle("ok", /operativo|cerrado|aprobado/i.test(tag));
    tagEl.classList.toggle("warn", /asignado|pedido|pendiente/i.test(tag));
    tagEl.classList.toggle("danger", /pendiente/i.test(tag));
    article.querySelector(".meta").textContent = body;

    const actionBox = article.querySelector(".card-actions");
    if (!actions || !actions.length) {
      actionBox.remove();
    } else {
      for (const item of actions) actionBox.appendChild(item);
    }
    return article;
  }

  function feedCard(title, tag, body, kind) {
    const node = card(title, tag, body, []);
    node.classList.add("feed-card");
    if (kind) node.classList.add(kind);
    return node;
  }

  function button(label, className, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.className = className || "secondary";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function empty(text) {
    const node = document.createElement("div");
    node.className = "empty";
    node.textContent = text;
    return node;
  }

  function fillSelect(select, rows, options) {
    const previousValue = select.value;
    const includeAll = options && options.all;
    const placeholder = options && options.placeholder;
    select.innerHTML = "";
    if (includeAll) select.appendChild(new Option("Todos", "all"));
    if (placeholder) select.appendChild(new Option(placeholder, ""));
    for (const row of rows) select.appendChild(new Option(row.name, row.id));
    if ([...select.options].some((option) => option.value === previousValue)) {
      select.value = previousValue;
    }
  }

  function isLoggedIn() {
    return Boolean(state.currentUser);
  }

  function isAdmin() {
    return state.currentUser?.role === "admin";
  }

  function approvedWorkers() {
    return state.users.filter((user) => user.status === "aprobado" && (user.role === "trabajador" || user.role === "mecanico"));
  }

  function todayLabel() {
    return new Date().toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function setScreen(name) {
    if (name !== "auth" && !isLoggedIn()) {
      name = "auth";
    }
    activeScreen = name;
    Object.values(screens).forEach((screen) => {
      document.getElementById(screen.id).classList.remove("active");
    });
    const screen = screens[name];
    document.getElementById(screen.id).classList.add("active");
    el.screenTitle.textContent = screen.title;
    el.screenLabel.textContent = screen.label;
    el.backBtn.classList.toggle("hidden", name === "home" || name === "auth");
    el.logoutBtn.classList.toggle("hidden", name === "auth");
    render();
  }

  function renderUserControls() {
    if (!isLoggedIn()) {
      el.userInfoStrip.classList.add("hidden");
      el.logoutBtn.classList.add("hidden");
      el.notifyBtn.classList.add("hidden");
      return;
    }

    el.userInfoStrip.classList.remove("hidden");
    el.logoutBtn.classList.remove("hidden");
    el.notifyBtn.classList.remove("hidden");
    el.userNameDisplay.textContent = state.currentUser.name;
    el.rolePill.textContent = isAdmin() ? "Administrador" : "Trabajador";
    el.welcomeText.textContent = `Hola, ${state.currentUser.name}`;

    document.querySelectorAll(".admin-only").forEach((node) => {
      node.classList.toggle("admin-disabled", !isAdmin());
    });
    el.usersBtn.style.display = isAdmin() ? "block" : "none";

    document
  .getElementById("adminReportTools")
  ?.classList.toggle("hidden", !isAdmin());

    const unread = state.notifications.filter((item) => !item.read).length;
    el.notifyBtn.textContent = String(unread);
  }

  function renderHome() {
    el.homeFeed.innerHTML = "";
    const rows = [];

    state.reports
      .filter((report) => report.status !== "Operativo validado")
      .filter((report) => isAdmin() || report.mechanicId === state.currentUser.id)
      .slice(0, 4)
      .forEach((report) => {
        rows.push(feedCard(`Equipo ${report.equipment}`, report.status, `${report.location} · ${report.deviation}`, "pending"));
      });

    state.orders.slice(0, 2).forEach((order) => {
      rows.push(feedCard(`Pedido ${order.equipment}`, order.status, `${order.requesterName} pidió: ${order.need}`, "order"));
    });

    state.notifications.slice(0, 2).forEach((item) => {
      rows.push(feedCard(item.at, item.read ? "Aviso" : "Nuevo", item.text, ""));
    });

    if (!rows.length) {
      el.homeFeed.appendChild(empty("Sin novedades por ahora."));
      return;
    }

    rows.forEach((row) => el.homeFeed.appendChild(row));
  }

  function renderImmediate() {
    fillSelect(el.immediateForm.elements.mechanic, approvedWorkers(), { placeholder: "Sin asignar" });
    el.immediateList.innerHTML = "";
    if (!state.reports.length) {
      el.immediateList.appendChild(empty("Todavía no hay reportes inmediatos."));
      return;
    }

    const search = normalizeEquipment(
  el.activeReportSearch?.value || ""
).toLowerCase();

const filteredReports = state.reports.filter((report) => {
  if (!search) return true;

  return (
    report.equipment?.toLowerCase().includes(search) ||
    report.location?.toLowerCase().includes(search) ||
    report.deviation?.toLowerCase().includes(search)
  );
});

filteredReports.forEach((report) => {
      const mechanic = state.users.find((user) => user.id === report.mechanicId);
      const actions = [];
      if (isAdmin()) {
        actions.push(button("Asignar", "secondary", async () => {
          const names = approvedWorkers().map((user, index) => `${index + 1}. ${user.name}`).join("\n");
          const choice = prompt(`Elegir trabajador:\n${names}`);
          if (choice === null) return;
          const selected = approvedWorkers()[Number(choice) - 1];
          if (!selected) return;
          await updateReport(report.id, { mechanic_id: selected.id, status: "Asignado" });
          await createNotification(`${report.equipment} asignado a ${selected.name}`);
          await refreshAllData();
        }));
        actions.push(button("Validar operativo", "ok", async () => {
          await updateReport(report.id, { status: "Operativo validado", validated_by: state.currentUser.name });
          await createNotification(`${report.equipment} validado operativo por ${state.currentUser.name}`);
          await refreshAllData();
        }));
        actions.push(button("Eliminar", "danger", async () => {
          await supabase.from("reports").delete().eq("id", report.id);
          await refreshAllData();
        }));
      }
      el.immediateList.appendChild(card(report.equipment, report.status, `${report.location} · ${report.deviation} · Trabajador: ${mechanic ? mechanic.name : "sin asignar"}`, actions));
    });
  }

  function renderTomorrow() {
    el.tomorrowList.innerHTML = "";
    const assignments = state.reports.filter((report) => {
      if (report.status === "Operativo validado") return false;
      return isAdmin() || report.mechanicId === state.currentUser.id;
    });

    if (!assignments.length) {
      el.tomorrowList.appendChild(empty("No hay asignaciones para mostrar."));
      return;
    }

    assignments.forEach((report) => {
      const actions = [
        button("Marcar operativo", "ok", async () => {
          const description = prompt("Descripción del trabajo realizado:");
          if (description === null) return;
          await updateReport(report.id, {
            status: "Operativo informado",
            operation_note: description.trim(),
            operated_by: state.currentUser.name
          });
          await createNotification(`${report.equipment} informado operativo por ${state.currentUser.name}`);
          await refreshAllData();
        })
      ];
      if (isAdmin()) {
        actions.push(button("Validar", "primary", async () => {
          await updateReport(report.id, { status: "Operativo validado", validated_by: state.currentUser.name });
          await createNotification(`${report.equipment} validado operativo`);
          await refreshAllData();
        }));
      }
      el.tomorrowList.appendChild(card(report.equipment, report.status, `${report.location} · ${report.deviation}${report.operationNote ? " · " + report.operationNote : ""}`, actions));
    });
  }

  function renderMechanicReports() {
    el.mechanicList.innerHTML = "";
    const rows = isAdmin()
      ? state.reports.filter((row) => row.id)
      : state.reports.filter((row) => row.id);
    if (!rows.length) {
      el.mechanicList.appendChild(empty("No hay observaciones cargadas."));
      return;
    }
    rows.forEach((row) => {
      el.mechanicList.appendChild(card(row.equipment, row.status, `${row.deviation} · ${row.operationNote || "sin detalle"}`, []));
    });
  }

  function renderOrders() {
    fillSelect(el.orderForm.elements.requester, approvedWorkers());
    fillSelect(el.orderFilter, approvedWorkers(), { all: true });
    const selected = el.orderFilter.value || "all";
    el.ordersList.innerHTML = "";
    const rows = state.orders.filter((order) => selected === "all" || order.requesterId === selected);
    if (!rows.length) {
      el.ordersList.appendChild(empty("No hay pedidos cargados."));
      return;
    }
    rows.forEach((order) => {
      const actions = [];
      if (isAdmin()) {
        actions.push(button(order.status === "Cerrado" ? "Reabrir" : "Cerrar", "secondary", async () => {
          await supabase.from("orders").update({ status: order.status === "Cerrado" ? "Pedido" : "Cerrado" }).eq("id", order.id);
          await refreshAllData();
        }));
      }
      el.ordersList.appendChild(card(order.equipment, order.status, `${order.requesterName} pidió: ${order.need}`, actions));
    });
  }

  function renderHistory() {
    el.historyList.innerHTML = "";
    if (!state.orders.length) {
      el.historyList.appendChild(empty("El historial está vacío."));
      return;
    }
    state.orders.forEach((order) => {
      el.historyList.appendChild(card(order.equipment, order.status, `${order.requesterName} hizo un pedido el ${order.createdAt}`, []));
    });
  }

  function renderFleet() {
    el.fleetList.innerHTML = "";
    if (!state.fleet.length) {
      el.fleetList.appendChild(empty("No hay equipos cargados."));
      return;
    }
    state.fleet.forEach((item) => {
      const actions = [];
      if (isAdmin()) {
        actions.push(button("Eliminar", "danger", async () => {
          await supabase.from("fleet_items").delete().eq("id", item.id);
          await refreshAllData();
        }));
      }
      el.fleetList.appendChild(card(item.equipment, "Flota", `${item.parts}${item.notes ? " · " + item.notes : ""}`, actions));
    });
  }

  function renderUsers() {
    el.usersList.innerHTML = "";
    const selectedSpecialty = el.userFilter.value || "all";
    const visibleUsers = state.users.filter((user) => selectedSpecialty === "all" || user.specialty === selectedSpecialty);

    if (!visibleUsers.length) {
      el.usersList.appendChild(empty("No hay usuarios para mostrar con ese filtro."));
      return;
    }

    visibleUsers.forEach((user) => {
      const actions = [];
      if (isAdmin() && user.id !== state.currentUser.id) {
        if (user.status === "pendiente") {
          actions.push(button("Aprobar", "primary", async () => {
            await supabase.from("profiles").update({ status: "aprobado" }).eq("id", user.id);
            await createNotification(`Cuenta aprobada para ${user.name}`);
            await refreshAllData();
          }));
          actions.push(button("Rechazar", "danger", async () => {
            await supabase.from("profiles").update({ status: "rechazado" }).eq("id", user.id);
            await refreshAllData();
          }));
        }
        if (user.status !== "pendiente") {
          actions.push(button("Eliminar", "danger", async () => {
            await supabase.from("profiles").delete().eq("id", user.id);
            await refreshAllData();
          }));
        }
      }
      const roleLabel = user.role === "admin" ? "Administrador" : "Trabajador";
      const statusLabel = user.status === "pendiente" ? "Pendiente" : user.status === "aprobado" ? "Aprobado" : user.status === "rechazado" ? "Rechazado" : "Aprobado";
      const details = `Usuario: ${user.username} · Especialidad: ${specialtyLabel(user.specialty)} · Estado: ${statusLabel}`;
      el.usersList.appendChild(card(user.name, roleLabel, details, actions));
    });
  }

  function renderNotifications() {
    el.notificationsList.innerHTML = "";
    if (!state.notifications.length) {
      el.notificationsList.appendChild(empty("No hay notificaciones."));
      return;
    }
    state.notifications.forEach((item) => {
      el.notificationsList.appendChild(card(item.at, item.read ? "Leída" : "Nueva", item.text, []));
    });
  }

  function render() {
    renderUserControls();
    if (!isLoggedIn()) {
      el.loginError.textContent = "";
      el.userInfoStrip.classList.add("hidden");
      el.logoutBtn.classList.add("hidden");
      el.notifyBtn.classList.add("hidden");
      return;
    }
    renderHome();
    renderImmediate();
    renderTomorrow();
    renderMechanicReports();
    renderOrders();
    renderHistory();
    renderFleet();
    renderUsers();
    renderNotifications();
  }

  function populateUserFilter() {
    const options = SPECIALTY_OPTIONS.map((option) => ({ id: option.value, name: option.label }));
    fillSelect(el.userFilter, options, { all: true });
  }

  async function refreshAllData() {
    if (!supabase) return;
    const [profiles, reports, orders, fleet, notifications] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("reports").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("fleet_items").select("*").order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false })
    ]);

    state.users = (profiles.data || []).map(normalizeUser);
    state.reports = (reports.data || []).map(normalizeReport);
    state.orders = (orders.data || []).map(normalizeOrder);
    state.fleet = (fleet.data || []).map(normalizeFleet);
    state.notifications = (notifications.data || []).map(normalizeNotification);

    if (state.currentUser) {
      const freshProfile = state.users.find((user) => user.id === state.currentUser.id);
      if (freshProfile) state.currentUser = freshProfile;
    }
    render();
  }

  async function loadCurrentUser(userId) {
    if (!supabase || !userId) return;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!error && data) {
      state.currentUser = normalizeUser(data);
    }
  }

  async function createNotification(text) {
    if (!supabase || !state.currentUser) return;
    await supabase.from("notifications").insert({
      id: uid(),
      text,
      is_read: false,
      created_by: state.currentUser.id
    });
  }

  async function updateReport(id, updates) {
    if (!supabase) return;
    await supabase.from("reports").update(updates).eq("id", id);
  }

  async function initializeApp() {
    if (!supabase) {
      el.loginError.textContent = "Falta cargar Supabase. Revisá supabase-config.js.";
      setScreen("auth");
      return;
    }

    if (!config.url || !config.anonKey || config.url.includes("your-project") || config.anonKey.includes("your-anon")) {
      el.loginError.textContent = "Configurá los valores de Supabase en supabase-config.js antes de usar la app.";
      setScreen("auth");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadCurrentUser(session.user.id);
    }
    await refreshAllData();
    setScreen(state.currentUser ? "home" : "auth");

    realtimeChannel = supabase.channel("fleet-realtime");
    realtimeChannel
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "fleet_items" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => refreshAllData())
      .subscribe();
  }

  document.querySelectorAll("[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => setScreen(btn.dataset.screen));
  });

  el.backBtn.addEventListener("click", () => setScreen("home"));
  el.notifyBtn.addEventListener("click", () => setScreen("notifications"));
  el.usersBtn.addEventListener("click", () => setScreen("users"));

  el.immediateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentUser) return;
    const form = new FormData(el.immediateForm);
    const report = {
      id: uid(),
      equipment: normalizeEquipment(form.get("equipment")),
      location: form.get("location").trim(),
      deviation: form.get("deviation").trim(),
      status: form.get("status") || "Pendiente",
      mechanic_id: form.get("mechanic") || null,
      created_at: new Date().toISOString(),
      created_by: state.currentUser.id
    };
    await supabase.from("reports").insert(report);
    await createNotification(`Nuevo reporte: ${report.equipment}`);
    await refreshAllData();
    el.immediateForm.reset();
    el.reportPaste.value = "";
  });

  el.processReportBtn?.addEventListener("click", () => {
  const texto = el.reportPaste.value.trim();

  if (!texto) {
    alert("Pegá primero un reporte.");
    return;
  }

  // 1. DETECTAR INTERNO
  const internoEncontrado = texto.match(
    /\b(MN|TO|T0|CF|PR|RE|CT|CV|CR|CA|RN|RV|SB|ST|CC|CP|GE|CM|TP|CB|PL|CCH)[\s_-]*\d{1,3}\b/i
  );

  if (!internoEncontrado) {
    alert("No pude encontrar el interno en el reporte.");
    return;
  }

  const interno = normalizeEquipment(internoEncontrado[0]);

  // 2. DETECTAR UBICACIÓN
  const ubicacionEncontrada = texto.match(
    /ubicaci[oó]n\s*:?\s*([^\n\r]+)/i
  );

  const ubicacion = ubicacionEncontrada
    ? ubicacionEncontrada[1].trim().replace(/[.,]+$/, "")
    : "";

  // 3. DETECTAR FALLA O DESVÍO
  const fallaEncontrada = texto.match(
    /(?:falla(?:\s+detectada)?|desv[ií]o)\s*:?\s*([\s\S]*?)(?=\n\s*(?:estado|obs\.?|observaci[oó]n|adjuntar)\s*:|$)/i
  );

  const falla = fallaEncontrada
    ? fallaEncontrada[1]
        .trim()
        .split(/\r?\n/)
        .map((linea) => linea.trim())
        .filter(Boolean)
        .join(" - ")
    : "";

  // 4. DETECTAR ESTADO
  const textoMayuscula = texto.toUpperCase();

  let estado = "";

  if (
    textoMayuscula.includes("FUERA DE SERVICIO") ||
    textoMayuscula.includes("PARADO") ||
    /\bFS\b/.test(textoMayuscula)
  ) {
    estado = "FS";
  } else if (
    textoMayuscula.includes("OPERATIVO CON OBS") ||
    textoMayuscula.includes("OPERATIVA CON OBS") ||
    textoMayuscula.includes("CON OBSERVACIONES") ||
    textoMayuscula.includes("CON OBSERVACION") ||
    textoMayuscula.includes("CON PRECAUCIONES") ||
    textoMayuscula.includes("ANDANDO CON OBSERVACIONES") ||
    textoMayuscula.includes("OPERATIVO") ||
    textoMayuscula.includes("OPERATIVA") ||
    /\bOBS\b/.test(textoMayuscula)
  ) {
    estado = "OBS";
  }

  // 5. COMPLETAR LA CARGA MANUAL
  el.immediateForm.elements.equipment.value = interno;
  el.immediateForm.elements.location.value = ubicacion;
  el.immediateForm.elements.deviation.value = falla;

  if (estado) {
    el.immediateForm.elements.status.value = estado;
  }

  const faltantes = [];

if (!interno) faltantes.push("interno");
if (!ubicacion) faltantes.push("ubicación");
if (!falla) faltantes.push("falla");
if (!estado) faltantes.push("estado");

if (faltantes.length) {
  alert(
    `No pude identificar: ${faltantes.join(", ")}.\n` +
    "Completá o corregí esos datos y tocá Guardar reporte."
  );
  return;
}

el.immediateForm.requestSubmit();

});

  el.mechanicForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentUser) return;
    const form = new FormData(el.mechanicForm);
    await supabase.from("reports").insert({
      id: uid(),
      equipment: form.get("equipment").trim(),
      deviation: form.get("deviation").trim(),
      operation_note: form.get("notes").trim(),
      status: "Pendiente",
      created_at: new Date().toISOString(),
      created_by: state.currentUser.id
    });
    await refreshAllData();
    el.mechanicForm.reset();
  });

  el.orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentUser) return;
    const form = new FormData(el.orderForm);
    const requester = state.users.find((user) => user.id === form.get("requester"));
    await supabase.from("orders").insert({
      id: uid(),
      equipment: form.get("equipment").trim(),
      requester_id: requester?.id || state.currentUser.id,
      requester_name: requester?.name || state.currentUser.name,
      need: form.get("need").trim(),
      status: "Pedido",
      created_at: new Date().toISOString()
    });
    await createNotification(`Nuevo pedido cargado por ${requester?.name || state.currentUser.name}`);
    await refreshAllData();
    el.orderForm.reset();
  });

  el.orderFilter.addEventListener("change", renderOrders);
  el.userFilter.addEventListener("change", renderUsers);

  el.fleetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentUser) return;
    const form = new FormData(el.fleetForm);
    await supabase.from("fleet_items").insert({
      id: uid(),
      equipment: form.get("equipment").trim(),
      parts: form.get("parts").trim(),
      notes: form.get("notes").trim(),
      created_at: new Date().toISOString()
    });
    await refreshAllData();
    el.fleetForm.reset();
  });

  el.userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(el.userForm);
    const name = form.get("name").trim();
    const username = form.get("username").trim();
    const password = form.get("password").trim();
    const specialty = form.get("specialty").trim();

    if (!name || !username || !password || !specialty) {
      el.userFeedback.textContent = "Completá todos los campos.";
      return;
    }

    const email = username
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ".") + "@gmail.com";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          username,
          role: "trabajador",
          specialty
        }
      }
    });

    if (error) {
      el.userFeedback.textContent = error.message;
      return;
    }

    const userId = data?.user?.id || data?.session?.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({
        id: userId,
        email,
        name,
        username,
        role: "trabajador",
        status: "pendiente",
        specialty,
        created_at: new Date().toISOString()
      });
    }

    el.userFeedback.textContent = "Solicitud enviada. El administrador podrá aprobarla o rechazarla.";
    el.userForm.reset();
    await refreshAllData();
  });

  el.clearNotifications.addEventListener("click", async () => {
    if (!supabase) return;
    await supabase.from("notifications").delete().gte("id", "");
    await refreshAllData();
  });

  el.logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    state.currentUser = null;
    setScreen("auth");
  });

  el.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(el.loginForm);
    const usuario = form.get("email").trim().toLowerCase();

    const email = usuario.includes("@")
  ? usuario
  : usuario.replace(/\s+/g, ".") + "@gestion-flota.local";
    const password = form.get("password").trim();

    if (!usuario || !password) {
  el.loginError.textContent = "Ingresá usuario y contraseña.";
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      el.loginError.textContent = "Usuario o contraseña incorrectos.";
      return;
    }

    await loadCurrentUser(data.user.id);
    if (!state.currentUser || state.currentUser.status !== "aprobado") {
      el.loginError.textContent = "Tu cuenta está pendiente de aprobación.";
      await supabase.auth.signOut();
      state.currentUser = null;
      return;
    }

    await refreshAllData();
    el.loginError.textContent = "";
    setScreen("home");
  });

  el.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(el.registerForm);
    const name = form.get("name").trim();
    const username = form.get("username").trim();
    const password = form.get("password").trim();
    const specialty = form.get("specialty").trim();
    const email = username
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ".") + "@gestion-flota.local";

    if (!name || !username || !password || !specialty || !email) {
      el.registerFeedback.textContent = "Completá todos los campos para solicitar la cuenta.";
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          username,
          role: "trabajador",
          specialty
        }
      }
    });

    if (error) {
      el.registerFeedback.textContent = error.message;
      return;
    }

    const userId = data?.user?.id || data?.session?.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({
        id: userId,
        email,
        name,
        username,
        role: "trabajador",
        status: "pendiente",
        specialty,
        created_at: new Date().toISOString()
      });
      
    }

    el.registerFeedback.textContent = "Solicitud enviada. El administrador deberá aprobarla.";
    el.registerForm.reset();
    await refreshAllData();
  });

  el.activeReportSearch?.addEventListener("input", () => {
  renderImmediate();
});

  populateUserFilter();
  initializeApp();
})();
