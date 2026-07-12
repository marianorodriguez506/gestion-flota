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
    tomorrow: { id: "tomorrowScreen", title: "Plan mañana", label: "Asignaciones" },
    mechanic: { id: "mechanicScreen", title: "Reporte mecánico", label: "Observaciones" },
    orders: { id: "ordersScreen", title: "Pedidos", label: "Solicitudes" },
    history: { id: "historyScreen", title: "Historial de pedidos", label: "Consulta" },
    fleet: { id: "fleetScreen", title: "Información de flota", label: "Equipos" },
    operatives: { id: "operativesScreen", title: "Operativos", label: "Validado" },
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
    notifications: [],
    availability: [],
    planDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10)
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
    planDate: document.getElementById("planDate"),
    refreshPlanBtn: document.getElementById("refreshPlanBtn"),
    copyPlanBtn: document.getElementById("copyPlanBtn"),
    manualPlanForm: document.getElementById("manualPlanForm"),
    availabilityList: document.getElementById("availabilityList"),
    tomorrowList: document.getElementById("tomorrowList"),
    mechanicForm: document.getElementById("mechanicForm"),
    mechanicList: document.getElementById("mechanicList"),
    orderForm: document.getElementById("orderForm"),
    orderFilter: document.getElementById("orderFilter"),
    ordersList: document.getElementById("ordersList"),
    historyList: document.getElementById("historyList"),
    fleetForm: document.getElementById("fleetForm"),
    fleetList: document.getElementById("fleetList"),
    operativesList: document.getElementById("operativesList"),
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
      accountStatus: row.account_status || (row.status === "rechazado" ? "inactivo" : "activo"),
      specialty: row.specialty || "",
      requestedAt: row.created_at || ""
    };
  }

  function userToEmail(value) {
    const username = String(value || "").trim().toLowerCase();
    return username.includes("@") ? username : `${username.replace(/\s+/g, ".")}@gestion-flota.local`;
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
    return state.reports.filter((report) => report.status !== "Operativo validado");
  }

  function displayStatus(status) {
    if (/^PV$/i.test(status) || /pendiente de valid/i.test(status)) return "PV";
    if (/^OBS$/i.test(status) || /observ/i.test(status)) return "OBS";
    if (/^FS$/i.test(status) || /fuera/i.test(status)) return "FS";
    if (/asignado/i.test(status)) return "FS";
    return status || "FS";
  }

  function workerAvailability(workerId, date = state.planDate) {
    return state.availability.find((row) => row.workerId === workerId && row.date === date)?.status || "disponible";
  }

  function workerName(workerId) {
    return state.users.find((user) => user.id === workerId)?.name || "Sin asignar";
  }

  function planReports() {
    return activeReports().filter((report) => report.mechanicId && (!report.planDate || report.planDate === state.planDate));
  }

  function myReports() {
    if (!state.currentUser) return [];
    return activeReports().filter((report) => report.mechanicId === state.currentUser.id);
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  }

  function reportLine(report) {
    const mechanic = workerName(report.mechanicId);
    const hourmeter = report.hourmeter ? ` · Horómetro: ${report.hourmeter}` : "";
    const repair = report.repairNote ? ` · Reparación: ${report.repairNote}` : "";
    return `${report.location || "Sin ubicación"} · ${report.deviation || "Sin falla"} · Mecánico: ${mechanic} · Fecha: ${report.planDate || state.planDate}${hourmeter}${repair}`;
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    prompt("Copiá este texto:", text);
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

    const unread = state.notifications.filter((item) => !item.read).length;
    el.notifyBtn.textContent = String(unread);
  }

  function renderHome() {
    el.homeFeed.innerHTML = "";
  }

  function renderImmediate() {
    fillSelect(el.immediateForm.elements.mechanic, approvedWorkers(), { placeholder: "Sin asignar" });
    el.immediateList.innerHTML = "";
    const reports = activeReports();
    if (!reports.length) {
      el.immediateList.appendChild(empty("Todavía no hay reportes inmediatos."));
      return;
    }

    const search = normalizeEquipment(
  el.activeReportSearch?.value || ""
).toLowerCase();

const filteredReports = reports.filter((report) => {
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
          if (workerAvailability(selected.id) === "franco") {
            const ok = confirm(`${selected.name} figura de franco para el plan. ¿Asignar igual?`);
            if (!ok) return;
          }
          await updateReport(report.id, { mechanic_id: selected.id, plan_date: state.planDate });
          await createNotification(`${report.equipment} asignado a ${selected.name}`);
          await refreshAllData();
        }));
        if (displayStatus(report.status) === "PV") {
          actions.push(button("Validar y pasar a Operativos", "ok", async () => validateReport(report)));
          actions.push(button("Rechazar / requiere revisión", "secondary", async () => rejectReport(report)));
        } else {
          actions.push(button("Validar operativo", "ok", async () => validateReport(report)));
        }
        actions.push(button("Quitar asignación", "secondary", async () => {
          await updateReport(report.id, { mechanic_id: null, plan_date: null });
          await refreshAllData();
        }));
        actions.push(button("Eliminar", "danger", async () => {
          const ok = confirm(`¿Eliminar el reporte ${report.equipment}?`);
          if (!ok) return;
          await supabase.from("reports").delete().eq("id", report.id);
          await refreshAllData();
        }));
      } else {
        actions.push(button("Marcar reparación realizada", "ok", async () => markRepairDone(report)));
      }
      el.immediateList.appendChild(card(report.equipment, displayStatus(report.status), `${reportLine(report)} · Trabajador: ${mechanic ? mechanic.name : "sin asignar"}`, actions));
    });
  }

  function renderTomorrow() {
    if (el.planDate && el.planDate.value !== state.planDate) el.planDate.value = state.planDate;
    if (el.manualPlanForm?.elements?.mechanic) {
      fillSelect(el.manualPlanForm.elements.mechanic, approvedWorkers(), { placeholder: "Elegir mecánico" });
      el.manualPlanForm.classList.toggle("hidden", !isAdmin());
    }
    el.tomorrowList.innerHTML = "";
    renderAvailability();

    const rows = planReports();
    const workers = approvedWorkers();

    if (!isAdmin()) {
      const mySection = document.createElement("article");
      mySection.className = "card my-jobs";
      mySection.innerHTML = `<div class="card-head"><h2>Mis trabajos</h2><span class="tag warn">${myReports().length}</span></div><div class="plan-items"></div>`;
      const myList = mySection.querySelector(".plan-items");
      const own = myReports();
      if (!own.length) {
        myList.appendChild(empty("No tenés equipos asignados."));
      } else {
        own.forEach((report) => {
          myList.appendChild(card(report.equipment, displayStatus(report.status), reportLine(report), [
            button("Detalle", "secondary", () => alert(`${report.equipment}\n${reportLine(report)}`)),
            button("Marcar reparación realizada", "ok", async () => markRepairDone(report))
          ]));
        });
      }
      el.tomorrowList.appendChild(mySection);
    }

    if (!workers.length) {
      el.tomorrowList.appendChild(empty("No hay mecánicos aprobados."));
      return;
    }

    workers.forEach((worker) => {
      const workerRows = rows.filter((report) => report.mechanicId === worker.id);
      const available = workerAvailability(worker.id);
      const actions = [];
      if (isAdmin()) {
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
          const reportActions = [button("Detalle", "secondary", () => alert(`${report.equipment}\n${reportLine(report)}`))];
          if (isAdmin() || report.mechanicId === state.currentUser.id) {
            reportActions.push(button("Marcar reparación realizada", "ok", async () => markRepairDone(report)));
          }
          if (isAdmin() && displayStatus(report.status) === "PV") {
            reportActions.push(button("Validar", "primary", async () => validateReport(report)));
            reportActions.push(button("Rechazar", "secondary", async () => rejectReport(report)));
          }
          list.appendChild(card(report.equipment, displayStatus(report.status), reportLine(report), reportActions));
        });
      }
      el.tomorrowList.appendChild(section);
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
    if (error) alert("Falta aplicar la migración de disponibilidad en Supabase.");
  }

  async function markRepairDone(report) {
    const description = prompt("Escribí qué reparación realizaste:");
    if (description === null) return;
    const note = description.trim();
    if (!note) {
      alert("Para marcar la reparación, tenés que escribir qué hiciste.");
      return;
    }
    await updateReport(report.id, {
      status: "PV",
      previous_status: displayStatus(report.status) === "PV" ? report.previousStatus || "FS" : displayStatus(report.status),
      repair_note: note,
      repaired_by: state.currentUser.name,
      repaired_at: new Date().toISOString(),
      operation_note: note,
      operated_by: state.currentUser.name
    });
    await createNotification(`${state.currentUser.name} informó reparación realizada en ${report.equipment}: ${note}`);
    await refreshAllData();
  }

  async function validateReport(report) {
    const ok = confirm(`¿Validar ${report.equipment} y pasarlo a Operativos?`);
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
    const observation = prompt("Observación para devolver el trabajo a revisión:");
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
    await writeClipboard(text);
    if (navigator.share && !workerId) {
      const share = confirm("Plan copiado. ¿También querés abrir Compartir del celular?");
      if (share) await navigator.share({ text });
    } else {
      alert("Plan copiado.");
    }
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
        []
      ));
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
          const ok = confirm(`¿Eliminar el perfil de ${user.name}? No se borra la cuenta Auth de Supabase desde el navegador.`);
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
    const name = prompt("Nombre completo:", user.name);
    if (name === null) return;
    const username = prompt("Usuario:", user.username);
    if (username === null) return;
    const specialty = prompt("Especialidad:", user.specialty || "mecanico-maquinaria-pesada");
    if (specialty === null) return;
    const role = prompt("Rol: mecanico, trabajador o admin", user.role || "mecanico");
    if (role === null) return;
    const accountStatus = prompt("Estado: activo o inactivo", user.accountStatus || "activo");
    if (accountStatus === null) return;
    const cleanRole = ["admin", "trabajador", "mecanico"].includes(role.trim()) ? role.trim() : user.role;
    const cleanStatus = accountStatus.trim().toLowerCase() === "inactivo" ? "inactivo" : "activo";
    await supabase.from("profiles").update({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: userToEmail(username),
      specialty: specialty.trim(),
      role: cleanRole,
      account_status: cleanStatus
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
    renderOperatives();
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
    const { error } = await supabase.from("reports").update(updates).eq("id", id);
    if (error) {
      alert(`No se pudo actualizar el reporte. Revisá la migración de Supabase.\n${error.message}`);
      throw error;
    }
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
  el.notifyBtn.addEventListener("click", () => setScreen("notifications"));
  el.usersBtn.addEventListener("click", () => setScreen("users"));

  el.planDate?.addEventListener("change", async () => {
    state.planDate = el.planDate.value || state.planDate;
    await refreshAllData();
  });

  el.refreshPlanBtn?.addEventListener("click", () => refreshAllData());
  el.copyPlanBtn?.addEventListener("click", () => copyPlan());

  el.manualPlanForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const form = new FormData(el.manualPlanForm);
    const mechanicId = form.get("mechanic") || null;
    const selected = state.users.find((user) => user.id === mechanicId);
    if (selected && workerAvailability(selected.id) === "franco") {
      const ok = confirm(`${selected.name} figura de franco. ¿Agregar equipo al plan igual?`);
      if (!ok) return;
    }
    await supabase.from("reports").insert({
      id: uid(),
      equipment: normalizeEquipment(form.get("equipment")),
      location: form.get("location").trim(),
      deviation: form.get("deviation").trim(),
      status: form.get("status") || "FS",
      mechanic_id: mechanicId,
      plan_date: state.planDate,
      hourmeter: form.get("hourmeter").trim(),
      created_at: new Date().toISOString(),
      created_by: state.currentUser.id
    });
    await createNotification(`Equipo agregado al Plan Mañana: ${normalizeEquipment(form.get("equipment"))}`);
    el.manualPlanForm.reset();
    await refreshAllData();
  });

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
    const role = form.get("role") || "mecanico";
    const accountStatus = form.get("accountStatus") || "activo";

    if (!name || !username || !password || !specialty) {
      el.userFeedback.textContent = "Completá todos los campos.";
      return;
    }

    const email = userToEmail(username);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          username,
          role,
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
        username: username.toLowerCase(),
        role,
        status: "aprobado",
        account_status: accountStatus,
        specialty,
        created_at: new Date().toISOString()
      });
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
