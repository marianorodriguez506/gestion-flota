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
    orders: { id: "ordersScreen", title: "Repuestos", label: "Pedidos" },
    history: { id: "historyScreen", title: "Historial de pedidos", label: "Consulta" },
    fleet: { id: "fleetScreen", title: "Información de flota", label: "Equipos" },
    operatives: { id: "operativesScreen", title: "Operativos", label: "Validado" },
    panel: { id: "panelScreen", title: "Panel", label: "Control" },
    validations: { id: "validationsScreen", title: "Validaciones pendientes", label: "Revisión" },
    users: { id: "usersScreen", title: "Gestión de Mecánicos", label: "Mecánicos" },
    locations: { id: "locationsScreen", title: "Base de ubicaciones", label: "GPS" },
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
    savedLocations: [],
    planDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    orderDraft: null
  };

  // PEDIR PERMISO PARA NOTIFICACIONES NATIVAS (BARRA DEL CELULAR)
  if ("Notification" in window) {
    Notification.requestPermission().then(permission => {
      console.log("Permiso de notificaciones del sistema:", permission);
    });
  }

  let activeScreen = "auth";
  let realtimeChannel = null;
  let modalCancelHandler = null;
  let notificationsModalOpen = false;
  let notificationsModalResolve = null;

  const el = {
    backBtn: document.getElementById("backBtn"),
    screenTitle: document.getElementById("screenTitle"),
    screenLabel: document.getElementById("screenLabel"),
    loginForm: document.getElementById("loginForm"),
    registerForm: document.getElementById("registerForm"),
    registerFeedback: document.getElementById("registerFeedback"),
    logoutBtn: document.getElementById("logoutBtn"),
    notificationsBtn: document.getElementById("notificationsBtn"),
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
    clearPlanBtn: document.getElementById("clearPlanBtn"),
    copyPlanBtn: document.getElementById("copyPlanBtn"),
    availabilityList: document.getElementById("availabilityList"),
    tomorrowList: document.getElementById("tomorrowList"),
    myJobsList: document.getElementById("myJobsList"),
    mechanicForm: document.getElementById("mechanicForm"),
    mechanicEquipmentHistory: document.getElementById("mechanicEquipmentHistory"),
    mechanicList: document.getElementById("mechanicList"),
    orderForm: document.getElementById("orderForm"),
    orderFilter: document.getElementById("orderFilter"),
    orderEquipmentFilter: document.getElementById("orderEquipmentFilter"),
    orderDestinationFilter: document.getElementById("orderDestinationFilter"),
    newOrderBtn: document.getElementById("newOrderBtn"),
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
    locationsBtn: document.getElementById("locationsBtn"),
    locationSearch: document.getElementById("locationSearch"),
    addLocationGpsBtn: document.getElementById("addLocationGpsBtn"),
    addLocationLinkBtn: document.getElementById("addLocationLinkBtn"),
    locationsList: document.getElementById("locationsList"),
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
    const label = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/^T0/, "TO")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ");
    const equipmentCode = label.replace(/\s+/g, "-").replace(/-+/g, "-");

    const match = equipmentCode.match(/^([A-Z]+)-?(\d{1,4})$/);
    if (!match) return label;

    const prefix = match[1] === "T0" ? "TO" : match[1];
    if (!EQUIPMENT_PREFIXES.includes(prefix)) return label;
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

  function safeJson(value, fallback) {
    if (Array.isArray(value) || (value && typeof value === "object")) return value;
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function orderRowsFromNeed(need) {
    const text = String(need || "").trim();
    if (!text) return [];
    return text.split(/\s*\/\s*|\r?\n/).map((part) => ({
      page: "",
      reference: "",
      code: "",
      description: part.trim(),
      urgentQty: "",
      stockQty: ""
    })).filter((row) => row.description);
  }

  function normalizeOrderRow(row = {}) {
    return {
      page: String(row.page || row.pag || ""),
      reference: String(row.reference || row.referencia || ""),
      code: String(row.code || row.codigo || ""),
      description: String(row.description || row.descripcion || row.name || ""),
      urgentQty: String(row.urgentQty ?? row.urgent_qty ?? ""),
      stockQty: String(row.stockQty ?? row.stock_qty ?? "")
    };
  }

  function normalizeOrder(row) {
    const rawItems = safeJson(row.items, null);
    const items = (Array.isArray(rawItems) ? rawItems : orderRowsFromNeed(row.need)).map(normalizeOrderRow);
    return {
      id: row.id,
      equipment: normalizeEquipment(row.equipment),
      requesterId: row.requester_id || null,
      requesterName: row.requester_name || "",
      need: row.need || "",
      status: row.status || "Pedido",
      destination: row.destination || "",
      items,
      whatsappText: row.whatsapp_text || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
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


  function normalizeSavedLocation(row) {
    return {
      id: row.id,
      name: row.name || "",
      normalizedName: row.normalized_name || normalizeLocationText(row.name),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy: row.accuracy == null ? null : Number(row.accuracy),
      createdBy: row.created_by || "",
      sourceReportId: row.source_report_id || "",
      sourceEquipment: row.source_equipment || "",
      createdAt: row.created_at || ""
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
    return activeReports().filter((report) => report.mechanicId === state.currentUser.id && !isOperativeInformedStatus(report.status));
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


  function savedLocationForName(name) {
    const key = normalizeLocationText(name);
    if (!key) return null;
    return state.savedLocations.find((item) => item.normalizedName === key) || null;
  }

  function mapsButton(report) {
    return button("Mapa", "secondary", () => openReportMap(report));
  }

  function openReportMap(report) {
    const saved = savedLocationForName(report.location);
    if (!saved || !Number.isFinite(saved.latitude) || !Number.isFinite(saved.longitude)) {
      showToast(`Todavia no hay ubicacion GPS guardada para ${report.location || "este lugar"}.`);
      return;
    }
    const url = `https://www.google.com/maps?q=${saved.latitude},${saved.longitude}`;
    window.open(url, "_blank", "noopener");
  }

  function getBrowserPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Este navegador no permite obtener GPS."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      });
    });
  }

  function openLocationConfirmModal(defaultName) {
    return new Promise((resolve) => {
      el.modalTitle.textContent = `Seguro estas en ${defaultName || "esta ubicacion"}?`;
      el.modalBody.innerHTML = "";
      el.modalActions.innerHTML = "";
      el.modalRoot.classList.remove("hidden");
      el.modalRoot.setAttribute("aria-hidden", "false");

      const label = document.createElement("label");
      label.textContent = "Nombre de la ubicacion";
      const input = document.createElement("input");
      input.value = defaultName || "";
      input.placeholder = "Ej: Vista";
      label.appendChild(input);
      el.modalBody.appendChild(label);

      el.modalActions.appendChild(button("Cancelar", "secondary", () => {
        closeModal();
        resolve(null);
      }));
      el.modalActions.appendChild(button("Aceptar", "primary", () => {
        const name = input.value.trim();
        closeModal();
        resolve(name || null);
      }));
      input.focus();
      input.select();
    });
  }

  async function saveCurrentLocationForReport(report) {
    const defaultName = report.location || "";
    if (savedLocationForName(defaultName)) return true;

    const confirmedName = await openLocationConfirmModal(defaultName);
    if (!confirmedName) return false;

    let position;
    try {
      position = await getBrowserPosition();
    } catch (error) {
      showToast(error.message || "No pude obtener la ubicacion del telefono.");
      return false;
    }

    const saved = await saveLocationRecord({
      name: confirmedName,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      report_id: report.id,
      equipment: report.equipment
    });
    return Boolean(saved);
  }

  function parseCoordinatesFromText(value) {
    const text = String(value || "");
    const patterns = [
      /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
      /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
      /[?&](?:q|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
      /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        return { latitude, longitude };
      }
    }
    return null;
  }

  async function saveLocationRecord(payload) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      showToast("Volve a iniciar sesion.");
      return null;
    }

    const response = await fetch("/api/save-location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(result.error || "No se pudo guardar ubicacion GPS.");
      return null;
    }
    if (result.location) {
      const next = normalizeSavedLocation(result.location);
      state.savedLocations = state.savedLocations.filter((item) => item.normalizedName !== next.normalizedName);
      state.savedLocations.push(next);
    }
    showToast(result.created ? "Ubicacion GPS guardada." : "Ubicacion GPS ya existia.");
    return result.location || null;
  }

  function openLocationLinkModal(title, initial = {}) {
    return new Promise((resolve) => {
      el.modalTitle.textContent = title;
      el.modalBody.innerHTML = "";
      el.modalActions.innerHTML = "";
      el.modalRoot.classList.remove("hidden");
      el.modalRoot.setAttribute("aria-hidden", "false");

      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Nombre de la ubicacion";
      const nameInput = document.createElement("input");
      nameInput.value = initial.name || "";
      nameInput.placeholder = "Ej: Vista";
      nameLabel.appendChild(nameInput);

      const linkLabel = document.createElement("label");
      linkLabel.textContent = "Link de Google Maps o coordenadas";
      const linkInput = document.createElement("textarea");
      linkInput.value = initial.link || "";
      linkInput.placeholder = "Ej: https://maps.google.com/?q=-38.123,-68.456";
      linkLabel.appendChild(linkInput);

      el.modalBody.appendChild(nameLabel);
      el.modalBody.appendChild(linkLabel);
      el.modalActions.appendChild(button("Cancelar", "secondary", () => {
        closeModal();
        resolve(null);
      }));
      el.modalActions.appendChild(button("Guardar", "primary", () => {
        const name = nameInput.value.trim();
        const coords = parseCoordinatesFromText(linkInput.value);
        closeModal();
        resolve(name && coords ? { name, ...coords } : null);
      }));
      nameInput.focus();
    });
  }

  async function addCurrentLocationManually() {
    if (!isAdmin()) return;
    const name = await openLocationConfirmModal("");
    if (!name) return;
    let position;
    try {
      position = await getBrowserPosition();
    } catch (error) {
      showToast(error.message || "No pude obtener la ubicacion del telefono.");
      return;
    }
    await saveLocationRecord({
      name,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    });
    await refreshAllData();
  }

  async function addLocationFromLink() {
    if (!isAdmin()) return;
    const payload = await openLocationLinkModal("Cargar ubicacion por link");
    if (!payload) {
      showToast("Pegá un link o coordenadas válidas y un nombre.");
      return;
    }
    await saveLocationRecord(payload);
    await refreshAllData();
  }

  async function editSavedLocation(item) {
    if (!isAdmin()) return;
    const payload = await openLocationLinkModal("Editar ubicacion", {
      name: item.name,
      link: `${item.latitude}, ${item.longitude}`
    });
    if (!payload) {
      showToast("Pegá coordenadas válidas para guardar el cambio.");
      return;
    }
    const { error } = await supabase.from("saved_locations").update({
      name: payload.name,
      normalized_name: normalizeLocationText(payload.name),
      latitude: payload.latitude,
      longitude: payload.longitude
    }).eq("id", item.id);
    if (error) {
      showToast("No se pudo editar ubicacion: " + error.message);
      return;
    }
    await refreshAllData();
    showToast("Ubicacion editada.");
  }

  async function deleteSavedLocation(item) {
    if (!isAdmin()) return;
    const ok = await openConfirmModal("Eliminar ubicaci\u00f3n", `Eliminar ubicaci\u00f3n ${item.name}?`, "Eliminar");
    if (!ok) return;
    const { error } = await supabase.from("saved_locations").delete().eq("id", item.id);
    if (error) {
      showToast("No se pudo eliminar ubicacion: " + error.message);
      return;
    }
    await refreshAllData();
    showToast("Ubicacion eliminada.");
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


  function orderEditable(order) {
    return isAdmin() || order.requesterId === state.currentUser?.id;
  }

  function filledOrderItems(order) {
    return (order.items || []).map(normalizeOrderRow).filter((item) =>
      item.page || item.reference || item.code || item.description || item.urgentQty || item.stockQty
    );
  }

  function isOrderComplete(order) {
    if (!order.equipment || !order.destination) return false;
    const items = filledOrderItems(order);
    if (!items.length) return false;
    return items.every((item) =>
      item.page && item.reference && item.code && item.description && (Number(item.urgentQty) > 0 || Number(item.stockQty) > 0)
    );
  }

  function orderTraffic(order) {
    if (/pedido|recibido|cerrado/i.test(order.status || "")) return { label: order.status || "Pedido", className: "ok", status: "Pedido" };
    if (isOrderComplete(order)) return { label: "Completo", className: "warn", status: "Completo" };
    return { label: "Incompleto", className: "danger", status: "Incompleto" };
  }

  function orderNeedFromItems(items) {
    const lines = items.map((item) => {
      const qty = [item.urgentQty ? `Urg ${item.urgentQty}` : "", item.stockQty ? `Stock ${item.stockQty}` : ""].filter(Boolean).join(" / ");
      return [item.code, item.description, qty].filter(Boolean).join(" - ");
    }).filter(Boolean);
    return lines.join(" / ") || "Pedido de repuestos";
  }

  function orderHistoryKey(item) {
    return String(item?.code || item?.description || "").trim().toLowerCase();
  }

  function orderHistoryItems() {
    const counts = new Map();
    state.orders.forEach((order) => {
      filledOrderItems(order).forEach((item) => {
        const key = orderHistoryKey(item);
        if (!key) return;
        const current = counts.get(key) || { ...item, times: 0 };
        current.times += 1;
        if (!current.code && item.code) current.code = item.code;
        if (!current.description && item.description) current.description = item.description;
        counts.set(key, current);
      });
    });
    return [...counts.values()].sort((a, b) => b.times - a.times || a.description.localeCompare(b.description));
  }

  function blankOrderItems(count = 30) {
    return Array.from({ length: count }, () => normalizeOrderRow());
  }

  function orderDraftFromOrder(order = null) {
    const items = blankOrderItems();
    (order?.items || []).slice(0, 30).forEach((item, index) => {
      items[index] = normalizeOrderRow(item);
    });
    return {
      id: order?.id || null,
      equipment: order?.equipment || "",
      requesterId: order?.requesterId || state.currentUser?.id || null,
      requesterName: order?.requesterName || state.currentUser?.name || "",
      destination: order?.destination || "Añelo",
      status: order?.status || "Incompleto",
      createdAt: order?.createdAt || new Date().toISOString(),
      items
    };
  }

  function setOrderDraftItem(index, key, value) {
    if (!state.orderDraft?.items[index]) return;
    state.orderDraft.items[index] = { ...state.orderDraft.items[index], [key]: value };
  }

  function addHistoryItemToDraft(item) {
    if (!state.orderDraft) return;
    const slot = state.orderDraft.items.findIndex((row) => !row.page && !row.reference && !row.code && !row.description && !row.urgentQty && !row.stockQty);
    const index = slot >= 0 ? slot : Math.min(state.orderDraft.items.length - 1, 29);
    state.orderDraft.items[index] = normalizeOrderRow(item);
    renderOrders();
  }

  function filteredOrderHistory(query) {
    const text = String(query || "").trim().toLowerCase();
    const rows = orderHistoryItems();
    if (!text) return rows.slice(0, 20);
    return rows.filter((item) => `${item.code} ${item.description} ${item.reference}`.toLowerCase().includes(text)).slice(0, 20);
  }

  async function deleteOrderHistoryItem(item) {
    if (!isAdmin()) return;
    const key = orderHistoryKey(item);
    if (!key) return;
    const label = item.code || item.description || "este repuesto";
    const ok = await openConfirmModal("Eliminar repuesto", `Eliminar ${label} del historial? Se quitar\u00e1 de todos los pedidos donde figure.`, "Eliminar");
    if (!ok) return;

    let touched = 0;
    for (const order of state.orders) {
      const originalItems = filledOrderItems(order);
      const nextItems = originalItems.filter((row) => orderHistoryKey(row) !== key);
      if (nextItems.length === originalItems.length) continue;
      const need = orderNeedFromItems(nextItems);
      const payload = {
        items: nextItems,
        need,
        whatsapp_text: need,
        updated_at: new Date().toISOString()
      };
      const { error } = await supabase.from("orders").update(payload).eq("id", order.id);
      if (error) {
        showToast("No se pudo eliminar del historial: " + error.message);
        return;
      }
      touched += 1;
    }

    await refreshAllData();
    showToast(touched ? "Repuesto eliminado del historial." : "No encontre ese repuesto en el historial.");
  }

  async function deleteReport(report, message = "Esta accion elimina el reporte del equipo.") {
    if (!isAdmin() || !report?.id) return;
    const ok = await openConfirmModal("Eliminar equipo", `Eliminar ${report.equipment}? ${message}`, "Eliminar");
    if (!ok) return;
    const { error } = await supabase.from("reports").delete().eq("id", report.id);
    if (error) {
      showToast("No se pudo eliminar el equipo: " + error.message);
      return;
    }
    await refreshAllData();
    showToast("Equipo eliminado.");
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
    const fleet = fleetItem(report.equipment);
    openInfoModal(`Detalle ${report.equipment}`, [
      { label: "Interno", value: report.equipment },
      { label: "Tipo", value: fleet?.parts },
      { label: "Ubicacion", value: report.location },
      { label: "Falla", value: report.deviation },
      { label: "Horometro / km", value: report.hourmeter },
      { label: "Lo hace", value: workerName(report.mechanicId) },
      { label: "Reparaciones parciales", value: report.repairNote },
      { label: "Informado por", value: report.repairedBy || report.operatedBy },
      { label: "Fecha del trabajo", value: formatDateTime(report.repairedAt) }
    ]);
  }

  function orderedReportActions(actions) {
    const priority = [
      "Ver detalles",
      "Ver historial",
      "Editar",
      "Asignar",
      "Enviar a Plan Mañana",
      "Quitar asignación",
      "Validar operativo",
      "Validar y pasar a Operativos",
      "Rechazar / requiere revisión",
      "Eliminar"
    ];
    return [...actions].sort((a, b) => {
      const ai = priority.indexOf(a.label);
      const bi = priority.indexOf(b.label);
      const av = ai === -1 ? priority.length : ai;
      const bv = bi === -1 ? priority.length : bi;
      return av - bv;
    });
  }

  function showReportMenu(report, actions) {
    el.modalTitle.textContent = `Opciones ${report.equipment}`;
    el.modalBody.innerHTML = "";
    el.modalActions.innerHTML = "";
    el.modalRoot.classList.remove("hidden");
    el.modalRoot.setAttribute("aria-hidden", "false");
    el.modalActions.classList.add("action-menu");

    const hint = document.createElement("div");
    hint.className = "menu-hint";
    hint.textContent = "Selecciona una accion para este reporte.";
    el.modalBody.appendChild(hint);

    orderedReportActions(actions).forEach((action) => {
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
      </div>
    `;
    row.title = "Mantener presionado para ver opciones";
    row.querySelector("strong").textContent = report.equipment;
    row.querySelector(".report-status").textContent = displayStatus(report.status);
    const age = row.querySelector(".age-pill");
    age.textContent = `${days} d`;
    age.classList.add(reportAgeClass(days));
    row.querySelector(".report-failure").textContent = `${formatShortDate(report.createdAt)} · ${report.deviation || "Sin falla"}`;
    row.querySelector(".report-mechanic").textContent = mechanic ? mechanic.name : "Sin asignar";
    const actionBox = row.querySelector(".report-row-actions");
    (quickActions || []).forEach((action) => actionBox.appendChild(action));
    let longPressTimer = null;
    let longPressHandled = false;
    const clearLongPress = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      row.classList.remove("pressing");
    };
    const openMenu = () => showReportMenu(report, actions);
    row.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      longPressHandled = false;
      row.classList.add("pressing");
      longPressTimer = setTimeout(() => {
        longPressHandled = true;
        clearLongPress();
        openMenu();
      }, 650);
    });
    row.addEventListener("pointerup", clearLongPress);
    row.addEventListener("pointerleave", clearLongPress);
    row.addEventListener("pointercancel", clearLongPress);
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      clearLongPress();
      if (longPressHandled) return;
      openMenu();
    });
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
    modalCancelHandler = null;
    el.modalRoot.classList.add("hidden");
    el.modalRoot.setAttribute("aria-hidden", "true");
    el.modalTitle.textContent = "";
    el.modalBody.innerHTML = "";
    el.modalActions.innerHTML = "";
    el.modalActions.classList.remove("action-menu");
  }

  function cancelModal() {
    const handler = modalCancelHandler;
    closeModal();
    if (handler) handler();
  }

  function openConfirmModal(title, message, confirmLabel = "Eliminar") {
    return new Promise((resolve) => {
      modalCancelHandler = () => resolve(false);
      el.modalTitle.textContent = title;
      el.modalBody.innerHTML = "";
      el.modalActions.innerHTML = "";
      el.modalRoot.classList.remove("hidden");
      el.modalRoot.setAttribute("aria-hidden", "false");

      const box = document.createElement("div");
      box.className = "confirm-box";
      const text = document.createElement("p");
      text.textContent = message;
      box.appendChild(text);
      el.modalBody.appendChild(box);

      el.modalActions.appendChild(button("Cancelar", "secondary", () => {
        closeModal();
        resolve(false);
      }));
      el.modalActions.appendChild(button(confirmLabel, "danger", () => {
        closeModal();
        resolve(true);
      }));
    });
  }

  function closeNotificationsModal(value = null) {
    if (!notificationsModalOpen) return;
    notificationsModalOpen = false;
    const resolve = notificationsModalResolve;
    notificationsModalResolve = null;
    closeModal();
    if (resolve) resolve(value);
  }

  function closeNotificationsModalFromUi(value = null) {
    const hasNotificationHistory = window.history?.state?.modal === "notifications";
    closeNotificationsModal(value);
    if (hasNotificationHistory) {
      history.back();
    }
  }

  function openNotificationsModal(title, rows, renderRow, emptyText) {
    return new Promise((resolve) => {
      notificationsModalOpen = true;
      notificationsModalResolve = resolve;
      el.modalTitle.textContent = title;
      el.modalBody.innerHTML = "";
      el.modalActions.innerHTML = "";
      el.modalRoot.classList.remove("hidden");
      el.modalRoot.setAttribute("aria-hidden", "false");

      const list = document.createElement("div");
      list.className = "modal-list";
      if (!rows.length) {
        list.appendChild(empty(emptyText || "No hay notificaciones."));
      }
      rows.forEach((row) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.innerHTML = renderRow(row);
        btn.addEventListener("click", () => closeNotificationsModalFromUi(row));
        list.appendChild(btn);
      });
      el.modalBody.appendChild(list);

      el.modalActions.appendChild(button("Cerrar", "secondary", () => closeNotificationsModalFromUi(null)));

      if (window.history?.pushState) {
        history.pushState({ screen: activeScreen, modal: "notifications" }, "", location.hash || `#${activeScreen}`);
      }
    });
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

  function openTextModal(title, placeholder, initialValue = "") {
    return new Promise((resolve) => {
      el.modalTitle.textContent = title;
      el.modalBody.innerHTML = "";
      el.modalActions.innerHTML = "";
      el.modalRoot.classList.remove("hidden");
      el.modalRoot.setAttribute("aria-hidden", "false");

      const textarea = document.createElement("textarea");
      textarea.placeholder = placeholder || "";
      textarea.value = initialValue || "";
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
  return state.currentUser && (state.currentUser.role === "admin" || state.currentUser.role === "administrador" || state.currentUser.role === "admin2");
}

  function approvedWorkers() {
    return state.users.filter((user) => user.status === "aprobado" && user.accountStatus !== "inactivo" && (user.role === "trabajador" || user.role === "mecanico"));
  }

  function availableWorkers() {
    return approvedWorkers().filter((worker) => workerAvailability(worker.id) !== "franco");
  }

  async function assignReportToWorker(report, worker) {
    if (workerAvailability(worker.id) === "franco") {
      showToast(`${worker.name} esta de franco en este plan.`);
      return;
    }
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
      availableWorkers(),
      (worker) => `
        <strong>${worker.name}</strong>
        <span>${specialtyLabel(worker.specialty)} - Disponible</span>
      `,
      "No hay mecanicos disponibles. Revisa los francos del plan."
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
        <span>${report.location || "Sin ubicacion"} - ${report.deviation || "Sin falla"} - ${displayStatus(report.status)}${report.mechanicId ? ` - Asignado a ${workerName(report.mechanicId)}` : ""}</span>
      `,
      "No hay reportes activos para asignar."
    );
    if (selected) await assignReportToWorker(selected, worker);
  }

  function openManualPlanModal(worker) {
    return new Promise((resolve) => {
      el.modalTitle.textContent = `Carga manual para ${worker.name}`;
      el.modalBody.innerHTML = "";
      el.modalActions.innerHTML = "";
      el.modalRoot.classList.remove("hidden");
      el.modalRoot.setAttribute("aria-hidden", "false");

      const titleLabel = document.createElement("label");
      titleLabel.textContent = "Equipo o tarea";
      const titleInput = document.createElement("input");
      titleInput.placeholder = "Ej: Recorrido YPF";
      titleLabel.appendChild(titleInput);

      const locationLabel = document.createElement("label");
      locationLabel.textContent = "Ubicacion";
      const locationInput = document.createElement("input");
      locationInput.placeholder = "Ej: Vista";
      locationLabel.appendChild(locationInput);

      const detailLabel = document.createElement("label");
      detailLabel.textContent = "Detalle";
      const detailInput = document.createElement("textarea");
      detailInput.placeholder = "Observaciones, lugar o trabajo a realizar";
      detailLabel.appendChild(detailInput);

      el.modalBody.appendChild(titleLabel);
      el.modalBody.appendChild(locationLabel);
      el.modalBody.appendChild(detailLabel);
      el.modalActions.appendChild(button("Cancelar", "secondary", () => {
        closeModal();
        resolve(null);
      }));
      el.modalActions.appendChild(button("Agregar", "primary", () => {
        const title = titleInput.value.trim();
        const location = locationInput.value.trim();
        const detail = detailInput.value.trim();
        closeModal();
        resolve(title ? { title, location, detail } : null);
      }));
      titleInput.focus();
    });
  }

  async function createManualPlanItem(worker) {
    if (!isAdmin()) return;
    if (workerAvailability(worker.id) === "franco") {
      showToast(`${worker.name} esta de franco en este plan.`);
      return;
    }
    const manual = await openManualPlanModal(worker);
    if (!manual) {
      showToast("Escribi el equipo o tarea para agregar.");
      return;
    }

    const report = {
      id: uid(),
      equipment: manual.title,
      location: manual.location || "Plan Manana",
      deviation: manual.detail || "Carga manual del Plan Manana",
      status: "Pendiente",
      mechanic_id: worker.id,
      plan_date: state.planDate,
      created_at: new Date().toISOString(),
      created_by: state.currentUser.id
    };

    const { error } = await supabase.from("reports").insert(report);
    if (error) {
      showToast("No se pudo agregar la carga manual: " + error.message);
      return;
    }

    await saveCurrentLocationForReport(report);
    await createNotification(`${normalizeEquipment(report.equipment)} agregado manualmente a ${worker.name}`);
    await refreshAllData();
    showToast("Carga manual agregada.");
  }
  function todayLabel() {
    return new Date().toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function setScreen(name, options = {}) {
    if (name !== "auth" && !isLoggedIn()) {
      name = "auth";
    }

    // Leemos el rol del usuario que entró
    const role = state.currentUser ? state.currentUser.role : null;
    const isFullAdmin = role === "admin" || role === "administrador";
    const isAdmin2 = role === "admin2";

    // 1. Los administradores (Jefe y Admi 2) no entran a "Mis trabajos" de mecánicos
    if (isLoggedIn() && (isFullAdmin || isAdmin2) && name === "myJobs") {
      name = "home";
    }

    // 2. Los mecánicos comunes NO pueden entrar a NADA del panel de control
    if (isLoggedIn() && !isFullAdmin && !isAdmin2 && ["panel", "validations", "operatives", "users"].includes(name)) {
      name = "home";
    }

    // 3. LA REGLA DE ORO: Si es Admi 2 y quiere entrar a Gestión de Mecánicos ("users"), lo pateamos a "home"
    if (isLoggedIn() && isAdmin2 && name === "users") {
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

    if (options.history !== false && window.history?.pushState) {
      const nextState = { screen: name };
      if (options.replaceHistory || !history.state?.screen) {
        history.replaceState(nextState, "", `#${name}`);
      } else if (history.state.screen !== name) {
        history.pushState(nextState, "", `#${name}`);
      }
    }
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
    if (el.locationsBtn) el.locationsBtn.style.display = isLoggedIn() ? "block" : "none";

  }

  function renderHome() {
  }

  function renderImmediate() {
    fillSelect(el.immediateForm.elements.mechanic, approvedWorkers(), { placeholder: "Sin asignar" });

    // 1. Inyectamos el buscador de días dinámicamente
    let daysSearchContainer = document.getElementById("days-search-container");
    if (!daysSearchContainer) {
        daysSearchContainer = document.createElement("div");
        daysSearchContainer.id = "days-search-container";
        daysSearchContainer.innerHTML = `<input type="number" id="days-search-input" min="0" placeholder="⏳ Filtrar por antigüedad (ej: 0 para hoy, 1 para ayer...)" style="width: 100%; padding: 12px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #444; background-color: #1e1e1e; color: white; font-size: 16px;">`;
        // Lo insertamos justo antes de la lista de reportes
        el.immediateList.parentNode.insertBefore(daysSearchContainer, el.immediateList);
        
        // Cada vez que se escribe un número, redibujamos la lista
        document.getElementById("days-search-input").addEventListener("input", renderImmediate);
    }

    el.immediateList.innerHTML = "";
    const reports = visibleActiveReports();
    if (!reports.length) {
      el.immediateList.appendChild(empty("Todavía no hay reportes inmediatos."));
      return;
    }

    // 2. Leemos el buscador de texto y nuestro nuevo buscador de días
    const search = normalizeEquipment(el.activeReportSearch?.value || "").toLowerCase();
    const daysInput = document.getElementById("days-search-input")?.value;
    const maxDays = daysInput !== "" ? parseInt(daysInput, 10) : null;

    // 3. Filtramos los reportes aplicando AMBOS filtros
    const filteredReports = reports.filter((report) => {
      // Chequeo de texto (por equipo, zona o falla)
      let matchText = true;
      if (search) {
        matchText = report.equipment?.toLowerCase().includes(search) ||
                    report.location?.toLowerCase().includes(search) ||
                    report.deviation?.toLowerCase().includes(search);
      }

      // Chequeo matemático (Días de antigüedad)
      let matchDays = true;
      if (maxDays !== null && !isNaN(maxDays)) {
        // "Si la antigüedad del reporte es menor o igual a lo que puso el usuario, mostralo"
        matchDays = reportAgeDays(report) <= maxDays;
      }

      return matchText && matchDays;
    });

    // 4. Dibujamos las tarjetas agrupadas
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
        actions.push(menuAction("Asignar", "primary", async () => chooseMechanicForReport(report)));
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
        actions.push(menuAction("Eliminar", "danger", async () => deleteReport(report, "Esta accion quita el reporte activo.")));
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
        if (available !== "franco") {
          actions.push(button("Agregar equipo", "primary", async () => chooseReportForWorker(worker)));
          actions.push(button("Carga manual", "secondary", async () => createManualPlanItem(worker)));
        }
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
            mapsButton(report),
            button("Ver detalles", "secondary", () => showReportDetails(report)),
            button("Ver historial", "secondary", () => showReportHistory(report))
          ];
          if (isAdmin() || report.mechanicId === state.currentUser.id) {
            reportActions.push(button("Marcar reparacion realizada", "ok", async () => markRepairDone(report)));
            if (!isOperativeInformedStatus(report.status)) {
              reportActions.push(button("Informar reparacion parcial", "secondary", async () => reportWorkAndKeepActive(report)));
            }
            if (isAdmin()) {
              reportActions.push(button("Eliminar asignacion", "danger", async () => removePlanAssignment(report)));
            }
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

  async function removePlanAssignment(report) {
    if (!isAdmin()) return;
    const ok = await openConfirmModal("Quitar asignaci\u00f3n", `Quitar ${report.equipment} del Plan Ma\u00f1ana? El reporte queda activo pero sin mec\u00e1nico.`, "Quitar");
    if (!ok) return;

    const updated = await updateReport(report.id, { mechanic_id: null, plan_date: null });
    mergeReportUpdate(report.id, updated, { mechanicId: null, planDate: "" });
    await createNotification(`${report.equipment} quitado del Plan Mañana por ${state.currentUser.name}`);
    await refreshAllData();
    showToast("Asignación eliminada.");
  }
  async function clearPlanAssignments() {
    if (!isAdmin()) return;
    const rows = planReports();
    if (!rows.length) {
      showToast("No hay asignaciones para limpiar en este plan.");
      return;
    }
    const ok = await openConfirmModal("Limpiar asignaciones", `Limpiar ${rows.length} asignaciones del Plan Ma\u00f1ana? Los reportes quedan activos pero sin mec\u00e1nico.`, "Limpiar");
    if (!ok) return;

    for (const report of rows) {
      await updateReport(report.id, { mechanic_id: null, plan_date: null });
    }

    await createNotification(`Plan Mañana ${state.planDate} limpiado por ${state.currentUser.name}`);
    await refreshAllData();
    showToast("Asignaciones limpiadas.");
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
          mapsButton(report),
          button("Ver detalles", "secondary", () => showReportDetails(report)),
          button("Ver historial", "secondary", () => showReportHistory(report)),
          button("Solicitar repuesto", "secondary", () => {
            setScreen("orders");
            el.orderForm.elements.equipment.value = report.equipment;
          })
        ];
        if (!isOperativeInformedStatus(report.status)) {
          actions.push(button("Informar equipo operativo", "ok", async () => markRepairDone(report)));
          actions.push(button("Informar reparacion parcial", "secondary", async () => reportWorkAndKeepActive(report)));
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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      showToast("Volve a iniciar sesion.");
      return;
    }

    const response = await fetch("/api/update-availability", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        worker_id: workerId,
        date: state.planDate,
        status
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(result.error || "No se pudo guardar disponibilidad.");
      return;
    }
    if (result.availability) {
      const next = normalizeAvailability(result.availability);
      state.availability = state.availability.filter((row) => !(row.workerId === next.workerId && row.date === next.date));
      state.availability.push(next);
    }
    showToast("Disponibilidad guardada.");
  }
  async function markRepairDone(report) {
    const description = await openTextModal("Informar equipo operativo", "Qué reparación se realizó, repuestos usados, observaciones y horómetro final");
    if (description === null) return;
    const note = description.trim();
    if (!note) {
      showToast("Para marcar la reparación, tenés que escribir qué hiciste.");
      return;
    }
    await saveCurrentLocationForReport(report);
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

  function reportActiveStatusAfterWork(report) {
    const current = displayStatus(report.status);
    if (isOperativeInformedStatus(report.status)) {
      return report.previousStatus && report.previousStatus !== "PV" ? report.previousStatus : "FS";
    }
    if (/^OBS$/i.test(current) || /^FS$/i.test(current)) return current;
    return "FS";
  }

  function appendRepairNote(report, note) {
    const entry = `${state.currentUser.name} realizo: ${note}. Sigue activo / queda probar.`;
    return report.repairNote ? `${report.repairNote} | ${entry}` : entry;
  }

  async function reportWorkAndKeepActive(report) {
    const description = await openTextModal("Informar reparacion parcial", "Que hizo el mecanico y por que sigue activo: queda probar, no quedo OP, falta repuesto, etc.");
    if (description === null) return;
    const note = description.trim();
    if (!note) {
      showToast("Escribi que trabajo se hizo antes de devolverlo a reportes activos.");
      return;
    }
    const nextStatus = reportActiveStatusAfterWork(report);
    await saveCurrentLocationForReport(report);
    await updateReport(report.id, {
      status: nextStatus,
      previous_status: nextStatus,
      mechanic_id: null,
      plan_date: null,
      repair_note: appendRepairNote(report, note),
      repaired_by: state.currentUser.name,
      repaired_at: new Date().toISOString()
    });
    await createNotification(`${report.equipment} vuelve a reportes activos. ${state.currentUser.name} informo: ${note}`);
    await refreshAllData();
    showToast("Trabajo informado y equipo devuelto a reportes activos.");
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
    const location = await openTextModal("Editar ubicación", "Ubicación", report.location || "");
    if (location === null) return;
    const deviation = await openTextModal("Editar falla / desvío", "Falla / desvío", report.deviation || "");
    if (deviation === null) return;
    const status = await openTextModal("Editar estado", "Estado", displayStatus(report.status));
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
  // 1. Abrimos la misma ventanita de texto que usa el mecánico
  const description = await openTextModal(
    `Validar ${report.equipment} a Operativo`, 
    "Qué reparación se realizó (Dejalo en blanco si el mecánico ya lo informó)"
  );
  
  // Si apretás Cancelar, no hacemos nada
  if (description === null) return; 
  
  const note = description.trim();
  
  // 2. Preparamos los datos básicos de la validación
  const updates = {
    status: "Operativo validado",
    mechanic_id: null,
    plan_date: null,
    validated_by: state.currentUser.name,
    validated_at: new Date().toISOString()
  };

  // 3. Si escribiste algo, guardamos tus tareas como reparación
  if (note) {
    updates.repair_note = note;
    updates.repaired_by = state.currentUser.name;
    updates.repaired_at = new Date().toISOString();
    updates.operation_note = note;
    updates.operated_by = state.currentUser.name;
  }

  // 4. Mandamos todo a la base de datos
  await updateReport(report.id, updates);
  
  // 5. Creamos la notificación (con o sin el texto según lo que escribiste)
  const mensajeNoti = note 
    ? `${report.equipment} validado por ${state.currentUser.name}: ${note}`
    : `${report.equipment} validado operativo por ${state.currentUser.name}`;
    
  await createNotification(mensajeNoti);
  await refreshAllData(); // Como tenemos Realtime, esto actualiza la pantalla de todos al instante
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

  function mechanicReportRows() {
    const rows = state.reports.filter((row) => isTechnicalObservation(row) || row.operationNote);
    return rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function renderMechanicEquipmentHistory() {
    if (!el.mechanicEquipmentHistory || !el.mechanicForm) return;
    el.mechanicEquipmentHistory.innerHTML = "";
    const equipment = normalizeEquipment(el.mechanicForm.elements.equipment?.value || "");
    if (!equipment) {
      el.mechanicEquipmentHistory.appendChild(empty("Escribi un interno para ver su historial."));
      return;
    }
    const rows = relatedReports(equipment).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (!rows.length) {
      el.mechanicEquipmentHistory.appendChild(empty("Ese equipo no tiene movimientos cargados."));
      return;
    }
    rows.slice(0, 12).forEach((row) => {
      el.mechanicEquipmentHistory.appendChild(card(
        row.equipment,
        displayStatus(row.status),
        `${formatDateTime(row.createdAt)} - ${row.location || "Sin ubicacion"} - ${row.deviation || "Sin falla"}${row.repairNote ? " - Reparacion: " + row.repairNote : ""}`,
        [button("Ver detalles", "secondary", () => showReportDetails(row))]
      ));
    });
  }

  function renderMechanicReports() {
    if (!el.mechanicList) return;
    el.mechanicList.innerHTML = "";
    renderMechanicEquipmentHistory();
    const rows = mechanicReportRows();
    if (!rows.length) {
      el.mechanicList.appendChild(empty("No hay movimientos cargados."));
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
        actions.push(button("Realizado", "ok", async () => {
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
    if (el.orderForm?.elements?.requester) fillSelect(el.orderForm.elements.requester, approvedWorkers());
    fillSelect(el.orderFilter, approvedWorkers(), { all: true });
    const selected = el.orderFilter.value || "all";
    const equipmentFilter = normalizeEquipment(el.orderEquipmentFilter?.value || "");
    const destinationFilter = el.orderDestinationFilter?.value || "all";
    el.ordersList.innerHTML = "";

    const editor = renderOrderEditor();
    if (editor) el.ordersList.appendChild(editor);

    const rows = state.orders.filter((order) => {
      const matchesUser = selected === "all" || order.requesterId === selected;
      const matchesEquipment = !equipmentFilter || order.equipment.includes(equipmentFilter);
      const matchesDestination = destinationFilter === "all" || order.destination === destinationFilter;
      return matchesUser && matchesEquipment && matchesDestination;
    });

    if (!rows.length) {
      el.ordersList.appendChild(empty("No hay pedidos cargados."));
      return;
    }

    rows.forEach((order) => {
      const traffic = orderTraffic(order);
      const items = filledOrderItems(order);
      const actions = [
        button(orderEditable(order) ? "Ver / editar hoja" : "Ver hoja", "secondary", () => {
          state.orderDraft = orderDraftFromOrder(order);
          renderOrders();
        }),
        button("Copiar WhatsApp", "secondary", async () => copyOrder(order))
      ];

      if (orderEditable(order)) {
        actions.push(button("Marcar pedido", "ok", async () => {
          await supabase.from("orders").update({ status: "Pedido" }).eq("id", order.id);
          await refreshAllData();
        }));
      }

      if (isAdmin()) {
        actions.push(button("Marcar recibido", "ok", async () => {
          await supabase.from("orders").update({ status: "Recibido" }).eq("id", order.id);
          await refreshAllData();
        }));
        actions.push(button(order.status === "Cerrado" ? "Reabrir" : "Cerrar", "danger", async () => {
          await supabase.from("orders").update({ status: order.status === "Cerrado" ? "Pedido" : "Cerrado" }).eq("id", order.id);
          await refreshAllData();
        }));
        actions.push(button("Eliminar", "danger", async () => {
          const ok = await openConfirmModal("Eliminar pedido", `Eliminar el pedido de ${order.equipment}? Esta acci\u00f3n no se puede deshacer.`, "Eliminar");
          if (!ok) return;
          await supabase.from("orders").delete().eq("id", order.id);
          await refreshAllData();
          showToast("Pedido eliminado.");
        }));
      }

      const article = card(order.equipment || "Sin interno", traffic.label, `${order.requesterName} · ${order.destination || "Sin destino"} · ${items.length} repuestos · ${formatDateTime(order.createdAt)}`, actions);
      article.classList.add("order-card", `order-card-${traffic.className}`);
      el.ordersList.appendChild(article);
    });
  }

  function renderOrderEditor() {
    const draft = state.orderDraft;
    if (!draft) return null;
    const canEdit = !draft.id || orderEditable(draft);
    const section = document.createElement("section");
    section.className = "panel order-editor";
    section.innerHTML = `
      <div class="order-editor-head">
        <div>
          <p class="eyebrow">Hoja de repuestos</p>
          <h2>${draft.id ? "Editar pedido" : "Pedido nuevo"}</h2>
        </div>
        <button type="button" class="secondary" data-order-cancel>Cerrar</button>
      </div>
      <div class="order-info-grid">
        <label>Interno<input data-order-field="equipment" value="${draft.equipment}" placeholder="Ej.: CF-38"></label>
        <label>Solicitante<input value="${draft.requesterName}" disabled></label>
        <label>Fecha<input value="${formatDateTime(draft.createdAt)}" disabled></label>
        <label>Destino<select data-order-field="destination"><option>Añelo</option><option>Plottier</option></select></label>
      </div>
      <div class="sheet-wrap">
        <table class="order-sheet">
          <thead><tr><th>Pag.</th><th>Referencia</th><th>Código</th><th>Descripción</th><th>Cant. urgente</th><th>Cant. stock</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <section class="order-history-block">
        <div class="order-history-head">
          <h3>Historial</h3>
          <input data-history-filter type="text" placeholder="Filtrar por palabra clave o código">
        </div>
        <div class="order-history-results"></div>
      </section>
      <div class="card-actions">
        ${canEdit ? `<button type="button" class="primary" data-order-save>Guardar hoja</button>` : ``}
        <button type="button" class="ok" data-order-copy>Copiar WhatsApp</button>
      </div>
    `;

    const destination = section.querySelector('[data-order-field="destination"]');
    destination.value = draft.destination || "Añelo";
    destination.disabled = !canEdit;
    destination.addEventListener("change", (event) => { draft.destination = event.target.value; });
    const equipmentInput = section.querySelector('[data-order-field="equipment"]');
    equipmentInput.disabled = !canEdit;
    equipmentInput.addEventListener("input", (event) => { draft.equipment = normalizeEquipment(event.target.value); });
    section.querySelector("[data-order-cancel]").addEventListener("click", () => { state.orderDraft = null; renderOrders(); });
    section.querySelector("[data-order-save]")?.addEventListener("click", saveOrderDraft);
    section.querySelector("[data-order-copy]").addEventListener("click", async () => copyOrder(draft));

    const tbody = section.querySelector("tbody");
    draft.items.forEach((item, index) => {
      const tr = document.createElement("tr");
      [["page", "Pag."], ["reference", "Referencia"], ["code", "Código"], ["description", "Descripción"], ["urgentQty", "Urg."], ["stockQty", "Stock"]].forEach(([key, label]) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.value = item[key] || "";
        input.placeholder = label;
        input.disabled = !canEdit;
        input.addEventListener("input", (event) => setOrderDraftItem(index, key, event.target.value));
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    const filter = section.querySelector("[data-history-filter]");
    const results = section.querySelector(".order-history-results");
    const drawHistory = () => {
      results.innerHTML = "";
      const rows = filteredOrderHistory(filter.value);
      if (!rows.length) {
        results.appendChild(empty("No hay repuestos previos para ese filtro."));
        return;
      }
      rows.forEach((item) => {
        const row = document.createElement("div");
        row.className = "history-row";
        row.innerHTML = `<div><strong></strong><span></span></div><small></small><button type="button" class="secondary">Agregar</button>`;
        row.querySelector("strong").textContent = item.code || "Sin código";
        row.querySelector("span").textContent = item.description || "Sin descripción";
        row.querySelector("small").textContent = `${item.times} veces`;
        const addButton = row.querySelector("button");
        addButton.disabled = !canEdit;
        addButton.addEventListener("click", () => addHistoryItemToDraft(item));
        if (isAdmin()) {
          row.title = "Mantener presionado para eliminar del historial";
          let longPressTimer = null;
          let longPressHandled = false;
          const clearLongPress = () => {
            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = null;
            row.classList.remove("pressing");
          };
          row.addEventListener("pointerdown", (event) => {
            if (event.target.closest("button")) return;
            longPressHandled = false;
            row.classList.add("pressing");
            longPressTimer = setTimeout(async () => {
              longPressHandled = true;
              clearLongPress();
              await deleteOrderHistoryItem(item);
            }, 700);
          });
          row.addEventListener("pointerup", clearLongPress);
          row.addEventListener("pointerleave", clearLongPress);
          row.addEventListener("pointercancel", clearLongPress);
          row.addEventListener("contextmenu", async (event) => {
            event.preventDefault();
            clearLongPress();
            if (longPressHandled) return;
            await deleteOrderHistoryItem(item);
          });
        }
        results.appendChild(row);
      });
    };
    filter.addEventListener("input", drawHistory);
    drawHistory();

    return section;
  }

  async function saveOrderDraft() {
    const draft = state.orderDraft;
    if (!draft || !state.currentUser) return;
    if (draft.id && !orderEditable(draft)) {
      showToast("Solo el solicitante o admin puede editar este pedido.");
      return;
    }
    const items = draft.items.map(normalizeOrderRow);
    const filledItems = items.filter((item) => item.page || item.reference || item.code || item.description || item.urgentQty || item.stockQty);
    const orderLike = { ...draft, items: filledItems };
    const traffic = orderTraffic(orderLike);
    const payload = {
      equipment: normalizeEquipment(draft.equipment),
      requester_id: draft.requesterId || state.currentUser.id,
      requester_name: draft.requesterName || state.currentUser.name,
      need: orderNeedFromItems(filledItems),
      status: traffic.status,
      destination: draft.destination || "Añelo",
      items: filledItems,
      whatsapp_text: generateOrderWhatsAppText({ ...draft, items: filledItems, status: traffic.status }),
      updated_at: new Date().toISOString()
    };

    if (!payload.equipment) {
      showToast("Cargá el interno antes de guardar.");
      return;
    }

    if (draft.id) {
      await supabase.from("orders").update(payload).eq("id", draft.id);
    } else {
      await supabase.from("orders").insert({ id: uid(), ...payload, created_at: new Date().toISOString() });
    }
    await createNotification(`Pedido de repuestos guardado para ${payload.equipment}`);
    state.orderDraft = null;
    await refreshAllData();
  }

  function generateOrderWhatsAppText(order) {
    const items = filledOrderItems(order);
    const urgent = items.filter((item) => Number(item.urgentQty) > 0);
    const stock = items.filter((item) => Number(item.stockQty) > 0);
    const lines = [
      "PEDIDO DE REPUESTOS",
      "",
      `Solicita: ${order.requesterName}`,
      `Equipo: ${order.equipment}`,
      `Destino: ${order.destination || "Sin destino"}`,
      `Estado: ${order.status || orderTraffic(order).label}`,
      `Fecha: ${formatDateTime(order.createdAt || new Date().toISOString())}`,
      ""
    ];
    const addBlock = (title, rows, qtyKey) => {
      if (!rows.length) return;
      lines.push(title);
      rows.forEach((item) => {
        lines.push(`- Pag ${item.page || "s/d"} | Ref ${item.reference || "s/d"} | ${item.code || "s/c"} | ${item.description || "Sin descripción"} | Cant: ${item[qtyKey]}`);
      });
      lines.push("");
    };
    addBlock("URGENTE", urgent, "urgentQty");
    addBlock("STOCK", stock, "stockQty");
    if (!urgent.length && !stock.length) lines.push(order.need || "Sin repuestos cargados");
    return lines.join("\n");
  }

  async function copyOrder(order) {
    const text = order.whatsappText || generateOrderWhatsAppText(order);
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
    // 1. Nos aseguramos de que exista el buscador antes de la lista
    let searchContainer = document.getElementById("fleet-search-container");
    if (!searchContainer) {
        searchContainer = document.createElement("div");
        searchContainer.id = "fleet-search-container";
        // Le damos estilo oscuro para que combine con tu panel
        searchContainer.innerHTML = `<input type="text" id="fleet-search-input" placeholder="🔍 Buscar por interno, pieza o nota..." style="width: 100%; padding: 12px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #444; background-color: #1e1e1e; color: white; font-size: 16px;">`;
        
        // Lo insertamos justo arriba de la lista de flota
        el.fleetList.parentNode.insertBefore(searchContainer, el.fleetList);

        // Cada vez que el usuario teclea una letra, redibujamos la lista al instante
        document.getElementById("fleet-search-input").addEventListener("input", renderFleet);
    }

    // 2. Limpiamos la lista de tarjetas (pero el buscador queda intacto)
    el.fleetList.innerHTML = "";
    
    if (!state.fleet.length) {
      el.fleetList.appendChild(empty("No hay equipos cargados."));
      return;
    }

    // 3. Leemos qué escribió el usuario en el buscador
    const query = document.getElementById("fleet-search-input").value.toLowerCase();

    // 4. Filtramos la flota y la ordenamos alfanuméricamente
    const filteredAndSortedFleet = [...state.fleet]
      .filter((item) => {
         // Buscamos coincidencia en el nombre, las partes o las notas
         const searchString = `${item.equipment} ${item.parts} ${item.notes}`.toLowerCase();
         return searchString.includes(query);
      })
      .sort((a, b) => {
        const eqA = a.equipment || "";
        const eqB = b.equipment || "";
        return eqA.localeCompare(eqB, undefined, { numeric: true, sensitivity: 'base' });
      });

    // 5. Si el filtro no encuentra nada, avisamos
    if (!filteredAndSortedFleet.length) {
      el.fleetList.appendChild(empty("No se encontraron equipos con esa búsqueda."));
      return;
    }

    // 6. Dibujamos los equipos que pasaron el filtro y el orden
    filteredAndSortedFleet.forEach((item) => {
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
    
    // Filtramos los validados y los ORDENAMOS por fecha (el más nuevo arriba)
    const rows = state.reports
      .filter((report) => report.status === "Operativo validado")
      .sort((a, b) => {
        const dateA = new Date(a.validatedAt || a.created_at || 0).getTime();
        const dateB = new Date(b.validatedAt || b.created_at || 0).getTime();
        return dateB - dateA; // Orden descendente (más nuevo a más viejo)
      });

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
          button("Eliminar", "danger", async () => deleteReport(report, "Esta accion quita el operativo validado."))
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
        button("Devolver a Reportes activos", "secondary", async () => rejectReport(report)),
        button("Eliminar", "danger", async () => deleteReport(report, "Esta accion quita el equipo de validaciones pendientes."))
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
      let roleLabel = (user.role === "admin" || user.role === "administrador") ? "Administrador" : (user.role === "admin2") ? "Admi 2" : "Trabajador";
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


  function renderLocations() {
    if (!el.locationsList) return;
    el.locationsList.innerHTML = "";
    const search = normalizeLocationText(el.locationSearch?.value || "");
    const rows = [...state.savedLocations]
      .filter((item) => {
        if (!search) return true;
        return normalizeLocationText(`${item.name} ${item.sourceEquipment || ""}`).includes(search);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" }));

    if (!rows.length) {
      el.locationsList.appendChild(empty(search ? "No encontre ubicaciones con ese filtro." : "Todavia no hay ubicaciones guardadas."));
      return;
    }

    rows.forEach((item) => {
      if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return;
      const coords = `${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}`;
      const details = `${coords}${item.sourceEquipment ? " - Origen: " + item.sourceEquipment : ""}${item.createdAt ? " - " + formatDateTime(item.createdAt) : ""}`;
      const actions = [
        button("Abrir Maps", "primary", () => window.open(`https://www.google.com/maps?q=${item.latitude},${item.longitude}`, "_blank", "noopener"))
      ];
      if (isAdmin()) {
        actions.push(button("Editar", "secondary", () => editSavedLocation(item)));
        actions.push(button("Eliminar", "danger", () => deleteSavedLocation(item)));
      }
      el.locationsList.appendChild(card(item.name, "GPS", details, actions));
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
    renderLocations();
    renderNotifications();
  }

  function populateUserFilter() {
    const options = SPECIALTY_OPTIONS.map((option) => ({ id: option.value, name: option.label }));
    fillSelect(el.userFilter, options, { all: true });
  }

  async function refreshAllData() {
    if (!supabase) return;
    const [profiles, reports, orders, fleet, notifications, availability, savedLocations] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("reports").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("fleet_items").select("*").order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      supabase.from("worker_availability").select("*").eq("date", state.planDate),
      supabase.from("saved_locations").select("*").order("created_at", { ascending: false })
    ]);

    state.users = (profiles.data || []).map(normalizeUser);
    state.reports = (reports.data || []).map(normalizeReport);
    state.orders = (orders.data || []).map(normalizeOrder);
    state.fleet = (fleet.data || []).map(normalizeFleet);
    state.notifications = (notifications.data || []).map(normalizeNotification);
    state.availability = (availability.data || []).map(normalizeAvailability);
    state.savedLocations = (savedLocations.data || []).map(normalizeSavedLocation);

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

  function playNotificationSound() {
    try {
      // Usamos un sonido de notificación corto y profesional
      const audio = new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3");
      audio.play();
    } catch (e) {
      console.log("El navegador bloqueó el sonido automático");
    }
  }

  async function createNotification(text, type = "info", targetUserId = null) {
    if (!supabase || !state.currentUser) return;
    await supabase.from("notifications").insert({
      id: uid(),
      text,
      is_read: false,
      created_by: state.currentUser.id,
      type: type,
      target_user_id: targetUserId
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
      setScreen("auth", { replaceHistory: true });
      return;
    }

    if (!config.url || !config.anonKey || config.url.includes("your-project") || config.anonKey.includes("your-anon")) {
      el.loginError.textContent = "Configurá los valores de Supabase en supabase-config.js antes de usar la app.";
      setScreen("auth", { replaceHistory: true });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadCurrentUser(session.user.id);
    }
    await refreshAllData();
    setScreen(state.currentUser ? "home" : "auth", { replaceHistory: true });

    realtimeChannel = supabase.channel("fleet-realtime");
    realtimeChannel
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "fleet_items" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_availability" }, () => refreshAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "saved_locations" }, () => refreshAllData())
      .subscribe();
  }

  el.modalRoot?.addEventListener("click", (event) => {
    if (event.target !== el.modalRoot) return;
    if (notificationsModalOpen) {
      closeNotificationsModalFromUi(null);
      return;
    }
    if (modalCancelHandler) {
      cancelModal();
      return;
    }
    closeModal();
  });

  window.addEventListener("popstate", (event) => {
    if (notificationsModalOpen) {
      closeNotificationsModal(null);
      return;
    }
    const screen = event.state?.screen || "home";
    setScreen(screen, { history: false });
  });
  document.querySelectorAll("[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => setScreen(btn.dataset.screen));
  });

  el.backBtn.addEventListener("click", () => setScreen("home"));
  el.usersBtn.addEventListener("click", () => setScreen("users"));
  el.notificationsBtn?.addEventListener("click", () => window.showNotificationsHistory?.());
  el.locationsBtn?.addEventListener("click", () => setScreen("locations"));
  el.locationSearch?.addEventListener("input", renderLocations);
  el.addLocationGpsBtn?.addEventListener("click", addCurrentLocationManually);
  el.addLocationLinkBtn?.addEventListener("click", addLocationFromLink);
  el.mechanicForm?.elements?.equipment?.addEventListener("input", renderMechanicEquipmentHistory);

  el.planDate?.addEventListener("change", async () => {
    state.planDate = el.planDate.value || state.planDate;
    await refreshAllData();
  });

  el.refreshPlanBtn?.addEventListener("click", () => refreshAllData());
  el.clearPlanBtn?.addEventListener("click", clearPlanAssignments);
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
    const equipment = normalizeEquipment(form.get("equipment"));
    const deviations = String(form.get("deviation") || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const note = String(form.get("notes") || "").trim();
    if (!equipment || !deviations.length) {
      showToast("Carga el interno y al menos un desvio.");
      return;
    }

    const createdAt = new Date().toISOString();
    const payload = deviations.map((deviation) => ({
      id: uid(),
      equipment,
      deviation,
      operation_note: note,
      status: "Observacion tecnica",
      created_at: createdAt,
      created_by: state.currentUser.id
    }));
    const { error } = await supabase.from("reports").insert(payload);
    if (error) {
      showToast("No se pudo guardar el reporte: " + error.message);
      return;
    }
    await createNotification(`${deviations.length} movimiento${deviations.length === 1 ? "" : "s"} tecnico${deviations.length === 1 ? "" : "s"} en ${equipment}`);
    await refreshAllData();
    el.mechanicForm.reset();
    renderMechanicEquipmentHistory();
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

  el.newOrderBtn?.addEventListener("click", () => { state.orderDraft = orderDraftFromOrder(); renderOrders(); });
  el.orderFilter.addEventListener("change", renderOrders);
  el.orderEquipmentFilter?.addEventListener("input", renderOrders);
  el.orderDestinationFilter?.addEventListener("change", renderOrders);
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
    const specialtyInput = form.get("specialty").trim();

    // 1. Verificamos que TODOS los campos estén llenos
    if (!name || !username || !password || !specialtyInput) {
      el.userFeedback.textContent = "Completa nombre, usuario, contrasena y especialidad.";
      return;
    }

    // 2. Si pasó, recién ahí definimos los roles
  const role = (specialtyInput === "admin2") ? "admin2" : "mecanico";
    const specialty = (specialtyInput === "admin2") ? "Administracion" : specialtyInput;
    const accountStatus = "activo";


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

 // ==========================================
// CANALES DE TIEMPO REAL (REPORTE Y NOTIFICACIONES)
// ==========================================

// 1. Escuchar cambios en los Reportes (Para que la pantalla se actualice sola)
supabase
  .channel('cambios-reportes')
  .on(
    'postgres_changes', 
    { event: '*', schema: 'public', table: 'reports' }, 
    (payload) => {
      console.log('¡Cambio en reportes detectado en tiempo real!');
      refreshAllData();
    }
  )
  .subscribe();

  // CENTRO DE NOTIFICACIONES
  window.showNotificationsHistory = async function() {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) return showToast("Error al cargar notificaciones");

    const myNotis = data.filter(noti => {
      if (noti.target_user_id && noti.target_user_id !== state.currentUser.id) return false;
      if (noti.type === "validacion" && !isAdmin()) return false;
      return true;
    });

    const options = myNotis.map(noti => {
      const hora = new Date(noti.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      return { id: noti.id, name: `[${hora}] ${noti.text}` };
    });

    if (options.length === 0) {
      options.push({ id: "nada", name: "No hay notificaciones recientes." });
    }

// Apagar el globito rojo cuando el usuario lee los avisos
    const badge = document.getElementById('badgeNotificaciones');
    if (badge) {
      badge.classList.add('hidden');
      badge.innerText = '0';
    }
    
    await openNotificationsModal(
      "Historial de Notificaciones",
      options, 
      (item) => `<strong>${item.name}</strong>`, 
      "Cerrar historial"
    );
  };

  function playNotificationSound() {
    const audio = new Audio("https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3");
    // El .catch evita que el navegador tire el error rojo y frene la app
    audio.play().catch(e => console.log("Sonido silenciado temporalmente por falta de clic en la pantalla."));
  }

// 2. Escuchar cambios en las Notificaciones (Para que suene la campanita)
supabase
  .channel('cambios-notificaciones')
  .on(
    'postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'notifications' }, 
    (payload) => {
      console.log("🔥 SUPABASE MANDÓ ALGO:", payload.new);
      
      const noti = payload.new;
      
      if (noti.created_by === state.currentUser.id) return;
      if (noti.target_user_id && noti.target_user_id !== state.currentUser.id) return;
      if (noti.type === "validacion" && !isAdmin()) return;

      let makeNoise = false;
      if (isAdmin()) {
        makeNoise = true;
      } else if (noti.type === "asignacion") {
        makeNoise = true;
      }

      showToast("🔔 " + noti.text);
      
      if (makeNoise) {
        playNotificationSound();
      }

      // --- NUEVO: GLOBITO ROJO Y NOTIFICACIÓN DEL CELULAR ---

      // 1. Sumar 1 al globito rojo estilo Facebook
      const badge = document.getElementById('badgeNotificaciones');
      if (badge) {
        badge.classList.remove('hidden');
        badge.innerText = parseInt(badge.innerText || 0) + 1;
      }

      // 2. Mandar notificación a la barra del sistema (Compu y Celu)
      if ("Notification" in window && Notification.permission === "granted") {
        const titulo = "Gestión de Flota";
        const opciones = {
          body: noti.text,
          icon: "https://cdn-icons-png.flaticon.com/512/1827/1827370.png",
          vibrate: [200, 100, 200] // Hace que el celu vibre
        };

        // Si el celular tiene un canal de fondo activo (Service Worker)
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(titulo, opciones);
          }).catch(() => {
            // Si falla, intentamos el método directo
            try { new Notification(titulo, opciones); } catch(e) {}
          });
        } else {
          // Método clásico para la computadora
          try {
            new Notification(titulo, opciones);
          } catch (e) {
            console.log("Fallo al crear notificación directa:", e);
          }
        }
      }
    }
  )
  .subscribe();
  
})();
