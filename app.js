(function () {
  const SPECIALTY_OPTIONS = [
    { value: "mecanico-maquinaria-pesada", label: "Mecánico de maquinaria pesada" },
    { value: "electricista", label: "Electricista" },
    { value: "soldador", label: "Soldador" },
    { value: "mecanico-vehiculos-livianos", label: "Mecánico de vehículos livianos" }
  ];

  const EQUIPMENT_PREFIXES = ["MN", "TO", "TP", "CF", "PR", "RE", "CT", "CV", "CR", "CA", "RN", "RV", "SB", "ST", "CC", "CP", "GE", "CM", "CB", "PL", "CCH"];

  const screens = {
    auth: { id: "authScreen", title: "Acceso", label: "Inicio de sesión" },
    home: { id: "homeScreen", title: "Gestión de Flota", label: "Inicio" },
    immediate: { id: "immediateScreen", title: "Reporte inmediato", label: "Tablero" },
    myJobs: { id: "myJobsScreen", title: "Mis trabajos", label: "Asignados" },
    tomorrow: { id: "tomorrowScreen", title: "Plan mañana", label: "Plan completo" },
    mechanic: { id: "mechanicScreen", title: "Reporte mecánico", label: "Observaciones" },
    orders: { id: "ordersScreen", title: "Pedidos", label: "Solicitudes" },
    history: { id: "historyScreen", title: "Historial de pedidos", label: "Consulta" },
    fleet: { id: "fleetScreen", title: "Información de flota", label: "Equipos" },
    operatives: { id: "operativesScreen", title: "Operativos", label: "Validado" },
    panel: { id: "panelScreen", title: "Panel", label: "Control" },
    validations: { id: "validationsScreen", title: "Validaciones pendientes", label: "Revisión" },
    users: { id: "usersScreen", title: "Gestión de Mecánicos", label: "Mecánicos" },
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
    notifications: [],
    availability: [],
    planDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  };

  let activeScreen = "auth";
  let realtimeChannel = null;

  const el = {
    backBtn: document.getElementById("backBtn"),
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
    immediateForm: document.getElementById("immediateForm"),
    immediateList: document.getElementById("immediateList"),
    reportPaste: document.getElementById("reportPaste"),
    processReportBtn: document.getElementById("processReportBtn"),
    activeReportSearch: document.getElementById("activeReportSearch"),
    planDate: document.getElementById("planDate"),
    refreshPlanBtn: document.getElementById("refreshPlanBtn"),
    copyPlanBtn: document.getElementById("copyPlanBtn"),
    availabilityList: document.getElementById("availabilityList"),
    tomorrowList: document.getElementById("tomorrowList"),
    myJobsList: document.getElementById("myJobsList"),
    mechanicForm: document.getElementById("mechanicForm"),
    mechanicList: document.getElementById("mechanicList"),
    orderForm: document.getElementById("orderForm"),
    orderFilter: document.getElementById("orderFilter"),
    ordersList: document.getElementById("ordersList"),
    historyList: document.getElementById("historyList"),
    fleetForm: document.getElementById("fleetForm"),
    fleetList: document.getElementById("fleetList"),
    operativesList: document.getElementById("operativesList"),
    panelStats: document.getElementById("panelStats"),
    panelActivity: document.getElementById("panelActivity"),
    validationsList: document.getElementById("validationsList"),
    userForm: document.getElementById("userForm"),
    userFeedback: document.getElementById("userFeedback"),
    userFilter: document.getElementById("userFilter"),
    usersList: document.getElementById("usersList"),
    usersBtn: document.getElementById("usersBtn"),
    notificationsList: document.getElementById("notificationsList"),
    clearNotifications: document.getElementById("clearNotifications"),
    modalRoot: document.getElementById("modalRoot"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalActions: document.getElementById("modalActions"),
    toast: document.getElementById("toast")
  };

  function uid() {
    return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function specialtyLabel(value) {
    return SPECIALTY_OPTIONS.find((option) => option.value === value)?.label || value || "Sin especialidad";
  }

  function normalizeUser(row) {
    const storedStatus = row.status || "pendiente";
    const appStatus = storedStatus === "pendiente" && row.role === "trabajador" && row.specialty ? "aprobado" : storedStatus;
    return {
      id: row.id,
      name: row.name || "",
      username: row.username || "",
      email: row.email || "",
      role: row.role || "trabajador",
      status: appStatus,
      accountStatus: row.account_status || (appStatus === "rechazado" ? "inactivo" : "activo"),
      specialty: row.specialty || "",
      requestedAt: row.created_at || ""
    };
  }

  function userToEmail(value) {
    const username = String(value || "").trim().toLowerCase();
    if (username.includes("@")) return username;
    const normalized = username
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s._-]/g, "")
      .replace(/[_-]+/g, " ")
      .trim()
      .replace(/\s+/g, ".")
      .replace(/\.+/g, ".");
    return `marianorodriguez506+${normalized}@gmail.com`;
  }

  function normalizeEquipment(value) {
    const text = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/^T0/, "TO")
      .replace(/[_\s]+/g, "-")
      .replace(/-+/g, "-");

    const match = text.match(/^([A-Z]+)-?(\d{1,4})$/);
    if (!match) return text;

    const prefix = match[1] === "T0" ? "TO" : match[1];
    if (!EQUIPMENT_PREFIXES.includes(prefix)) return text;
    return `${prefix}-${match[2]}`;
  }

  function normalizeReport(row) {
    return {
      id: row.id,
      equipment: normalizeEquipment(row.equipment),
      location: row.location || "",
      deviation: row.deviation || "",
      status: row.status || "Pendiente",
      mechanicId: row.mechanic_id || null,
      planDate: row.plan_date || "",
      hourmeter: row.hourmeter || "",
      previousStatus: row.previous_status || "",
      repairNote: row.repair_note || row.operation_note || "",
      repairedBy: row.repaired_by || row.operated_by || "",
      repairedAt: row.repaired_at || "",
      createdAt: row.created_at || "",
      createdBy: row.created_by || "",
      validatedBy: row.validated_by || "",
      validatedAt: row.validated_at || "",
      operationNote: row.operation_note || "",
      operatedBy: row.operated_by || ""
    };
  }

  function mergeReportUpdate(reportId, row, fallback = {}) {
    if (!row && !fallback) return;
    const normalized = row ? normalizeReport(row) : null;
    state.reports = state.reports.map((item) => {
      if (item.id !== reportId) return item;
      return {
        ...item,
        ...(normalized || {}),
        ...fallback
      };
    });
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

  function normalizeAvailability(row) {
    return {
      id: row.id || `${row.worker_id}-${row.date}`,
      workerId: row.worker_id,
      date: row.date,
      status: row.status || "disponible"
    };
  }

  function activeReports() {
    return state.reports.filter((report) => report.status !== "Operativo validado" && !isTechnicalObservation(report));
  }

  function isTechnicalObservation(report) {
    return /observaci[oó]n t[eé]cnica/i.test(report.status || "") && !report.mechanicId;
  }

  function displayStatus(status) {
    if (isOperativeInformedStatus(status)) return "Operativo informado";
    if (/^OBS$/i.test(status) || /observ/i.test(status)) return "OBS";
    if (/^FS$/i.test(status) || /fuera/i.test(status)) return "FS";
    if (/asignado/i.test(status)) return "FS";
    return status || "FS";
  }

  function isOperativeInformedStatus(status) {
    return /^PV$/i.test(status || "") || /pendiente de valid|operativo informado/i.test(status || "");
  }

  function workerAvailability(workerId, date = state.planDate) {
    return state.availability.find((row) => row.workerId === workerId && row.date === date)?.status || "disponible";
  }

  function workerName(workerId) {
    return state.users.find((user) => user.id === workerId)?.name || "Sin asignar";
  }

  function planReports() {
    return uniqueReports(activeReports().filter((report) => report.mechanicId && isReportInSelectedPlan(report)));
  }

  function uniqueReports(rows) {
    return [...new Map(rows.map((report) => [report.id, report])).values()];
  }

  function isReportInSelectedPlan(report) {
    return !report.planDate || report.planDate === state.planDate;
  }

  function myReports() {
    if (!state.currentUser) return [];
    return activeReports().filter((report) => report.mechanicId === state.currentUser.id);
  }

  function visibleActiveReports() {
    return activeReports();
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  }

  function formatShortDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  }

  function reportAgeDays(report) {
    const date = new Date(report.createdAt);
    if (Number.isNaN(date.getTime())) return 0;
    const reported = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.floor((today - reported) / 86400000));
  }

  function reportAgeClass(days) {
    if (days >= 7) return "danger";
    if (days >= 3) return "warn";
    return "ok";
  }

  function normalizeLocationText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function groupLocation(report) {
    const location = normalizeLocationText(report.location);
    if (!location) return "SIN UBICACIÓN";
    const compact = location.replace(/\s+/g, "");
    if (compact.startsWith("AMO30")) return "AMO 30";
    if (compact.startsWith("LC344")) return "LC 344";
    if (compact.startsWith("FDP")) return "FDP";
    return location;
  }

  function reportLine(report) {
    const mechanic = workerName(report.mechanicId);
    const hourmeter = report.hourmeter ? ` · Horómetro: ${report.hourmeter}` : "";
    const repair = report.repairNote ? ` · Reparación: ${report.repairNote}` : "";
    return `${report.location || "Sin ubicación"} · ${report.deviation || "Sin falla"} · Mecánico: ${mechanic} · Fecha: ${report.planDate || state.planDate}${hourmeter}${repair}`;
  }

  function reportMeta(report) {
    const text = report.operationNote || "";
    const priority = text.match(/Prioridad:\s*([^|]+)/i)?.[1]?.trim() || (/^FS$/i.test(report.status) ? "Alta" : "Media");
    const notes = text.match(/Observaciones:\s*([^|]+)/i)?.[1]?.trim() || "";
    return { priority, notes };
  }

  function relatedOrders(equipment) {
    return state.orders.filter((order) => normalizeEquipment(order.equipment) === normalizeEquipment(equipment));
  }

  function relatedReports(equipment) {
    return state.reports.filter((report) => normalizeEquipment(report.equipment) === normalizeEquipment(equipment));
  }

  function fleetItem(equipment) {
    return state.fleet.find((item) => normalizeEquipment(item.equipment) === normalizeEquipment(equipment));
  }

  function openInfoModal(title, rows) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = "";
    el.modalActions.innerHTML = "";
    el.modalRoot.classList.remove("hidden");
    el.modalRoot.setAttribute("aria-hidden", "false");

    const list = document.createElement("div");
    list.className = "detail-list";
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "detail-row";
      item.innerHTML = `<strong></strong><span></span>`;
      item.querySelector("strong").textContent = row.label;
      item.querySelector("span").textContent = row.value || "Sin dato";
      list.appendChild(item);
    });
    el.modalBody.appendChild(list);
    el.modalActions.appendChild(button("Cerrar", "secondary", closeModal));
  }

  function showReportDetails(report) {
    const meta = reportMeta(report);
    const fleet = fleetItem(report.equipment);
    const orders = relatedOrders(report.equipment);
    const history = relatedReports(report.equipment);
    openInfoModal(`Detalle ${report.equipment}`, [
      { label: "Interno", value: report.equipment },
      { label: "Tipo / piezas", value: fleet?.parts },
      { label: "Ubicación", value: report.location },
      { label: "Falla / desvío", value: report.deviation },
      { label: "Estado", value: displayStatus(report.status) },
      { label: "Prioridad", value: meta.priority },
      { label: "Horómetro / km", value: report.hourmeter },
      { label: "Mecánico asignado", value: workerName(report.mechanicId) },
      { label: "Fecha del reporte", value: formatDateTime(report.createdAt) },
      { label: "Observaciones", value: meta.notes || report.operationNote },
      { label: "Reparación informada", value: report.repairNote },
      { label: "Reparó", value: report.repairedBy || report.operatedBy },
      { label: "Fecha reparación", value: formatDateTime(report.repairedAt) },
      { label: "Validó", value: report.validatedBy },
      { label: "Fecha validación", value: formatDateTime(report.validatedAt) },
      { label: "Pedidos relacionados", value: orders.length ? orders.map((order) => `${order.status}: ${order.need}`).join(" / ") : "" },
      { label: "Historial del equipo", value: history.length ? `${history.length} movimientos registrados` : "" },
      { label: "Ficha de flota", value: fleet ? `${fleet.parts}${fleet.notes ? " · " + fleet.notes : ""}` : "" }
    ]);
  }

  function showReportMenu(report, actions) {
    const mechanic = state.users.find((user) => user.id === report.mechanicId);
    const days = reportAgeDays(report);
    openInfoModal(report.equipment, [
      { label: "Estado", value: displayStatus(report.status) },
      { label: "Ubicación", value: report.location },
      { label: "Falla", value: report.deviation },
      { label: "Mecánico", value: mechanic ? mechanic.name : "Sin asignar" },
      { label: "Fecha", value: formatDateTime(report.createdAt) },
      { label: "Días", value: `${days}` }
    ]);
    el.modalActions.innerHTML = "";
    actions.forEach((action) => {
      if (action instanceof HTMLElement) {
        el.modalActions.appendChild(action);
        return;
      }
      el.modalActions.appendChild(button(action.label, action.className, async () => {
        closeModal();
        await action.onClick();
      }));
    });
    el.modalActions.appendChild(button("Cerrar", "secondary", closeModal));
  }

  function menuAction(label, className, onClick) {
    return { label, className, onClick };
  }

  function compactReportRow(report, actions, quickActions) {
    const mechanic = state.users.find((user) => user.id === report.mechanicId);
    const days = reportAgeDays(report);
    const row = document.createElement("article");
    row.className = "report-row";
    row.innerHTML = `
      <div class="report-main">
        <strong></strong>
        <span class="report-status"></span>
        <span class="age-pill"></span>
      </div>
      <div class="report-summary">
        <span class="report-failure"></span>
        <span class="report-mechanic"></span>
      </div>
      <div class="report-row-actions">
        <button type="button" class="secondary compact-more">Más</button>
      </div>
    `;
    row.querySelector("strong").textContent = report.equipment;
    row.querySelector(".report-status").textContent = displayStatus(report.status);
    const age = row.querySelector(".age-pill");
    age.textContent = `${days} d`;
    age.classList.add(reportAgeClass(days));
    row.querySelector(".report-failure").textContent = `${formatShortDate(report.createdAt)} · ${report.deviation || "Sin falla"}`;
    row.querySelector(".report-mechanic").textContent = mechanic ? mechanic.name : "Sin asignar";
    const actionBox = row.querySelector(".report-row-actions");
    (quickActions || []).forEach((action) => actionBox.insertBefore(action, actionBox.firstChild));
    row.querySelector(".compact-more").addEventListener("click", () => showReportMenu(report, actions));
    return row;
  }

  function reportGroup(title, rows) {
    const section = document.createElement("section");
    section.className = "report-group";
    section.innerHTML = `
      <div class="report-group-head">
        <h2></h2>
        <span></span>
      </div>
      <div class="report-table"></div>
    `;
    section.querySelector("h2").textContent = title;
    section.querySelector("span").textContent = `${rows.length}`;
    const table = section.querySelector(".report-table");
    rows.forEach((row) => table.appendChild(row));
    return section;
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    showToast("No pude copiar automáticamente en este navegador.");
    return false;
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

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      el.toast.classList.add("hidden");
      el.toast.textContent = "";
    }, 2600);
  }

  function closeModal() {
    if (!el.modalRoot) return;
    el.modalRoot.classList.add("hidden");
    el.modalRoot.setAttribute("aria-hidden", "true");
    el.modalTitle.textContent = "";
    el.modalBody.innerHTML = "";
    el.modalActions.innerHTML = "";
  }

  function openChoiceModal(title, rows, renderRow, emptyText) {
    return new Promise((resolve) => {
      el.modalTitle.textContent = title;
      el.modalBody.innerHTML = "";
      el.modalActions.innerHTML = "";
      el.modalRoot.classList.remove("hidden");
      el.modalRoot.setAttribute("aria-hidden", "false");

      const list = document.createElement("div");
      list.className = "modal-list";
      if (!rows.length) {
        list.appendChild(empty(emptyText || "No hay opciones disponibles."));
      }
      rows.forEach((row) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.innerHTML = renderRow(row);
        btn.addEventListener("click", () => {
          closeModal();
          resolve(row);
        });
        list.appendChild(btn);
      });
      el.modalBody.appendChild(list);

      const cancel = button("Cancelar", "secondary", () => {
        closeModal();
        resolve(null);
      });
      el.modalActions.appendChild(cancel);
    });
  }

  function openTextModal(title, placeholder) {
    return new Promise((resolve) => {
      el.modalTitle.textContent = title;
      el.modalBody.innerHTML = "";
      el.modalActions.innerHTML = "";
      el.modalRoot.classList.remove("hidden");
      el.modalRoot.setAttribute("aria-hidden", "false");

      const textarea = document.createElement("textarea");
      textarea.placeholder = placeholder || "";
      el.modalBody.appendChild(textarea);

      el.modalActions.appendChild(button("Cancelar", "secondary", () => {
        closeModal();
        resolve(null);
      }));
      el.modalActions.appendChild(button("Guardar", "primary", () => {
        const value = textarea.value.trim();
        closeModal();
        resolve(value);
      }));
      textarea.focus();
    });
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
    return state.users.filter((user) => user.status === "aprobado" && user.accountStatus !== "inactivo" && (user.role === "trabajador" || user.role === "mecanico"));
  }

  async function assignReportToWorker(report, worker) {
    const planDate = state.planDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    let updated = null;
    try {
      updated = await updateReport(report.id, { mechanic_id: worker.id, plan_date: planDate });
    } catch (error) {
      if (!String(error.message || "").includes("plan_date")) throw error;
      updated = await updateReport(report.id, { mechanic_id: worker.id });
    }

    if (!updated || String(updated.mechanic_id || "") !== String(worker.id)) {
      showToast("No se pudo confirmar la asignación. Volvé a intentar.");
      return;
    }

    mergeReportUpdate(report.id, updated, { mechanicId: worker.id, planDate });
    renderImmediate();
    renderTomorrow();
    renderMyJobs();
    await createNotification(`${report.equipment} asignado a ${worker.name}`);
    showToast(`${report.equipment} asignado a ${worker.name}`);
    await refreshAllData();
  }

  async function chooseMechanicForReport(report) {
    const selected = await openChoiceModal(
      "Asignar mecánico",
      approvedWorkers(),
      (worker) => `
        <strong>${worker.name}</strong>
        <span>${specialtyLabel(worker.specialty)} · ${workerAvailability(worker.id) === "franco" ? "Franco" : "Disponible"}</span>
      `,
      "No hay mecánicos activos."
    );
    if (selected) await assignReportToWorker(report, selected);
  }

  async function chooseReportForWorker(worker) {
    const rows = activeReports().filter((report) => !(report.mechanicId === worker.id && isReportInSelectedPlan(report)));
    const selected = await openChoiceModal(
      `Agregar equipo a ${worker.name}`,
      rows,
      (report) => `
        <strong>${report.equipment}</strong>
        <span>${report.location || "Sin ubicación"} · ${report.deviation || "Sin falla"} · ${displayStatus(report.status)}${report.mechanicId ? ` · Asignado a ${workerName(report.mechanicId)}` : ""}</span>
      `,
      "No hay reportes activos para asignar."
    );
    if (selected) await assignReportToWorker(selected, worker);
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
    if (isLoggedIn() && isAdmin() && name === "myJobs") {
      name = "home";
    }
    if (isLoggedIn() && !isAdmin() && ["panel", "validations", "operatives", "users"].includes(name)) {
      name = "home";
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
      return;
    }

    el.userInfoStrip.classList.remove("hidden");
    el.logoutBtn.classList.remove("hidden");
    el.userNameDisplay.textContent = state.currentUser.name;
    el.rolePill.textContent = isAdmin() ? "Administrador" : "Trabajador";
    el.welcomeText.textContent = `Hola, ${state.currentUser.name}`;

    document.querySelectorAll(".admin-only").forEach((node) => {
      node.classList.toggle("admin-disabled", !isAdmin());
    });
    document.querySelectorAll(".mechanic-only").forEach((node) => {
      node.classList.toggle("admin-disabled", isAdmin());
    });
    el.usersBtn.style.display = isAdmin() ? "block" : "none";

  }

  function renderHome() {
  }

  function renderImmediate() {
    fillSelect(el.immediateForm.elements.mechanic, approvedWorkers(), { placeholder: "Sin asignar" });
    el.immediateList.innerHTML = "";
    const reports = visibleActiveReports();
    if (!reports.length) {
      el.immediateList.appendChild(empty("Todavía no hay reportes inmediatos."));
      return;
    }

    const search = normalizeEquipment(el.activeReportSearch?.value || "").toLowerCase();
    const filteredReports = reports.filter((report) => {
      if (!search) return true;

      return (
        report.equipment?.toLowerCase().includes(search) ||
        report.location?.toLowerCase().includes(search) ||
        report.deviation?.toLowerCase().includes(search)
      );
    });

    const groups = new Map();
    filteredReports
      .sort((a, b) => groupLocation(a).localeCompare(groupLocation(b)) || reportAgeDays(b) - reportAgeDays(a) || a.equipment.localeCompare(b.equipment))
      .forEach((report) => {
      const mechanic = state.users.find((user) => user.id === report.mechanicId);
      const actions = [
        menuAction("Ver detalles", "secondary", () => showReportDetails(report)),
        menuAction("Ver historial", "secondary", () => showReportHistory(report))
      ];
      const quickActions = [];
      if (isAdmin()) {
        quickActions.push(button("Asignar", "primary compact-assign", async () => chooseMechanicForReport(report)));
        actions.push(menuAction("Asignar", "secondary", async () => chooseMechanicForReport(report)));
        actions.push(menuAction("Editar", "secondary", async () => editReport(report)));
        actions.push(menuAction("Enviar a Plan Mañana", "secondary", async () => {
          await updateReport(report.id, { plan_date: state.planDate });
          await createNotification(`${report.equipment} enviado al Plan Mañana`);
          await refreshAllData();
        }));
        if (isOperativeInformedStatus(report.status)) {
          actions.push(menuAction("Validar y pasar a Operativos", "ok", async () => validateReport(report)));
          actions.push(menuAction("Rechazar / requiere revisión", "secondary", async () => rejectReport(report)));
        } else {
          actions.push(menuAction("Validar operativo", "ok", async () => validateReport(report)));
        }
        actions.push(menuAction("Quitar asignación", "secondary", async () => {
          await updateReport(report.id, { mechanic_id: null, plan_date: null });
          await refreshAllData();
        }));
        actions.push(menuAction("Eliminar", "danger", async () => {
          const ok = await openChoiceModal("Eliminar reporte", [{ id: "delete", name: `Eliminar ${report.equipment}` }], (item) => `<strong>${item.name}</strong><span>Esta acción quita el reporte activo.</span>`, "Sin acciones.");
          if (!ok) return;
          await supabase.from("reports").delete().eq("id", report.id);
          await refreshAllData();
        }));
      } else {
        quickActions.push(button("Operativo", "ok compact-assign", async () => markRepairDone(report)));
        actions.push(menuAction("Cambiar a operativo", "ok", async () => markRepairDone(report)));
      }
      const location = groupLocation(report);
      if (!groups.has(location)) groups.set(location, []);
      groups.get(location).push(compactReportRow(report, actions, quickActions));
    });

    if (!filteredReports.length) {
      el.immediateList.appendChild(empty("No encontré reportes con ese filtro."));
      return;
    }

    groups.forEach((rows, location) => {
      el.immediateList.appendChild(reportGroup(location, rows));
    });
  }

  function renderTomorrow() {
    if (el.planDate && el.planDate.value !== state.planDate) el.planDate.value = state.planDate;
    el.tomorrowList.innerHTML = "";
    renderAvailability();

    const rows = planReports();
    const workers = approvedWorkers();

    if (!workers.length) {
      el.tomorrowList.appendChild(empty("No hay mecánicos aprobados."));
      return;
    }

    workers.forEach((worker) => {
      const workerRows = rows.filter((report) => report.mechanicId === worker.id);
      const available = workerAvailability(worker.id);
      const actions = [];
      if (isAdmin()) {
        actions.push(button("Agregar equipo", "primary", async () => chooseReportForWorker(worker)));
        actions.push(button("Copiar trabajos", "secondary", () => copyPlan(worker.id)));
      }

      const section = document.createElement("article");
      section.className = "card plan-worker";
      section.innerHTML = `
        <div class="card-head">
          <h2>${worker.name}</h2>
          <span class="tag ${available === "franco" ? "danger" : "ok"}">${available === "franco" ? "Franco" : "Disponible"}</span>
        </div>
        <div class="worker-actions"></div>
        <div class="plan-items"></div>
      `;
      const actionBox = section.querySelector(".worker-actions");
      actions.forEach((action) => actionBox.appendChild(action));
      const list = section.querySelector(".plan-items");
      if (!workerRows.length) {
        list.appendChild(empty("Sin equipos asignados."));
      } else {
        workerRows.forEach((report) => {
          const reportActions = [
            button("Ver detalles", "secondary", () => showReportDetails(report)),
            button("Ver historial", "secondary", () => showReportHistory(report))
          ];
          if (isAdmin() || report.mechanicId === state.currentUser.id) {
            reportActions.push(button("Marcar reparación realizada", "ok", async () => markRepairDone(report)));
          }
          if (isAdmin() && isOperativeInformedStatus(report.status)) {
            reportActions.push(button("Validar", "primary", async () => validateReport(report)));
            reportActions.push(button("Rechazar", "secondary", async () => rejectReport(report)));
          }
          list.appendChild(card(report.equipment, displayStatus(report.status), reportLine(report), reportActions));
        });
      }
      el.tomorrowList.appendChild(section);
    });
  }

  function renderMyJobs() {
    if (!el.myJobsList) return;
    el.myJobsList.innerHTML = "";
    const own = myReports();
    if (!own.length) {
      el.myJobsList.appendChild(empty("No tenés equipos asignados."));
      return;
    }
    [
      ["Pendientes", own.filter((report) => !isOperativeInformedStatus(report.status))],
      ["Operativo informado", own.filter((report) => isOperativeInformedStatus(report.status))]
    ].forEach(([title, rows]) => {
      if (!rows.length) return;
      const heading = document.createElement("h3");
      heading.textContent = title;
      el.myJobsList.appendChild(heading);
      rows.forEach((report) => {
        const actions = [
          button("Ver detalles", "secondary", () => showReportDetails(report)),
          button("Ver historial", "secondary", () => showReportHistory(report)),
          button("Solicitar repuesto", "secondary", () => {
            setScreen("orders");
            el.orderForm.elements.equipment.value = report.equipment;
          })
        ];
        if (!isOperativeInformedStatus(report.status)) {
          actions.push(button("Informar equipo operativo", "ok", async () => markRepairDone(report)));
        }
        el.myJobsList.appendChild(card(report.equipment, displayStatus(report.status), reportLine(report), actions));
      });
    });
  }

  function renderAvailability() {
    if (!el.availabilityList) return;
    el.availabilityList.innerHTML = "";
    if (!isAdmin()) {
      el.availabilityList.classList.add("hidden");
      return;
    }
    el.availabilityList.classList.remove("hidden");
    approvedWorkers().forEach((worker) => {
      const row = document.createElement("div");
      row.className = "availability-row";
      row.innerHTML = `<strong>${worker.name}</strong><select aria-label="Disponibilidad"></select>`;
      const select = row.querySelector("select");
      select.appendChild(new Option("Disponible", "disponible"));
      select.appendChild(new Option("Franco", "franco"));
      select.value = workerAvailability(worker.id);
      select.addEventListener("change", async () => {
        await saveAvailability(worker.id, select.value);
        await refreshAllData();
      });
      el.availabilityList.appendChild(row);
    });
  }

  async function saveAvailability(workerId, status) {
    if (!supabase || !isAdmin()) return;
    const payload = {
      worker_id: workerId,
      date: state.planDate,
      status
    };
    const { error } = await supabase.from("worker_availability").upsert(payload, { onConflict: "worker_id,date" });
    if (error) showToast("Falta aplicar la migración de disponibilidad en Supabase.");
  }

  async function markRepairDone(report) {
    const description = await openTextModal("Informar equipo operativo", "Qué reparación se realizó, repuestos usados, observaciones y horómetro final");
    if (description === null) return;
    const note = description.trim();
    if (!note) {
      showToast("Para marcar la reparación, tenés que escribir qué hiciste.");
      return;
    }
    await updateReport(report.id, {
      status: "PV",
      previous_status: isOperativeInformedStatus(report.status) ? report.previousStatus || "FS" : displayStatus(report.status),
      repair_note: note,
      repaired_by: state.currentUser.name,
      repaired_at: new Date().toISOString(),
      operation_note: note,
      operated_by: state.currentUser.name
    });
    await createNotification(`${state.currentUser.name} informó reparación realizada en ${report.equipment}: ${note}`);
    await refreshAllData();
  }

  function showReportHistory(report) {
    const history = relatedReports(report.equipment)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map((item) => ({
        label: `${formatDateTime(item.createdAt)} · ${displayStatus(item.status)}`,
        value: `${item.deviation || "Sin falla"}${item.repairNote ? " · Reparación: " + item.repairNote : ""}`
      }));
    openInfoModal(`Historial ${report.equipment}`, history.length ? history : [{ label: "Historial", value: "Sin movimientos registrados." }]);
  }

  async function editReport(report) {
    if (!isAdmin()) return;
    const location = await openTextModal("Editar ubicación", report.location || "");
    if (location === null) return;
    const deviation = await openTextModal("Editar falla / desvío", report.deviation || "");
    if (deviation === null) return;
    const status = await openTextModal("Editar estado", displayStatus(report.status));
    if (status === null) return;
    await updateReport(report.id, {
      location: location.trim(),
      deviation: deviation.trim(),
      status: status.trim() || report.status
    });
    await createNotification(`${report.equipment} editado por ${state.currentUser.name}`);
    await refreshAllData();
  }

  async function validateReport(report) {
    const ok = await openChoiceModal("Validar operativo", [{ id: "ok", name: `Validar ${report.equipment}` }], (item) => `<strong>${item.name}</strong><span>Pasarlo a Operativos.</span>`, "Sin acciones.");
    if (!ok) return;
    await updateReport(report.id, {
      status: "Operativo validado",
      mechanic_id: null,
      plan_date: null,
      validated_by: state.currentUser.name,
      validated_at: new Date().toISOString()
    });
    await createNotification(`${report.equipment} validado operativo por ${state.currentUser.name}`);
    await refreshAllData();
  }

  async function rejectReport(report) {
    const observation = await openTextModal("Rechazar revisión", "Observación para devolver el trabajo a revisión");
    if (observation === null) return;
    const nextStatus = report.previousStatus && report.previousStatus !== "PV" ? report.previousStatus : "FS";
    await updateReport(report.id, {
      status: nextStatus,
      repair_note: report.repairNote ? `${report.repairNote} | Rechazado: ${observation.trim()}` : `Rechazado: ${observation.trim()}`
    });
    await createNotification(`${report.equipment} requiere revisión. ${observation.trim()}`);
    await refreshAllData();
  }

  function buildPlanText(workerId) {
    const workers = workerId ? approvedWorkers().filter((worker) => worker.id === workerId) : approvedWorkers();
    const lines = [`PLAN MAÑANA - ${state.planDate}`, ""];
    workers.forEach((worker) => {
      const reports = planReports().filter((report) => report.mechanicId === worker.id);
      lines.push(worker.name.toUpperCase());
      if (workerAvailability(worker.id) === "franco") lines.push("FRANCO");
      if (!reports.length) {
        lines.push("Sin equipos asignados", "");
        return;
      }
      reports.forEach((report) => {
        lines.push(`${report.equipment} - ${report.location || "Sin ubicación"}`);
        lines.push(report.deviation || "Sin detalle");
        lines.push(`Estado: ${displayStatus(report.status)}`);
        lines.push("");
      });
    });
    return lines.join("\n").trim();
  }

  async function copyPlan(workerId) {
    const text = buildPlanText(workerId);
    const copied = await writeClipboard(text);
    if (navigator.share && !workerId) {
      await navigator.share({ text });
    } else {
      showToast(copied ? "Plan copiado." : "No pude copiar el plan.");
    }
  }

  function renderMechanicReports() {
    el.mechanicList.innerHTML = "";
    const rows = state.reports.filter((row) => isTechnicalObservation(row) || row.operationNote);
    if (!rows.length) {
      el.mechanicList.appendChild(empty("No hay observaciones cargadas."));
      return;
    }
    rows.forEach((row) => {
      const actions = [button("Ver detalles", "secondary", () => showReportDetails(row))];
      if (isAdmin() && isTechnicalObservation(row)) {
        actions.push(button("Crear reporte activo", "primary", async () => {
          await updateReport(row.id, { status: "FS" });
          await createNotification(`${row.equipment} convertido a reporte activo por ${state.currentUser.name}`);
          await refreshAllData();
        }));
        actions.push(button("Marcar solucionado", "ok", async () => {
          const note = await openTextModal("Solucionar observación", "Qué se hizo");
          if (note === null) return;
          await updateReport(row.id, {
            status: "Operativo validado",
            repair_note: note.trim(),
            repaired_by: state.currentUser.name,
            repaired_at: new Date().toISOString(),
            validated_by: state.currentUser.name,
            validated_at: new Date().toISOString()
          });
          await refreshAllData();
        }));
      }
      el.mechanicList.appendChild(card(row.equipment, row.status, `${row.deviation} · ${row.operationNote || "sin detalle"}`, actions));
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
      const actions = [
        button("Ver detalles", "secondary", () => openInfoModal(`Pedido ${order.equipment}`, [
          { label: "Interno", value: order.equipment },
          { label: "Solicitante", value: order.requesterName },
          { label: "Repuesto / necesidad", value: order.need },
          { label: "Estado", value: order.status },
          { label: "Fecha", value: formatDateTime(order.createdAt) }
        ])),
        button("Copiar WhatsApp", "secondary", async () => copyOrder(order))
      ];
      if (isAdmin()) {
        actions.push(button("Marcar pedido", "secondary", async () => {
          await supabase.from("orders").update({ status: "Pedido" }).eq("id", order.id);
          await refreshAllData();
        }));
        actions.push(button("Marcar recibido", "ok", async () => {
          await supabase.from("orders").update({ status: "Recibido" }).eq("id", order.id);
          await refreshAllData();
        }));
        actions.push(button(order.status === "Cerrado" ? "Reabrir" : "Cerrar", "danger", async () => {
          await supabase.from("orders").update({ status: order.status === "Cerrado" ? "Pedido" : "Cerrado" }).eq("id", order.id);
          await refreshAllData();
        }));
      }
      el.ordersList.appendChild(card(order.equipment, order.status, `${order.requesterName} pidió: ${order.need}`, actions));
    });
  }

  async function copyOrder(order) {
    const text = [
      "PEDIDO DE REPUESTOS",
      "",
      `Solicita: ${order.requesterName}`,
      `Equipo: ${order.equipment}`,
      `Estado: ${order.status}`,
      "",
      "REPUESTO / NECESIDAD",
      order.need,
      "",
      `Fecha: ${formatDateTime(order.createdAt)}`
    ].join("\n");
    const copied = await writeClipboard(text);
    showToast(copied ? "Pedido copiado para WhatsApp." : "No pude copiar el pedido.");
  }

  function renderHistory() {
    el.historyList.innerHTML = "";
    if (!state.orders.length) {
      el.historyList.appendChild(empty("El historial está vacío."));
      return;
    }
    state.orders.forEach((order) => {
      el.historyList.appendChild(card(order.equipment, order.status, `${order.requesterName} hizo un pedido el ${formatDateTime(order.createdAt)}`, [
        button("Ver detalles", "secondary", () => openInfoModal(`Historial ${order.equipment}`, [
          { label: "Solicitante", value: order.requesterName },
          { label: "Pedido", value: order.need },
          { label: "Estado", value: order.status },
          { label: "Fecha", value: formatDateTime(order.createdAt) }
        ]))
      ]));
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
      actions.unshift(button("Ver ficha", "secondary", () => openInfoModal(`Ficha ${item.equipment}`, [
        { label: "Interno", value: item.equipment },
        { label: "Piezas / datos", value: item.parts },
        { label: "Notas", value: item.notes },
        { label: "Reportes activos", value: activeReports().filter((report) => normalizeEquipment(report.equipment) === normalizeEquipment(item.equipment)).length },
        { label: "Pedidos", value: relatedOrders(item.equipment).length },
        { label: "Historial", value: relatedReports(item.equipment).length }
      ])));
      el.fleetList.appendChild(card(item.equipment, "Flota", `${item.parts}${item.notes ? " · " + item.notes : ""}`, actions));
    });
  }

  function renderOperatives() {
    if (!el.operativesList) return;
    el.operativesList.innerHTML = "";
    if (!isAdmin()) {
      el.operativesList.appendChild(empty("Solo el administrador puede ver Operativos."));
      return;
    }
    const rows = state.reports.filter((report) => report.status === "Operativo validado");
    if (!rows.length) {
      el.operativesList.appendChild(empty("Todavía no hay equipos validados como operativos."));
      return;
    }
    rows.forEach((report) => {
      el.operativesList.appendChild(card(
        report.equipment,
        "Operativo",
        `${report.location || "Sin ubicación"} · ${report.deviation || "Sin falla"} · Reparó: ${report.repairedBy || report.operatedBy || "sin dato"} · Validó: ${report.validatedBy || "sin dato"}${report.validatedAt ? " · " + formatDateTime(report.validatedAt) : ""}`,
        [
          button("Ver detalles", "secondary", () => showReportDetails(report)),
          button("Ver historial", "secondary", () => showReportHistory(report)),
          button("Reabrir reporte", "secondary", async () => reopenReport(report)),
          button("Eliminar", "danger", () => {
            const modal = document.getElementById('modal-eliminar-operativo');
            document.getElementById('equipo-modal').innerText = report.equipment;
            modal.showModal();

            document.getElementById('btn-confirmar-operativo').onclick = async () => {
              modal.close();
              await supabase.from("reports").delete().eq("id", report.id);
              await refreshAllData();
            };

            document.getElementById('btn-cancelar-operativo').onclick = () => {
              modal.close();
            };
          })
        ]
      ));
    });
  }

  function renderValidations() {
    if (!el.validationsList) return;
    el.validationsList.innerHTML = "";
    if (!isAdmin()) {
      el.validationsList.appendChild(empty("Solo el administrador puede validar operativos."));
      return;
    }
    const rows = state.reports.filter((report) => isOperativeInformedStatus(report.status));
    if (!rows.length) {
      el.validationsList.appendChild(empty("No hay operativos pendientes de validar."));
      return;
    }
    rows.forEach((report) => {
      el.validationsList.appendChild(card(report.equipment, "Operativo informado", `${report.location || "Sin ubicación"} · ${report.deviation || "Sin falla"} · Reparó: ${report.repairedBy || report.operatedBy || "sin dato"} · ${report.repairNote || "Sin detalle de reparación"}`, [
        button("Ver detalles", "secondary", () => showReportDetails(report)),
        button("Validar operativo", "ok", async () => validateReport(report)),
        button("Devolver a Reportes activos", "secondary", async () => rejectReport(report))
      ]));
    });
  }

  function renderPanel() {
    if (!el.panelStats || !el.panelActivity) return;
    el.panelStats.innerHTML = "";
    el.panelActivity.innerHTML = "";
    if (!isAdmin()) {
      el.panelStats.appendChild(empty("Solo el administrador puede ver el panel."));
      return;
    }
    const active = activeReports();
    const pendingValidation = state.reports.filter((report) => isOperativeInformedStatus(report.status));
    const fs = active.filter((report) => /^FS$/i.test(displayStatus(report.status)));
    const obs = active.filter((report) => /^OBS$/i.test(displayStatus(report.status)));
    const ordersPending = state.orders.filter((order) => !/cerrado|entregado|cancelado/i.test(order.status));
    [
      ["Reportes activos", active.length],
      ["Fuera de servicio", fs.length],
      ["Con observaciones", obs.length],
      ["Validaciones pendientes", pendingValidation.length],
      ["Operativos validados", state.reports.filter((report) => report.status === "Operativo validado").length],
      ["Pedidos pendientes", ordersPending.length],
      ["Equipos de flota", state.fleet.length],
      ["Mecánicos activos", approvedWorkers().length]
    ].forEach(([label, value]) => {
      const node = document.createElement("article");
      node.className = "stat-card";
      node.innerHTML = `<strong></strong><span></span>`;
      node.querySelector("strong").textContent = value;
      node.querySelector("span").textContent = label;
      el.panelStats.appendChild(node);
    });
    const recent = [
      ...active.slice(0, 4).map((report) => ({ title: report.equipment, tag: displayStatus(report.status), body: reportLine(report), report })),
      ...state.orders.slice(0, 3).map((order) => ({ title: order.equipment, tag: order.status, body: `${order.requesterName}: ${order.need}` }))
    ];
    if (!recent.length) {
      el.panelActivity.appendChild(empty("Sin actividad reciente."));
      return;
    }
    recent.forEach((item) => {
      el.panelActivity.appendChild(card(item.title, item.tag, item.body, item.report ? [button("Ver detalles", "secondary", () => showReportDetails(item.report))] : []));
    });
  }

  async function reopenReport(report) {
    if (!isAdmin()) return;
    const reason = await openTextModal("Reabrir reporte", "Motivo de reapertura");
    if (reason === null) return;
    await updateReport(report.id, {
      status: "FS",
      repair_note: report.repairNote ? `${report.repairNote} | Reabierto: ${reason.trim()}` : `Reabierto: ${reason.trim()}`,
      validated_by: null,
      validated_at: null
    });
    await createNotification(`${report.equipment} reabierto por ${state.currentUser.name}: ${reason.trim()}`);
    await refreshAllData();
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
            await supabase.from("profiles").update({ status: "aprobado", account_status: "activo" }).eq("id", user.id);
            await createNotification(`Cuenta aprobada para ${user.name}`);
            await refreshAllData();
          }));
          actions.push(button("Rechazar", "danger", async () => {
            await supabase.from("profiles").update({ status: "rechazado", account_status: "inactivo" }).eq("id", user.id);
            await refreshAllData();
          }));
        }
        actions.push(button("Editar", "secondary", async () => editUser(user)));
        actions.push(button(user.accountStatus === "inactivo" ? "Activar" : "Bloquear", "secondary", async () => {
          await supabase.from("profiles").update({ account_status: user.accountStatus === "inactivo" ? "activo" : "inactivo" }).eq("id", user.id);
          await refreshAllData();
        }));
        actions.push(button("Eliminar", "danger", async () => {
          const ok = await openChoiceModal("Eliminar perfil", [{ id: "delete", name: `Eliminar ${user.name}` }], (item) => `<strong>${item.name}</strong><span>No borra la cuenta Auth de Supabase.</span>`, "Sin acciones.");
          if (!ok) return;
          await supabase.from("profiles").delete().eq("id", user.id);
          await refreshAllData();
        }));
      }
      const roleLabel = user.role === "admin" ? "Administrador" : "Trabajador";
      const statusLabel = user.status === "pendiente" ? "Pendiente" : user.status === "aprobado" ? "Aprobado" : user.status === "rechazado" ? "Rechazado" : "Aprobado";
      const details = `Usuario: ${user.username} · Especialidad: ${specialtyLabel(user.specialty)} · Aprobación: ${statusLabel} · Estado: ${user.accountStatus === "inactivo" ? "Inactivo" : "Activo"}`;
      el.usersList.appendChild(card(user.name, roleLabel, details, actions));
    });
  }

  async function editUser(user) {
    const name = await openTextModal("Nombre completo", user.name);
    if (name === null) return;
    const username = await openTextModal("Usuario", user.username);
    if (username === null) return;
    const specialty = await openTextModal("Especialidad", user.specialty || "mecanico-maquinaria-pesada");
    if (specialty === null) return;
    await supabase.from("profiles").update({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: userToEmail(username),
      specialty: specialty.trim()
    }).eq("id", user.id);
    await refreshAllData();
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
      return;
    }
    renderHome();
    renderImmediate();
    renderMyJobs();
    renderTomorrow();
    renderMechanicReports();
    renderOrders();
    renderHistory();
    renderFleet();
    renderOperatives();
    renderPanel();
    renderValidations();
    renderUsers();
    renderNotifications();
  }

  function populateUserFilter() {
    const options = SPECIALTY_OPTIONS.map((option) => ({ id: option.value, name: option.label }));
    fillSelect(el.userFilter, options, { all: true });
  }

  async function refreshAllData() {
    if (!supabase) return;
    const [profiles, reports, orders, fleet, notifications, availability] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("reports").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("fleet_items").select("*").order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      supabase.from("worker_availability").select("*").eq("date", state.planDate)
    ]);

    state.users = (profiles.data || []).map(normalizeUser);
    state.reports = (reports.data || []).map(normalizeReport);
    state.orders = (orders.data || []).map(normalizeOrder);
    state.fleet = (fleet.data || []).map(normalizeFleet);
    state.notifications = (notifications.data || []).map(normalizeNotification);
    state.availability = (availability.data || []).map(normalizeAvailability);

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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      const error = new Error("Sesion requerida.");
      showToast("Volvé a iniciar sesión.");
      throw error;
    }

    const response = await fetch("/api/update-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ id, updates })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.report) {
      const error = new Error(result.error || "No se pudo actualizar el reporte.");
      showToast(error.message);
      throw error;
    }
    return result.report;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_availability" }, () => refreshAllData())
      .subscribe();
  }

  document.querySelectorAll("[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => setScreen(btn.dataset.screen));
  });

  el.backBtn.addEventListener("click", () => setScreen("home"));
  el.usersBtn.addEventListener("click", () => setScreen("users"));

  el.planDate?.addEventListener("change", async () => {
    state.planDate = el.planDate.value || state.planDate;
    await refreshAllData();
  });

  el.refreshPlanBtn?.addEventListener("click", () => refreshAllData());
  el.copyPlanBtn?.addEventListener("click", () => copyPlan());

  el.immediateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentUser) return;
    
    const form = new FormData(el.immediateForm);
    
    const prioridad = form.get("priority") || "Media";
    const notas = form.get("notes")?.trim() || "";
    const fallaOriginal = form.get("deviation")?.trim() || "";
    const valorHorometro = form.get("hourmeter")?.trim() || "";
    
    // Armamos un solo texto con todo para que la base de datos no se queje
    let fallaCompleta = `${fallaOriginal} | Prioridad: ${prioridad}`;
    if (notas) fallaCompleta += ` | Obs: ${notas}`;
    if (valorHorometro) fallaCompleta += ` | Horómetro: ${valorHorometro}`;
    
    const report = {
      id: uid(),
      equipment: normalizeEquipment(form.get("equipment")),
      location: form.get("location")?.trim() || "Sin ubicación",
      deviation: fallaCompleta,
      status: form.get("status") || "Pendiente",
      mechanic_id: form.get("mechanic") || null,
      created_at: new Date().toISOString(),
      created_by: state.currentUser.id
      // Fijate que acá borramos por completo la línea de "hourmeter"
    };

    try {
      const { error } = await supabase.from("reports").insert(report);
      
      if (error) {
        console.error("Error al guardar:", error);
        showToast("Error en la base de datos: " + error.message);
        return; 
      }
      
      await createNotification(`Nuevo reporte: ${report.equipment}`);
      await refreshAllData();
      el.immediateForm.reset();
      if (el.reportPaste) el.reportPaste.value = "";
      
      showToast("¡Reporte guardado con éxito!");
      
    } catch (error) {
      console.error("Error inesperado:", error);
      showToast("Error inesperado al guardar el reporte.");
    }
  });

  // 2. BOTÓN DE WHATSAPP (Procesa el texto y dispara el formulario de arriba)
  el.processReportBtn?.addEventListener("click", () => {
    const texto = el.reportPaste.value.trim();

    if (!texto) {
      showToast("Pegá primero un reporte.");
      return;
    }

    // 1. DETECTAR INTERNO
    const internoEncontrado = texto.match(
      /\b(MN|TO|T0|CF|PR|RE|CT|CV|CR|CA|RN|RV|SB|ST|CC|CP|GE|CM|TP|CB|PL|CCH)[\s_-]*\d{1,3}\b/i
    );

    if (!internoEncontrado) {
      showToast("No pude encontrar el interno en el reporte.");
      return;
    }

    // 2. DETECTAR UBICACIÓN (Súper flexible: acepta "Ubicacio", "Ubicació", "Ubi", "Ubic", etc.)
    const regexUbicacion = /(?:ubicaci[oóu]n?|ubicasio?n?|ubcacio?n?|ubica|ub|ubi|lugar|sector|zona)[\s*:-]*([^\n\r]+)/i;
    const ubicacionEncontrada = texto.match(regexUbicacion);
    const ubicacionManual = el.immediateForm.elements.location?.value?.trim();
    let ubicacion = "Sin ubicación";

    if (ubicacionEncontrada) {
      ubicacion = ubicacionEncontrada[1].trim().replace(/[.,]+$/, "");
    } else if (ubicacionManual) {
      ubicacion = ubicacionManual;
    }

    // 3. DETECTAR FALLA
    const fallaEncontrada = texto.match(
      /(?:falla(?:\s+detectada)?|desv[ií]o|detalle|problema)[\s*:-]*([\s\S]*?)(?=\n\s*(?:estado|obs\.?|observaci[oó]n|adjuntar|ubicaci[oó]n|lugar)\s*:|$)/i
    );
    const fallaManual = el.immediateForm.elements.deviation?.value?.trim();
    const falla = fallaEncontrada 
      ? fallaEncontrada[1].trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(" - ") 
      : (fallaManual || "Falla no especificada");

    // 4. DETECTAR ESTADO
    const textoMayuscula = texto.toUpperCase();
    let estado = el.immediateForm.elements.status?.value || "FS";

    if (
      textoMayuscula.includes("FUERA DE SERVICIO") || 
      textoMayuscula.includes("PARADO") || 
      /\bFS\b/.test(textoMayuscula)
    ) {
      estado = "FS";
    } else if (
      textoMayuscula.includes("OPERATIVO") || 
      textoMayuscula.includes("OBS") || 
      textoMayuscula.includes("OBSERVACION")
    ) {
      estado = "OBS";
    }

    // 5. CARGAMOS LOS DATOS EN EL FORMULARIO
    el.immediateForm.elements.equipment.value = normalizeEquipment(internoEncontrado[0]);
    el.immediateForm.elements.location.value = ubicacion;
    el.immediateForm.elements.deviation.value = falla;
    if (estado) {
      el.immediateForm.elements.status.value = estado;
    }

    // Dispara el guardado automáticamente
    el.immediateForm.requestSubmit();
  });

  el.mechanicForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentUser) return;
    const form = new FormData(el.mechanicForm);
    await supabase.from("reports").insert({
      id: uid(),
      equipment: normalizeEquipment(form.get("equipment")),
      deviation: form.get("deviation").trim(),
      operation_note: form.get("notes").trim(),
      status: "Observación técnica",
      created_at: new Date().toISOString(),
      created_by: state.currentUser.id
    });
    await createNotification(`Nueva observación técnica en ${normalizeEquipment(form.get("equipment"))}`);
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
    const role = "mecanico";
    const accountStatus = "activo";

    if (!name || !username || !password || !specialty) {
      el.userFeedback.textContent = "Completá todos los campos.";
      return;
    }

    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data?.session?.access_token;
    if (!token) {
      el.userFeedback.textContent = "Volvé a iniciar sesión como administrador.";
      return;
    }

    const response = await fetch("/api/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name,
        username,
        password,
        specialty
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      el.userFeedback.textContent = result.error || "No se pudo crear el mecánico.";
      return;
    }

    el.userFeedback.textContent = `Usuario creado: ${username}. Entra con usuario y contraseña, sin correo.`;
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

    const email = userToEmail(usuario);
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

    if (state.currentUser.accountStatus === "inactivo") {
      el.loginError.textContent = "Tu usuario está inactivo. Consultá al administrador.";
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
    el.registerFeedback.textContent = "Las cuentas las crea el administrador desde Gestión de mecánicos.";
  });

  el.activeReportSearch?.addEventListener("input", () => {
  renderImmediate();
});

  populateUserFilter();
  initializeApp();

  
})();
