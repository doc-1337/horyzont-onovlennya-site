(function () {
  const config = window.HORIZON_CONFIG;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = loadState();

  function loadState() {
    const fallback = { participants: [] };
    try {
      return JSON.parse(localStorage.getItem(config.storageKey)) || fallback;
    } catch (error) {
      console.warn("Unable to parse local state", error);
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(config.storageKey, JSON.stringify(state));
  }

  function uid() {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCycle(cycleId) {
    return config.cycles.find((cycle) => cycle.id === cycleId);
  }

  function getParticipantsByCycle(cycleId) {
    return state.participants.filter((participant) => participant.cycleId === cycleId);
  }

  function getFreePlaces(cycle) {
    return Math.max(cycle.capacity - getParticipantsByCycle(cycle.id).length, 0);
  }

  function getCurrentParticipant() {
    const participantId = localStorage.getItem(config.currentParticipantKey);
    return state.participants.find((participant) => participant.id === participantId) || null;
  }

  function setCurrentParticipant(participantId) {
    localStorage.setItem(config.currentParticipantKey, participantId);
  }

  function isTeamUnlocked() {
    return sessionStorage.getItem(config.teamSessionKey) === "yes";
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function setupNavigation() {
    const toggle = $(".nav-toggle");
    const nav = $("#site-nav");

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      nav.classList.toggle("is-open", !isOpen);
    });

    $$("#site-nav a").forEach((link) => {
      link.addEventListener("click", () => {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      });
    });
  }

  function renderCycles() {
    const select = $("#cycle-select");
    const list = $("#cycles-list");

    select.innerHTML = "";
    list.innerHTML = "";

    config.cycles.forEach((cycle) => {
      const free = getFreePlaces(cycle);
      const option = document.createElement("option");
      option.value = cycle.id;
      option.disabled = free <= 0;
      option.textContent = `${cycle.title} - ${free} місць`;
      select.append(option);

      const item = document.createElement("article");
      item.className = "cycle-card";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(cycle.title)}</strong>
          <span>${escapeHtml(cycle.dates)}</span>
        </div>
        <div>
          <b>${free}</b>
          <small>вільно з ${cycle.capacity}</small>
        </div>
        <em>${escapeHtml(cycle.status)}</em>
      `;
      list.append(item);
    });
  }

  function setupRegistration() {
    const form = $("#registration-form");
    const message = $("#registration-message");

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const cycle = getCycle(data.get("cycleId"));

      if (!form.reportValidity()) return;

      const groupTopics = data.getAll("groupTopics").map(String);
      const groupTopicsOther = String(data.get("groupTopicsOther") || "").trim();
      if (!groupTopics.length && !groupTopicsOther) {
        message.textContent = "Оберіть хоча б одну тему групових занять або заповніть поле «Інше».";
        return;
      }

      if (!cycle || getFreePlaces(cycle) <= 0) {
        message.textContent = "У цьому циклі вже немає вільних місць.";
        return;
      }

      const email = normalizeEmail(data.get("email"));
      const existing = state.participants.find((participant) => participant.email === email);
      if (existing) {
        setCurrentParticipant(existing.id);
        message.textContent = "Заявка з цим email вже є. Кабінет відкрито нижче.";
        renderAll();
        document.location.hash = "cabinet";
        return;
      }

      const participant = {
        id: uid(),
        createdAt: new Date().toISOString(),
        fullName: String(data.get("fullName")).trim(),
        phone: String(data.get("phone")).trim(),
        email,
        birthDate: String(data.get("birthDate")),
        residence: String(data.get("residence")).trim(),
        militaryStatus: String(data.get("militaryStatus") || "").trim(),
        groupReadiness: String(data.get("groupReadiness") || "").trim(),
        psychologicalRequests: String(data.get("psychologicalRequests")).trim(),
        groupTopics,
        groupTopicsOther,
        rehabilitationExpectations: String(data.get("rehabilitationExpectations")).trim(),
        cycleId: cycle.id,
        consent: data.get("consent") === "on",
        status: "Нова заявка",
        note: "",
        answers: {},
      };

      state.participants.push(participant);
      saveState();
      setCurrentParticipant(participant.id);
      form.reset();
      message.textContent = "Заявку збережено. Можна переходити до вхідної анкети.";
      showToast("Заявку збережено");
      renderAll();
      document.location.hash = "cabinet";
    });
  }

  function setupParticipantLogin() {
    $("#participant-login-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const email = normalizeEmail(new FormData(event.currentTarget).get("email"));
      const participant = state.participants.find((item) => item.email === email);

      if (!participant) {
        showToast("Учасника з таким email не знайдено");
        return;
      }

      setCurrentParticipant(participant.id);
      event.currentTarget.reset();
      renderParticipantCabinet();
      showToast("Кабінет відкрито");
    });
  }

  function renderParticipantCabinet(selectedFormId) {
    const participant = getCurrentParticipant();
    const summary = $("#participant-summary");
    const tabs = $("#questionnaire-tabs");
    const panel = $("#questionnaire-panel");

    tabs.innerHTML = "";
    panel.innerHTML = "";

    if (!participant) {
      summary.innerHTML = `
        <strong>Кабінет не відкрито</strong>
        <span>Після реєстрації анкети з'являться тут.</span>
      `;
      panel.innerHTML = `
        <div class="empty-state">
          <h3>Спочатку подайте заявку або увійдіть за email</h3>
          <p>Учасник має доступ лише до власної заявки та власних відповідей.</p>
        </div>
      `;
      return;
    }

    const cycle = getCycle(participant.cycleId);
    const completedCount = Object.keys(participant.answers || {}).length;

    summary.innerHTML = `
      <strong>${escapeHtml(participant.fullName)}</strong>
      <span>${escapeHtml(cycle?.title || "Цикл не знайдено")}</span>
      <span>${completedCount} з ${config.questionnaires.length} анкет заповнено</span>
      <button class="text-button" type="button" data-action="participant-logout">Вийти</button>
    `;

    const activeFormId =
      selectedFormId ||
      config.questionnaires.find((form) => !participant.answers?.[form.id])?.id ||
      config.questionnaires[0]?.id;

    config.questionnaires.forEach((form) => {
      const button = document.createElement("button");
      const isComplete = Boolean(participant.answers?.[form.id]);
      button.type = "button";
      button.className = `tab-button ${form.id === activeFormId ? "is-active" : ""}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(form.id === activeFormId));
      button.innerHTML = `
        <span>${escapeHtml(form.stage)}</span>
        <strong>${escapeHtml(form.title)}</strong>
        <em>${isComplete ? "заповнено" : "очікує"}</em>
      `;
      button.addEventListener("click", () => renderParticipantCabinet(form.id));
      tabs.append(button);
    });

    renderQuestionnaireForm(participant, activeFormId);
  }

  function renderQuestionnaireForm(participant, formId) {
    const formDefinition = config.questionnaires.find((item) => item.id === formId);
    const panel = $("#questionnaire-panel");
    const savedAnswer = participant.answers?.[formId];

    if (!formDefinition) return;

    const form = document.createElement("form");
    form.className = "questionnaire-form";
    form.noValidate = true;
    form.innerHTML = `
      <div class="questionnaire-heading">
        <div>
          <p class="eyebrow">${escapeHtml(formDefinition.stage)}</p>
          <h3>${escapeHtml(formDefinition.title)}</h3>
          <p>${escapeHtml(formDefinition.description)}</p>
        </div>
        <span class="version-badge">v ${escapeHtml(formDefinition.version)}</span>
      </div>
    `;

    formDefinition.fields.forEach((field) => {
      form.append(renderField(field, savedAnswer?.values?.[field.id]));
    });

    const actions = document.createElement("div");
    actions.className = "form-actions";
    actions.innerHTML = `
      <button class="button button-primary" type="submit">Зберегти анкету</button>
      <p class="form-message">${savedAnswer ? `Останнє збереження: ${formatDate(savedAnswer.submittedAt)}` : ""}</p>
    `;
    form.append(actions);

    form.addEventListener("input", (event) => {
      if (event.target.matches('input[type="range"]')) {
        const output = event.target.closest(".scale-field").querySelector("output");
        output.value = event.target.value;
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const values = {};
      const data = new FormData(form);
      formDefinition.fields.forEach((field) => {
        values[field.id] = data.get(field.id) || "";
      });

      participant.answers = participant.answers || {};
      participant.answers[formDefinition.id] = {
        version: formDefinition.version,
        submittedAt: new Date().toISOString(),
        values,
      };

      saveState();
      showToast("Анкету збережено");
      renderAll(formDefinition.id);
    });

    panel.append(form);
  }

  function renderField(field, savedValue) {
    const wrapper = document.createElement("div");
    wrapper.className = `field field-${field.type}`;

    if (field.type === "scale") {
      const value = savedValue || field.defaultValue || field.min;
      wrapper.className = "field scale-field";
      wrapper.innerHTML = `
        <label for="${field.id}">
          <span>${escapeHtml(field.label)}</span>
        </label>
        <div class="scale-control">
          <span>${escapeHtml(field.minLabel || String(field.min))}</span>
          <input
            id="${field.id}"
            name="${field.id}"
            type="range"
            min="${field.min}"
            max="${field.max}"
            value="${escapeHtml(value)}"
            ${field.required ? "required" : ""}
          />
          <span>${escapeHtml(field.maxLabel || String(field.max))}</span>
          <output>${escapeHtml(value)}</output>
        </div>
      `;
      return wrapper;
    }

    if (field.type === "radio") {
      const group = document.createElement("fieldset");
      group.className = "choice-group";
      group.innerHTML = `<legend>${escapeHtml(field.label)}</legend>`;

      field.options.forEach((option) => {
        const label = document.createElement("label");
        label.className = "choice-pill";
        label.innerHTML = `
          <input
            name="${field.id}"
            type="radio"
            value="${escapeHtml(option)}"
            ${savedValue === option ? "checked" : ""}
            ${field.required ? "required" : ""}
          />
          <span>${escapeHtml(option)}</span>
        `;
        group.append(label);
      });

      wrapper.append(group);
      return wrapper;
    }

    if (field.type === "textarea") {
      wrapper.innerHTML = `
        <label>
          <span>${escapeHtml(field.label)}</span>
          <textarea name="${field.id}" rows="4" ${field.required ? "required" : ""}>${escapeHtml(savedValue || "")}</textarea>
        </label>
      `;
      return wrapper;
    }

    wrapper.innerHTML = `
      <label>
        <span>${escapeHtml(field.label)}</span>
        <input name="${field.id}" value="${escapeHtml(savedValue || "")}" ${field.required ? "required" : ""} />
      </label>
    `;
    return wrapper;
  }

  function setupTeamDashboard() {
    $("#team-login-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const code = String(new FormData(event.currentTarget).get("code") || "").trim();

      if (code !== config.teamAccessCode) {
        showToast("Невірний код доступу");
        return;
      }

      sessionStorage.setItem(config.teamSessionKey, "yes");
      event.currentTarget.reset();
      renderTeamDashboard();
      showToast("Кабінет команди відкрито");
    });

    $("#team-cycle-filter").addEventListener("change", renderParticipantsTable);
    $("#team-status-filter").addEventListener("change", renderParticipantsTable);
    $("#export-csv").addEventListener("click", exportCsv);
  }

  function renderTeamDashboard() {
    const gate = $("#team-gate");
    const dashboard = $("#team-dashboard");

    gate.hidden = isTeamUnlocked();
    dashboard.hidden = !isTeamUnlocked();

    if (!isTeamUnlocked()) return;

    renderTeamFilters();
    renderTeamStats();
    renderParticipantsTable();
  }

  function renderTeamFilters() {
    const cycleFilter = $("#team-cycle-filter");
    const statusFilter = $("#team-status-filter");
    const currentCycle = cycleFilter.value || "all";
    const currentStatus = statusFilter.value || "all";

    cycleFilter.innerHTML = `<option value="all">Усі цикли</option>`;
    config.cycles.forEach((cycle) => {
      const option = document.createElement("option");
      option.value = cycle.id;
      option.textContent = cycle.title;
      cycleFilter.append(option);
    });
    cycleFilter.value = currentCycle;

    statusFilter.innerHTML = `<option value="all">Усі статуси</option>`;
    config.participantStatuses.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      statusFilter.append(option);
    });
    statusFilter.value = currentStatus;
  }

  function renderTeamStats() {
    const stats = $("#team-stats");
    const answerCount = state.participants.reduce(
      (total, participant) => total + Object.keys(participant.answers || {}).length,
      0,
    );
    const confirmed = state.participants.filter((participant) => participant.status === "Підтверджено").length;

    stats.innerHTML = `
      <article>
        <span>Заявки</span>
        <strong>${state.participants.length}</strong>
      </article>
      <article>
        <span>Підтверджено</span>
        <strong>${confirmed}</strong>
      </article>
      <article>
        <span>Анкети</span>
        <strong>${answerCount}</strong>
      </article>
    `;
  }

  function getFilteredParticipants() {
    const cycle = $("#team-cycle-filter").value;
    const status = $("#team-status-filter").value;

    return state.participants.filter((participant) => {
      const matchesCycle = cycle === "all" || participant.cycleId === cycle;
      const matchesStatus = status === "all" || participant.status === status;
      return matchesCycle && matchesStatus;
    });
  }

  function renderParticipantsTable() {
    const root = $("#participants-table");
    const participants = getFilteredParticipants();

    if (!participants.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>Заявок ще немає</h3>
          <p>Після реєстрації учасників вони з'являться в цьому списку.</p>
        </div>
      `;
      return;
    }

    root.innerHTML = participants
      .map((participant) => {
        const cycle = getCycle(participant.cycleId);
        const answersCount = Object.keys(participant.answers || {}).length;
        return `
          <article class="participant-row" data-id="${participant.id}">
            <div class="participant-main">
              <strong>${escapeHtml(participant.fullName)}</strong>
              <span>${escapeHtml(participant.email)} | ${escapeHtml(participant.phone)}</span>
              <span>${escapeHtml(cycle?.title || "")} | ${answersCount}/${config.questionnaires.length} анкет</span>
              <span>${escapeHtml(participant.militaryStatus || participant.unitStatus || "Статус не вказано")}</span>
              <details class="sensitive-details">
                <summary>Конфіденційні деталі заявки</summary>
                <dl>
                  <div>
                    <dt>Місце проживання</dt>
                    <dd>${escapeHtml(participant.residence || "не вказано")}</dd>
                  </div>
                  <div>
                    <dt>Готовність до групових занять</dt>
                    <dd>${escapeHtml(participant.groupReadiness || "не вказано")}</dd>
                  </div>
                  <div>
                    <dt>Психологічний запит</dt>
                    <dd>${escapeHtml(participant.psychologicalRequests || "не вказано")}</dd>
                  </div>
                  <div>
                    <dt>Теми групових занять</dt>
                    <dd>${escapeHtml(formatTopics(participant))}</dd>
                  </div>
                  <div>
                    <dt>Очікування від програми</dt>
                    <dd>${escapeHtml(participant.rehabilitationExpectations || "не вказано")}</dd>
                  </div>
                </dl>
              </details>
            </div>
            <label>
              <span>Статус</span>
              <select data-field="status">
                ${config.participantStatuses
                  .map(
                    (status) =>
                      `<option value="${escapeHtml(status)}" ${status === participant.status ? "selected" : ""}>${escapeHtml(
                        status,
                      )}</option>`,
                  )
                  .join("")}
              </select>
            </label>
            <label class="note-field">
              <span>Нотатка команди</span>
              <textarea data-field="note" rows="2">${escapeHtml(participant.note || "")}</textarea>
            </label>
            <button class="button button-secondary" type="button" data-action="save-participant">Зберегти</button>
          </article>
        `;
      })
      .join("");

    $$('[data-action="save-participant"]', root).forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest(".participant-row");
        const participant = state.participants.find((item) => item.id === row.dataset.id);
        participant.status = $('[data-field="status"]', row).value;
        participant.note = $('[data-field="note"]', row).value.trim();
        saveState();
        renderTeamDashboard();
        showToast("Дані учасника оновлено");
      });
    });
  }

  function exportCsv() {
    const confirmed = window.confirm(
      "CSV міститиме конфіденційні персональні та психологічні дані учасників. Експортуйте його лише на захищеному пристрої для уповноваженої команди.",
    );
    if (!confirmed) return;

    const headers = [
      "createdAt",
      "fullName",
      "email",
      "phone",
      "birthDate",
      "residence",
      "militaryStatus",
      "groupReadiness",
      "psychologicalRequests",
      "groupTopics",
      "groupTopicsOther",
      "rehabilitationExpectations",
      "cycle",
      "status",
      "answersCount",
      "note",
    ];
    const rows = getFilteredParticipants().map((participant) => {
      const cycle = getCycle(participant.cycleId);
      return [
        participant.createdAt,
        participant.fullName,
        participant.email,
        participant.phone,
        participant.birthDate,
        participant.residence || "",
        participant.militaryStatus || participant.unitStatus || "",
        participant.groupReadiness || "",
        participant.psychologicalRequests || "",
        (participant.groupTopics || []).join("; "),
        participant.groupTopicsOther || "",
        participant.rehabilitationExpectations || "",
        cycle?.title || "",
        participant.status,
        Object.keys(participant.answers || {}).length,
        participant.note || "",
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `horyzont-participants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function shortText(value, maxLength) {
    const text = String(value || "").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function formatTopics(participant) {
    const topics = [...(participant.groupTopics || [])];
    if (participant.groupTopicsOther) topics.push(participant.groupTopicsOther);
    return topics.length ? topics.join("; ") : "не вказано";
  }

  function setupDelegatedActions() {
    document.addEventListener("click", (event) => {
      if (event.target.matches('[data-action="participant-logout"]')) {
        localStorage.removeItem(config.currentParticipantKey);
        renderParticipantCabinet();
      }
    });
  }

  function renderAll(activeFormId) {
    renderCycles();
    renderParticipantCabinet(activeFormId);
    renderTeamDashboard();
  }

  setupNavigation();
  setupRegistration();
  setupParticipantLogin();
  setupTeamDashboard();
  setupDelegatedActions();
  renderAll();
})();
