(function () {
  const STORAGE_KEY = "fleet-app-v1";

  const defaultData = {
    currentUserId: "admin-1",
    users: [
      { id: "admin-1", name: "Mariano", role: "admin" },
      { id: "mec-1", name: "Mecanico 1", role: "mecanico" },
      { id: "mec-2", name: "Mecanico 2", role: "mecanico" }
    ],
    immediate: [],
    mechanicReports: [],
    orders: [],
    fleet: [
      { id: uid(), equipment: "1001", parts: "Filtros, correas, aceite", notes: "Base" },
      { id: uid(), equipment: "1002", parts: "Pastillas, bateria, mangueras", notes: "Base" }
    ],
    notifications: []
  };

  const screens = {
    home: { id: "homeScreen", title: "Gestion de Flota", label: "Inicio" },
    immediate: { id: "immediateScreen", title: "Reporte Inmediato", label: "Tablero" },
    tomorrow: { id: "tomorrowScreen", title: "Plan Manana", label: "Asignaciones" },
    mechanic: { id: "mechanicScreen", title: "Reporte Mecanico", label: "Observaciones" },
    orders: { id: "ordersScreen", title: "Pedidos", label: "Solicitudes" },
    history: { id: "historyScreen", title: "Historial de Pedidos", label: "Consulta" },
    fleet: { id: "fleetScreen", title: "Informacion de Flota", label: "Equipos" },
    users: { id: "usersScreen", title: "Gestion de usuarios", label: "Roles" },
    notifications: { id: "notificationsScreen", title: "Notificaciones", label: "Avisos" }
  };

  let data = loadData();
  let activeScreen = "home";

  const el = {
    backBtn: document.getElementById("backBtn"),
    notifyBtn: document.getElementById("notifyBtn"),
    screenTitle: document.getElementById("screenTitle"),
    screenLabel: document.getElementById("screenLabel"),
    currentUser: document.getElementById("currentUser"),
    rolePill: document.getElementById("rolePill"),
    welcomeText: document.getElementById("welcomeText"),
    homeFeed: document.getElementById("homeFeed"),
    immediateForm: document.getElementById("immediateForm"),
    immediateList: document.getElementById("immediateList"),
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
    usersList: document.getElementById("usersList"),
    usersBtn: document.getElementById("usersBtn"),
    notificationsList: document.getElementById("notificationsList"),
    clearNotifications: document.getElementById("clearNotifications")
  };

  function uid() {
    return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return structuredClone(defaultData);
      return {
        ...structuredClone(defaultData),
        ...saved,
        users: saved.users && saved.users.length ? saved.users : defaultData.users
      };
    } catch {
      return structuredClone(defaultData);
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function currentUser() {
    return data.users.find((user) => user.id === data.currentUserId) || data.users[0];
  }

  function mechanics() {
    return data.users.filter((user) => user.role === "mecanico");
  }

  function isAdmin() {
    return currentUser().role === "admin";
  }

  function todayLabel() {
    return new Date().toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function notify(text) {
    data.notifications.unshift({
      id: uid(),
      text,
      at: todayLabel(),
      read: false
    });
    saveData();
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
    tagEl.classList.toggle("ok", /operativo|cerrado/i.test(tag));
    tagEl.classList.toggle("warn", /asignado|pedido/i.test(tag));
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

  function renderUserControls() {
    fillSelect(el.currentUser, data.users);
    el.currentUser.value = data.currentUserId;
    el.rolePill.textContent = isAdmin() ? "Admin" : "Mecanico";
    el.welcomeText.textContent = `Hola, ${currentUser().name}`;

    document.querySelectorAll(".admin-only").forEach((node) => {
      node.classList.toggle("admin-disabled", !isAdmin());
    });
    el.usersBtn.style.display = isAdmin() ? "block" : "none";

    const unread = data.notifications.filter((item) => !item.read).length;
    el.notifyBtn.textContent = String(unread);
  }

  function renderHome() {
    el.homeFeed.innerHTML = "";
    const rows = [];
    const user = currentUser();

    data.immediate
      .filter((report) => report.status !== "Operativo validado")
      .filter((report) => isAdmin() || report.mechanicId === user.id)
      .slice(0, 4)
      .forEach((report) => {
        rows.push(feedCard(
          `Equipo ${report.equipment}`,
          report.status,
          `${report.location} | ${report.deviation}`,
          "pending"
        ));
      });

    data.orders.slice(0, 2).forEach((order) => {
      rows.push(feedCard(
        `Pedido ${order.equipment}`,
        order.status,
        `${order.requesterName} pidio: ${order.need}`,
        "order"
      ));
    });

    data.notifications.slice(0, 2).forEach((item) => {
      rows.push(feedCard(item.at, item.read ? "Aviso" : "Nuevo", item.text, ""));
    });

    if (!rows.length) {
      el.homeFeed.appendChild(empty("Sin novedades por ahora."));
      return;
    }

    rows.forEach((row) => el.homeFeed.appendChild(row));
  }

  function setScreen(name) {
    activeScreen = name;
    Object.values(screens).forEach((screen) => {
      document.getElementById(screen.id).classList.remove("active");
    });
    const screen = screens[name];
    document.getElementById(screen.id).classList.add("active");
    el.screenTitle.textContent = screen.title;
    el.screenLabel.textContent = screen.label;
    el.backBtn.classList.toggle("hidden", name === "home");
    if (name === "notifications") {
      data.notifications.forEach((item) => { item.read = true; });
      saveData();
    }
    render();
  }

  function renderImmediate() {
    fillSelect(el.immediateForm.elements.mechanic, mechanics(), { placeholder: "Sin asignar" });
    el.immediateList.innerHTML = "";
    if (!data.immediate.length) {
      el.immediateList.appendChild(empty("Todavia no hay reportes inmediatos."));
      return;
    }

    data.immediate.forEach((report) => {
      const mechanic = data.users.find((user) => user.id === report.mechanicId);
      const actions = [];
      if (isAdmin()) {
        actions.push(button("Asignar", "secondary", () => {
          const names = mechanics().map((user, index) => `${index + 1}. ${user.name}`).join("\n");
          const choice = prompt(`Elegir mecanico:\n${names}`);
          if (choice === null) return;
          const selected = mechanics()[Number(choice) - 1];
          if (!selected) return;
          report.mechanicId = selected.id;
          report.status = "Asignado";
          notify(`${report.equipment} asignado a ${selected.name}`);
          saveData();
          render();
        }));
        actions.push(button("Validar operativo", "ok", () => {
          report.status = "Operativo validado";
          report.validatedBy = currentUser().name;
          notify(`${report.equipment} validado operativo por ${currentUser().name}`);
          saveData();
          render();
        }));
        actions.push(button("Eliminar", "danger", () => {
          data.immediate = data.immediate.filter((item) => item.id !== report.id);
          saveData();
          render();
        }));
      }
      el.immediateList.appendChild(card(
        report.equipment,
        report.status,
        `${report.location} | ${report.deviation} | Mecanico: ${mechanic ? mechanic.name : "sin asignar"}`,
        actions
      ));
    });
  }

  function renderTomorrow() {
    el.tomorrowList.innerHTML = "";
    const user = currentUser();
    const assignments = data.immediate.filter((report) => {
      if (report.status === "Operativo validado") return false;
      return isAdmin() || report.mechanicId === user.id;
    });

    if (!assignments.length) {
      el.tomorrowList.appendChild(empty("No hay asignaciones para mostrar."));
      return;
    }

    assignments.forEach((report) => {
      const actions = [
        button("Marcar operativo", "ok", () => {
          const description = prompt("Descripcion del trabajo realizado:");
          if (description === null) return;
          report.status = "Operativo informado";
          report.operationNote = description.trim();
          report.operatedBy = currentUser().name;
          notify(`${report.equipment} informado operativo por ${currentUser().name}`);
          saveData();
          render();
        })
      ];
      if (isAdmin()) {
        actions.push(button("Validar", "primary", () => {
          report.status = "Operativo validado";
          report.validatedBy = currentUser().name;
          notify(`${report.equipment} validado operativo`);
          saveData();
          render();
        }));
      }
      el.tomorrowList.appendChild(card(
        report.equipment,
        report.status,
        `${report.location} | ${report.deviation}${report.operationNote ? " | " + report.operationNote : ""}`,
        actions
      ));
    });
  }

  function renderMechanicReports() {
    el.mechanicList.innerHTML = "";
    const rows = isAdmin()
      ? data.mechanicReports
      : data.mechanicReports.filter((row) => row.userId === currentUser().id);
    if (!rows.length) {
      el.mechanicList.appendChild(empty("No hay observaciones cargadas."));
      return;
    }
    rows.forEach((row) => {
      el.mechanicList.appendChild(card(row.equipment, row.userName, `${row.deviation} | ${row.notes || "sin detalle"}`, []));
    });
  }

  function renderOrders() {
    fillSelect(el.orderForm.elements.requester, mechanics());
    fillSelect(el.orderFilter, mechanics(), { all: true });
    const selected = el.orderFilter.value || "all";
    el.ordersList.innerHTML = "";
    const rows = data.orders.filter((order) => selected === "all" || order.requesterId === selected);
    if (!rows.length) {
      el.ordersList.appendChild(empty("No hay pedidos cargados."));
      return;
    }
    rows.forEach((order) => {
      const actions = [];
      if (isAdmin()) {
        actions.push(button(order.status === "Cerrado" ? "Reabrir" : "Cerrar", "secondary", () => {
          order.status = order.status === "Cerrado" ? "Pedido" : "Cerrado";
          saveData();
          render();
        }));
      }
      el.ordersList.appendChild(card(order.equipment, order.status, `${order.requesterName} pidio: ${order.need}`, actions));
    });
  }

  function renderHistory() {
    el.historyList.innerHTML = "";
    if (!data.orders.length) {
      el.historyList.appendChild(empty("El historial esta vacio."));
      return;
    }
    data.orders.forEach((order) => {
      el.historyList.appendChild(card(order.equipment, order.status, `${order.requesterName} hizo un pedido el ${order.createdAt}`, []));
    });
  }

  function renderFleet() {
    el.fleetList.innerHTML = "";
    if (!data.fleet.length) {
      el.fleetList.appendChild(empty("No hay equipos cargados."));
      return;
    }
    data.fleet.forEach((item) => {
      const actions = [];
      if (isAdmin()) {
        actions.push(button("Eliminar", "danger", () => {
          data.fleet = data.fleet.filter((row) => row.id !== item.id);
          saveData();
          render();
        }));
      }
      el.fleetList.appendChild(card(item.equipment, "Flota", `${item.parts}${item.notes ? " | " + item.notes : ""}`, actions));
    });
  }

  function renderUsers() {
    el.usersList.innerHTML = "";
    data.users.forEach((user) => {
      const actions = [];
      if (user.id !== data.currentUserId) {
        actions.push(button("Editar rol", "secondary", () => {
          user.role = user.role === "admin" ? "mecanico" : "admin";
          saveData();
          render();
        }));
        actions.push(button("Eliminar", "danger", () => {
          data.users = data.users.filter((item) => item.id !== user.id);
          saveData();
          render();
        }));
      }
      el.usersList.appendChild(card(user.name, user.role, "Usuario de la app", actions));
    });
  }

  function renderNotifications() {
    el.notificationsList.innerHTML = "";
    if (!data.notifications.length) {
      el.notificationsList.appendChild(empty("No hay notificaciones."));
      return;
    }
    data.notifications.forEach((item) => {
      el.notificationsList.appendChild(card(item.at, item.read ? "Leida" : "Nueva", item.text, []));
    });
  }

  function render() {
    renderUserControls();
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

  document.querySelectorAll("[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => setScreen(btn.dataset.screen));
  });

  el.backBtn.addEventListener("click", () => setScreen("home"));
  el.notifyBtn.addEventListener("click", () => setScreen("notifications"));
  el.usersBtn.addEventListener("click", () => setScreen("users"));
  el.currentUser.addEventListener("change", () => {
    data.currentUserId = el.currentUser.value;
    saveData();
    render();
  });

  el.immediateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(el.immediateForm);
    const mechanicId = form.get("mechanic");
    const status = mechanicId ? "Asignado" : form.get("status");
    const report = {
      id: uid(),
      equipment: form.get("equipment").trim(),
      location: form.get("location").trim(),
      deviation: form.get("deviation").trim(),
      status,
      mechanicId,
      createdAt: todayLabel()
    };
    data.immediate.unshift(report);
    if (mechanicId) {
      const mechanic = data.users.find((user) => user.id === mechanicId);
      notify(`${report.equipment} asignado a ${mechanic ? mechanic.name : "mecanico"}`);
    }
    saveData();
    el.immediateForm.reset();
    render();
  });

  el.mechanicForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(el.mechanicForm);
    data.mechanicReports.unshift({
      id: uid(),
      equipment: form.get("equipment").trim(),
      deviation: form.get("deviation").trim(),
      notes: form.get("notes").trim(),
      userId: currentUser().id,
      userName: currentUser().name,
      createdAt: todayLabel()
    });
    saveData();
    el.mechanicForm.reset();
    render();
  });

  el.orderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(el.orderForm);
    const requester = data.users.find((user) => user.id === form.get("requester"));
    data.orders.unshift({
      id: uid(),
      equipment: form.get("equipment").trim(),
      requesterId: requester.id,
      requesterName: requester.name,
      need: form.get("need").trim(),
      status: "Pedido",
      createdAt: todayLabel()
    });
    notify(`Nuevo pedido cargado por ${requester.name}`);
    saveData();
    el.orderForm.reset();
    render();
  });

  el.orderFilter.addEventListener("change", renderOrders);

  el.fleetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(el.fleetForm);
    data.fleet.unshift({
      id: uid(),
      equipment: form.get("equipment").trim(),
      parts: form.get("parts").trim(),
      notes: form.get("notes").trim()
    });
    saveData();
    el.fleetForm.reset();
    render();
  });

  el.userForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(el.userForm);
    data.users.push({
      id: uid(),
      name: form.get("name").trim(),
      role: form.get("role")
    });
    saveData();
    el.userForm.reset();
    render();
  });

  el.clearNotifications.addEventListener("click", () => {
    data.notifications = [];
    saveData();
    render();
  });

  render();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
