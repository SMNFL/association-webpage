import {
  THEME_PRESETS,
  addGalleryReference,
  clone,
  elementType,
  galleryHasPath,
  removeGalleryReference
} from "./editor-model.js";

const state = {
  section: "pages",
  dataset: "site",
  pageFilter: "homepage",
  sectionFilter: "all",
  mediaGroupFilter: "all",
  content: {},
  events: [],
  media: [],
  fields: [],
  selectedField: null,
  selectedEventId: null,
  settingsDraft: null,
  csrfToken: ""
};

const views = {
  pages: ["Pages", "Edit visible website text through structured data."],
  events: ["Events", "Create and update active event pages."],
  archive: ["Archive", "Move events into the archive and manage galleries."],
  media: ["Media", "Upload web-ready images and copy paths into content."],
  settings: ["Settings", "Adjust safe visual theme tokens for the public website."]
};

const datasetsBySection = {
  pages: ["site", "pages", "culture"]
};

const els = {
  saveState: document.querySelector("[data-save-state]"),
  viewTitle: document.querySelector("[data-view-title]"),
  viewDescription: document.querySelector("[data-view-description]"),
  listTitle: document.querySelector("[data-list-title]"),
  navItems: document.querySelectorAll("[data-section]"),
  refresh: document.querySelector("[data-refresh]"),
  saveCurrent: document.querySelector("[data-save-current]"),
  search: document.querySelector("[data-search]"),
  tabs: document.querySelector("[data-dataset-tabs]"),
  fieldList: document.querySelector("[data-field-list]"),
  eventList: document.querySelector("[data-event-list]"),
  mediaList: document.querySelector("[data-media-list]"),
  inspectorTitle: document.querySelector("[data-inspector-title]"),
  inspectorPath: document.querySelector("[data-inspector-path]"),
  fieldEditor: document.querySelector("[data-field-editor]"),
  groupFields: document.querySelector("[data-group-fields]"),
  eventEditor: document.querySelector("[data-event-editor]"),
  mediaUpload: document.querySelector("[data-media-upload]"),
  archiveEvent: document.querySelector("[data-archive-event]"),
  deleteEvent: document.querySelector("[data-delete-event]"),
  newEvent: document.querySelector("[data-new-event]"),
  preview: document.querySelector("[data-preview]"),
  previewTarget: document.querySelector("[data-preview-target]"),
  mediaDatalist: document.querySelector("[data-media-datalist]")
};
els.logout = document.querySelector("[data-logout]");

els.eventErrors = document.querySelector("[data-event-errors]");
els.statusHelp = document.querySelector("[data-status-help]");
els.sectionList = document.querySelector("[data-section-list]");
els.addSection = document.querySelector("[data-add-section]");
els.previewEvent = document.querySelector("[data-preview-event]");
els.contentNavigation = document.querySelector("[data-content-navigation]");
els.pageFilter = document.querySelector("[data-page-filter]");
els.pageSections = document.querySelector("[data-page-sections]");
els.settingsEditor = document.querySelector("[data-settings-editor]");
els.themeColors = document.querySelector("[data-theme-colors]");
els.cancelSettings = document.querySelector("[data-cancel-settings]");
els.exportSettings = document.querySelector("[data-export-settings]");
els.cancelElement = document.querySelector("[data-cancel-element]");

boot().catch((error) => setStatus(error.message, true));

async function boot() {
  await loadSession();
  bindUi();
  await loadAll();
  render();
}

function bindUi() {
  els.navItems.forEach((button) => {
    button.addEventListener("click", () => {
      state.section = button.dataset.section;
      if (state.section === "archive") state.selectedEventId = archiveEvents()[0]?.id || null;
      if (state.section === "events") state.selectedEventId = activeEvents()[0]?.id || null;
      if (datasetsBySection[state.section] && !datasetsBySection[state.section].includes(state.dataset)) {
        state.dataset = datasetsBySection[state.section][0];
      }
      render();
    });
  });

  els.refresh.addEventListener("click", async () => {
    await loadAll();
    render();
    reloadPreview();
  });

  els.saveCurrent.addEventListener("click", () => state.section === "settings" ? saveSettings() : saveCurrentDataset());
  els.search.addEventListener("input", renderList);
  els.previewTarget.addEventListener("change", reloadPreview);
  els.preview.addEventListener("load", () => {
    attachPreviewClickHandler();
    if (state.section === "settings") applySettingsPreview();
  });

  els.fieldEditor.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedField) return;
    [...els.groupFields.querySelectorAll("[data-group-field]")].forEach((input) => {
      const field = state.selectedField.fields[Number(input.dataset.groupField)];
      setValueAtPath(state.content[state.dataset], field.path, input.value);
    });
    renderList();
    await saveCurrentDataset();
  });
  els.cancelElement.addEventListener("click", () => {
    state.selectedField = null;
    render();
  });

  els.eventEditor.addEventListener("submit", saveEventFromForm);
  els.newEvent.addEventListener("click", () => selectEvent(null));
  els.archiveEvent.addEventListener("click", archiveSelectedEvent);
  els.deleteEvent.addEventListener("click", deleteSelectedEvent);
  els.eventEditor.elements.status.addEventListener("change", updateTicketState);
  els.mediaUpload.addEventListener("submit", uploadMedia);
  els.addSection.addEventListener("click", () => addSectionEditor());
  els.previewEvent.addEventListener("click", previewSelectedEvent);
  els.logout.addEventListener("click", logout);
  els.pageFilter.addEventListener("change", () => selectPageFilter(els.pageFilter.value));
  els.settingsEditor.addEventListener("input", updateSettingsDraft);
  els.settingsEditor.addEventListener("change", updateSettingsDraft);
  els.settingsEditor.addEventListener("submit", saveSettings);
  els.cancelSettings.addEventListener("click", discardSettings);
  els.exportSettings.addEventListener("click", exportSettings);
}

async function loadSession() {
  const response = await fetch("/api/editor/auth/session");
  if (!response.ok) {
    window.location.assign("/editor/login");
    throw new Error("Authentication required.");
  }
  const body = await response.json();
  state.csrfToken = body.csrfToken;
}

async function loadAll() {
  setStatus("Loading");
  const [content, events, media] = await Promise.all([
    api("/api/editor/content"),
    api("/api/editor/events"),
    api("/api/editor/media")
  ]);
  state.content = content.content || {};
  state.events = events.events || state.content.events || [];
  state.content.events = state.events;
  state.media = media.media || [];
  state.settingsDraft = clone(state.content.site?.theme || THEME_PRESETS.sukura);
  renderPreviewTargets();
  if (!state.selectedEventId) state.selectedEventId = activeEvents()[0]?.id || state.events[0]?.id || null;
  setStatus("Ready");
}

function render() {
  const [title, description] = views[state.section] || views.pages;
  els.viewTitle.textContent = title;
  els.viewDescription.textContent = description;
  els.listTitle.textContent = state.section === "media" ? "Images" : state.section === "archive" ? "Archived events" : "Editable data";

  els.navItems.forEach((button) => button.classList.toggle("is-active", button.dataset.section === state.section));
  els.fieldList.hidden = ["events", "archive", "media", "settings"].includes(state.section);
  els.eventList.hidden = !["events", "archive"].includes(state.section);
  els.mediaList.hidden = state.section !== "media";
  els.tabs.hidden = true;
  els.contentNavigation.hidden = state.section !== "pages";
  els.fieldEditor.hidden = true;
  els.eventEditor.hidden = !["events", "archive"].includes(state.section);
  els.mediaUpload.hidden = state.section !== "media";
  els.settingsEditor.hidden = state.section !== "settings";

  renderPreviewTargets();
  renderContentNavigation();
  renderList();
  renderMediaDatalist();

  if (["events", "archive"].includes(state.section)) {
    selectEvent(state.selectedEventId);
  } else if (state.section === "media") {
    els.inspectorTitle.textContent = "Upload image";
    els.inspectorPath.textContent = "assets/images";
  } else if (state.section === "settings") {
    els.inspectorTitle.textContent = "Website appearance";
    els.inspectorPath.textContent = "site.theme";
    renderSettingsEditor();
  } else {
    renderFieldInspector();
  }
}

function renderTabs() {
  const datasets = datasetsBySection[state.section] || [];
  els.tabs.innerHTML = datasets.map((dataset) => (
    `<button class="tab${dataset === state.dataset ? " is-active" : ""}" type="button" data-dataset="${dataset}">${dataset}</button>`
  )).join("");
  els.tabs.querySelectorAll("[data-dataset]").forEach((button) => {
    button.addEventListener("click", () => {
      state.dataset = button.dataset.dataset;
      state.selectedField = null;
      render();
    });
  });
}

function renderList() {
  if (["events", "archive"].includes(state.section)) return renderEventList();
  if (state.section === "media") return renderMediaList();
  if (state.section === "settings") return;

  const search = els.search.value.toLowerCase();
  state.fields = editableGroups();
  const fields = state.fields.filter((field) => (
    (state.pageFilter === "all" || field.pageId === state.pageFilter)
    && (state.sectionFilter === "all" || field.sectionId === state.sectionFilter)
    && (
      !search
      || field.path.join(".").toLowerCase().includes(search)
      || field.label.toLowerCase().includes(search)
      || field.fields.some((item) => String(item.value).toLowerCase().includes(search))
    )
  ));

  els.fieldList.innerHTML = fields.map((field) => `
    <button class="field-item${state.selectedField?.id === field.id ? " is-active" : ""}" type="button" data-field-id="${field.id}">
      <span class="field-item__meta">${escapeHtml(field.pageLabel)} · ${escapeHtml(field.sectionLabel)} <em>${escapeHtml(field.type)}</em></span>
      <strong>${escapeHtml(field.label)}</strong>
      <span>${escapeHtml(field.fields.map((item) => `${humanizePath([item.key])}: ${previewValue(item.value)}`).join(" · "))}</span>
      <small>${escapeHtml(field.path.join("."))}</small>
    </button>
  `).join("");

  els.fieldList.querySelectorAll("[data-field-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedField = state.fields.find((field) => field.id === button.dataset.fieldId);
      state.dataset = state.selectedField.dataset;
      renderFieldInspector();
      renderList();
    });
  });
}

function renderEventList() {
  const search = els.search.value.toLowerCase();
  const events = state.section === "archive" ? archiveEvents() : activeEvents();
  const filtered = events.filter((event) => (
    !search || [event.title, event.id, event.location, event.date].some((value) => String(value || "").toLowerCase().includes(search))
  ));
  els.eventList.innerHTML = filtered.map((event) => `
    <button class="event-item${state.selectedEventId === event.id ? " is-active" : ""}" type="button" data-event-id="${escapeHtml(event.id)}">
      <strong>${escapeHtml(event.title || "Untitled event")}</strong>
      <span>${escapeHtml(event.date || "No date")} · ${escapeHtml(event.location || "No location")}</span>
      <small>${event.status === "archive" ? "Archived" : "Active"}</small>
    </button>
  `).join("");
  els.eventList.querySelectorAll("[data-event-id]").forEach((button) => {
    button.addEventListener("click", () => selectEvent(button.dataset.eventId));
  });
}

function renderMediaList() {
  const search = els.search.value.toLowerCase();
  const media = state.media.filter((item) => !search || item.path.toLowerCase().includes(search));
  const groups = groupMedia(media);
  if (state.mediaGroupFilter !== "all" && !groups.some((group) => group.id === state.mediaGroupFilter)) {
    state.mediaGroupFilter = "all";
  }
  els.mediaList.innerHTML = `
    <p class="media-list__summary">${media.length} images in ${groups.length} folders. Use search to narrow the list.</p>
    <div class="content-navigation media-navigation">
      <label>
        <span>Media folder</span>
        <select data-media-folder-filter>
          <option value="all"${state.mediaGroupFilter === "all" ? " selected" : ""}>All folders</option>
          ${groups.map((group) => `<option value="${escapeHtml(group.id)}"${group.id === state.mediaGroupFilter ? " selected" : ""}>${escapeHtml(group.label)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Event gallery target</span>
        <select data-media-event-filter>
          <option value="">Choose an event</option>
          ${mediaEventOptions()}
        </select>
      </label>
    </div>
    ${groups.map((group) => `
      <section class="media-group" id="${escapeHtml(group.domId)}" data-media-group-id="${escapeHtml(group.id)}">
        <div class="media-group__header">
          <h3>${escapeHtml(group.label)}</h3>
          <span>${group.items.length} images</span>
        </div>
        ${group.items.slice(0, 80).map((item) => `
    <article class="media-item" data-media-path="${escapeHtml(item.path)}">
      <img src="/${escapeHtml(item.path)}" alt="" loading="lazy">
      <div>
        <strong>${escapeHtml(item.path)}</strong>
        <span>${Math.round((item.bytes || 0) / 1024)} KB</span>
        <div class="media-actions">
          <button class="button button--ghost button--small" type="button" data-copy-media>Copy path</button>
          <button class="button button--ghost button--small" type="button" data-cover-media>Use as event cover</button>
          <button class="button button--ghost button--small" type="button" data-add-event-gallery${selectedEventForMedia() && !eventGalleryHasPath(item.path) ? "" : " disabled"}>Add to event gallery</button>
          <button class="button button--ghost button--small" type="button" data-add-main-gallery${galleryHasPath(mainGallery(), item.path) ? " disabled" : ""}>Add to main gallery</button>
          <button class="button button--ghost button--small" type="button" data-remove-event-gallery${selectedEventForMedia() && eventGalleryHasPath(item.path) ? "" : " disabled"}>Remove from event gallery</button>
          <button class="button button--ghost button--small" type="button" data-remove-main-gallery${galleryHasPath(mainGallery(), item.path) ? "" : " disabled"}>Remove from main gallery</button>
        </div>
      </div>
    </article>
        `).join("")}
        ${group.items.length > 80 ? `<p class="media-list__summary">Showing the first 80 images in this folder. Use search to narrow the list.</p>` : ""}
      </section>
    `).join("")}`;
  els.mediaList.querySelectorAll("[data-media-path]").forEach((item) => {
    item.querySelector("[data-copy-media]").addEventListener("click", async () => {
      await navigator.clipboard?.writeText(item.dataset.mediaPath);
      setStatus("Media path copied");
    });
    item.querySelector("[data-cover-media]").addEventListener("click", () => applyMediaToSelectedEvent(item.dataset.mediaPath, "cover"));
    item.querySelector("[data-add-event-gallery]").addEventListener("click", () => addToEventGallery(item.dataset.mediaPath));
    item.querySelector("[data-remove-event-gallery]").addEventListener("click", () => removeFromEventGallery(item.dataset.mediaPath));
    item.querySelector("[data-add-main-gallery]").addEventListener("click", () => addToMainGallery(item.dataset.mediaPath));
    item.querySelector("[data-remove-main-gallery]").addEventListener("click", () => removeFromMainGallery(item.dataset.mediaPath));
  });
  els.mediaList.querySelector("[data-media-folder-filter]")?.addEventListener("change", (event) => {
    state.mediaGroupFilter = event.target.value;
    applyMediaGroupFilter();
  });
  els.mediaList.querySelector("[data-media-event-filter]")?.addEventListener("change", (event) => {
    state.selectedEventId = event.target.value || null;
    updateEventGalleryActionStates();
  });
  applyMediaGroupFilter();
}

function applyMediaGroupFilter() {
  els.mediaList.querySelectorAll("[data-media-group-id]").forEach((group) => {
    group.hidden = state.mediaGroupFilter !== "all" && group.dataset.mediaGroupId !== state.mediaGroupFilter;
  });
}

function updateEventGalleryActionStates() {
  els.mediaList.querySelectorAll("[data-media-path]").forEach((item) => {
    const selectedEvent = selectedEventForMedia();
    const included = eventGalleryHasPath(item.dataset.mediaPath);
    item.querySelector("[data-add-event-gallery]").disabled = !selectedEvent || included;
    item.querySelector("[data-remove-event-gallery]").disabled = !selectedEvent || !included;
  });
}

function renderFieldInspector() {
  els.eventEditor.hidden = true;
  els.mediaUpload.hidden = true;
  els.fieldEditor.hidden = !state.selectedField;
  els.inspectorTitle.textContent = state.selectedField ? "Edit element" : "Inspector";
  els.inspectorPath.textContent = state.selectedField ? `${state.selectedField.label} · ${state.selectedField.path.join(".") || "general"}` : "No element selected";
  els.groupFields.innerHTML = state.selectedField
    ? state.selectedField.fields.map((field, index) => renderGroupField(field, index)).join("")
    : "";
}

function selectEvent(id) {
  const events = state.section === "archive" ? archiveEvents() : activeEvents();
  const event = id ? state.events.find((item) => item.id === id) : null;
  state.selectedEventId = event?.id || null;
  renderEventList();
  fillEventForm(event || defaultEvent(state.section === "archive" ? "archive" : "upcoming"));
}

function previewSelectedEvent() {
  const event = currentSelectedEvent();
  if (!event) {
    setStatus("Save the event before opening its page preview", true);
    return;
  }
  els.previewTarget.value = eventPreviewUrl(event);
  reloadPreview();
}

function fillEventForm(event) {
  clearEventErrors();
  els.inspectorTitle.textContent = event.id ? "Edit event" : "New event";
  els.inspectorPath.textContent = event.id || "new-event";
  const form = els.eventEditor;
  form.elements.title.value = event.title || "";
  form.elements.id.value = event.id || event.slug || "";
  form.elements.status.value = event.status === "archive" ? "archive" : "upcoming";
  form.elements.date.value = event.date || "";
  form.elements.displayDate.value = event.displayDate || "";
  form.elements.location.value = event.location || "";
  form.elements.excerpt.value = event.excerpt || "";
  form.elements.description.value = Array.isArray(event.description) ? event.description.join("\n") : event.description || "";
  form.elements.image.value = event.image || event.coverImage || "";
  form.elements.imagePosition.value = event.imagePosition || "center center";
  form.elements.tags.value = (event.tags || []).join(", ");
  form.elements.ticketUrl.value = event.ticketUrl || event.ticketLink || "";
  form.elements.ticketEmbed.value = event.ticketEmbed || "";
  form.elements.ticketEmbedHeight.value = event.ticketEmbedHeight || "";
  form.elements.gallery.value = (event.gallery || []).map((image) => typeof image === "string" ? image : image.src).join("\n");
  renderSectionEditors(event.sections || []);
  updateTicketState();
}

async function saveEventFromForm(event) {
  event.preventDefault();
  clearEventErrors();
  try {
    const formEvent = eventFromForm();
    if (state.selectedEventId) {
      const result = await api(`/api/editor/events/${encodeURIComponent(state.selectedEventId)}`, {
        method: "PUT",
        body: { event: formEvent }
      });
      state.events = result.events;
    } else {
      const result = await api("/api/editor/events", {
        method: "POST",
        body: { event: formEvent }
      });
      state.events = result.events;
      state.selectedEventId = result.event?.id;
    }
    state.content.events = state.events;
    setStatus("Event saved");
    render();
    reloadPreview();
  } catch (error) {
    renderEventErrors(error.errors || { event: error.message });
  }
}

async function archiveSelectedEvent() {
  if (!state.selectedEventId) return;
  const event = state.events.find((item) => item.id === state.selectedEventId);
  if (!event) return;
  const ok = window.confirm(`Archive "${event.title}"? Tickets will be removed and the gallery will stay.`);
  if (!ok) return;
  const result = await api(`/api/editor/events/${encodeURIComponent(state.selectedEventId)}/archive`, { method: "POST" });
  state.events = result.events;
  state.content.events = state.events;
  state.section = "archive";
  state.selectedEventId = result.event.id;
  setStatus("Event archived");
  render();
  reloadPreview();
}

async function deleteSelectedEvent() {
  if (!state.selectedEventId) return;
  const event = state.events.find((item) => item.id === state.selectedEventId);
  if (!event) return;
  const ok = window.confirm(`Delete "${event.title}" permanently? The event page will be removed. Uploaded images will stay available in Media.`);
  if (!ok) return;
  const result = await api(`/api/editor/events/${encodeURIComponent(state.selectedEventId)}`, { method: "DELETE" });
  state.events = result.events;
  state.content.events = state.events;
  state.selectedEventId = state.section === "archive" ? archiveEvents()[0]?.id || null : activeEvents()[0]?.id || null;
  setStatus("Event deleted");
  render();
  reloadPreview();
}

async function saveCurrentDataset() {
  if (!datasetsBySection[state.section]?.includes(state.dataset)) return;
  const result = await api(`/api/editor/content/${state.dataset}`, {
    method: "PUT",
    body: { content: state.content[state.dataset] }
  });
  state.content[state.dataset] = result.content;
  setStatus(`${state.dataset} saved`);
  reloadPreview();
}

function renderSettingsEditor() {
  if (!state.settingsDraft) state.settingsDraft = clone(state.content.site?.theme || THEME_PRESETS.sukura);
  const theme = state.settingsDraft;
  els.themeColors.innerHTML = [
    ["themeColor", "Browser theme color", theme.themeColor],
    ["background", "Page background", theme.colors.background],
    ["backgroundSoft", "Background contrast", theme.colors.backgroundSoft],
    ["surface", "Card surface", theme.colors.surface],
    ["surfaceStrong", "Strong surface", theme.colors.surfaceStrong],
    ["text", "Main text", theme.colors.text],
    ["muted", "Muted text", theme.colors.muted],
    ["primary", "Primary accent", theme.colors.primary],
    ["secondary", "Secondary accent", theme.colors.secondary],
    ["highlight", "Highlight accent", theme.colors.highlight]
  ].map(([name, label, value]) => `
    <label>
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" type="color" value="${escapeHtml(value)}">
    </label>
  `).join("");
  const form = els.settingsEditor;
  form.elements.preset.value = theme.preset || "custom";
  form.elements.containerWidth.value = theme.layout.containerWidth;
  form.elements.cornerStyle.value = theme.layout.cornerStyle;
  form.elements.density.value = theme.layout.density;
  form.elements.fontFamily.value = theme.typography.fontFamily;
  form.elements.textSize.value = theme.typography.textSize;
  form.elements.ambient.checked = Boolean(theme.effects.ambient);
  form.elements.backgroundGrid.checked = Boolean(theme.effects.backgroundGrid);
}

function updateSettingsDraft(event) {
  if (event?.target?.name === "preset" && THEME_PRESETS[event.target.value]) {
    state.settingsDraft = clone(THEME_PRESETS[event.target.value]);
    renderSettingsEditor();
  } else {
    state.settingsDraft = settingsFromForm();
    state.settingsDraft.preset = "custom";
    els.settingsEditor.elements.preset.value = "custom";
  }
  setStatus("Unsaved settings");
  applySettingsPreview();
}

function settingsFromForm() {
  const form = els.settingsEditor;
  return {
    preset: form.elements.preset.value,
    themeColor: form.elements.themeColor.value,
    colors: {
      background: form.elements.background.value,
      backgroundSoft: form.elements.backgroundSoft.value,
      surface: form.elements.surface.value,
      surfaceStrong: form.elements.surfaceStrong.value,
      text: form.elements.text.value,
      muted: form.elements.muted.value,
      primary: form.elements.primary.value,
      secondary: form.elements.secondary.value,
      highlight: form.elements.highlight.value
    },
    layout: {
      containerWidth: Number(form.elements.containerWidth.value),
      cornerStyle: form.elements.cornerStyle.value,
      density: form.elements.density.value
    },
    typography: {
      fontFamily: form.elements.fontFamily.value,
      textSize: form.elements.textSize.value
    },
    effects: {
      ambient: form.elements.ambient.checked,
      backgroundGrid: form.elements.backgroundGrid.checked
    }
  };
}

function applySettingsPreview() {
  els.preview.contentWindow?.postMessage({ type: "sukura:preview-theme", theme: state.settingsDraft }, window.location.origin);
}

async function saveSettings(event) {
  event?.preventDefault?.();
  state.settingsDraft = settingsFromForm();
  state.content.site.theme = clone(state.settingsDraft);
  try {
    const result = await api("/api/editor/content/site", { method: "PUT", body: { content: state.content.site } });
    state.content.site = result.content;
    state.settingsDraft = clone(result.content.theme);
    setStatus("Settings saved");
    reloadPreview();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function discardSettings() {
  state.settingsDraft = clone(state.content.site?.theme || THEME_PRESETS.sukura);
  renderSettingsEditor();
  applySettingsPreview();
  setStatus("Settings discarded");
}

function exportSettings() {
  const data = JSON.stringify(settingsFromForm(), null, 2);
  const href = URL.createObjectURL(new Blob([`${data}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = "site-theme.json";
  link.click();
  URL.revokeObjectURL(href);
}

function renderContentNavigation() {
  if (state.section !== "pages") return;
  const pages = pageCatalog();
  if (!pages.some((page) => page.id === state.pageFilter)) state.pageFilter = "homepage";
  els.pageFilter.innerHTML = pages.map((page) => (
    `<option value="${escapeHtml(page.id)}"${page.id === state.pageFilter ? " selected" : ""}>${escapeHtml(page.label)}</option>`
  )).join("");
  const page = pages.find((item) => item.id === state.pageFilter);
  const sections = page?.sections || [];
  els.pageSections.innerHTML = sections.length
    ? [{ id: "all", label: "All sections" }, ...sections].map((section) => (
      `<button class="topic-nav__item${section.id === state.sectionFilter ? " is-active" : ""}" type="button" data-section-filter="${escapeHtml(section.id)}">${escapeHtml(section.label)}</button>`
    )).join("")
    : "";
  els.pageSections.querySelectorAll("[data-section-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.sectionFilter = button.dataset.sectionFilter;
      if (button.dataset.sectionFilter !== "all") navigatePreviewSection(page, button.dataset.sectionFilter);
      renderContentNavigation();
      renderList();
    });
  });
}

function selectPageFilter(pageId) {
  state.pageFilter = pageId;
  state.sectionFilter = "all";
  state.selectedField = null;
  const page = pageCatalog().find((item) => item.id === pageId);
  if (page?.dataset) state.dataset = page.dataset;
  if (page?.target) {
    els.previewTarget.value = page.target;
    reloadPreview({ syncPage: false });
  }
  render();
}

function pageCatalog() {
  const homepage = {
    id: "homepage",
    label: "Homepage",
    dataset: "site",
    target: "/index.html",
    sections: homepageSections()
  };
  const documents = Object.entries(state.content.pages || {}).map(([key, page]) => ({
    id: `page:${key}`,
    label: page.title || humanizePath([key]),
    dataset: "pages",
    target: pagePreviewUrl(key),
    sections: (page.sections || []).map((section, index) => ({
      id: section.id || `section-${index}`,
      label: section.heading || `Section ${index + 1}`,
      hash: section.id || ""
    }))
  }));
  const cultures = (state.content.culture?.themes || []).map((theme) => ({
    id: `culture:${theme.id}`,
    label: `Culture: ${theme.title || theme.id}`,
    dataset: "culture",
    target: `/pages/culture-detail.html?id=${encodeURIComponent(theme.id)}`,
    sections: [
      { id: "overview", label: "Overview" },
      { id: "leads", label: theme.leadsTitle || "Program leads" },
      { id: "artists", label: theme.artistsTitle || "Creators" }
    ]
  }));
  return [{ id: "all", label: "All pages", sections: [] }, homepage, ...documents, ...cultures];
}

function homepageSections() {
  return [
    ["general", "General"],
    ["hero", "Hero"],
    ["about", "About"],
    ["events", "Events"],
    ["culture", "Culture"],
    ["gallery", "Gallery"],
    ["instagram", "Instagram"],
    ["membership", "Membership"],
    ["contact", "Contact"],
    ["footer", "Footer"]
  ].map(([id, label]) => ({ id, label, hash: id === "general" || id === "footer" ? "" : id }));
}

function navigatePreviewSection(page, sectionId) {
  const section = page?.sections?.find((item) => item.id === sectionId);
  if (!page?.target || !section?.hash) return;
  els.preview.src = `${page.target}#${section.hash}`;
}

function pagePreviewUrl(key) {
  const routes = {
    impressum: "legal-notice",
    legalNotice: "legal-notice",
    datenschutz: "privacy",
    datenschutzerklaerung: "privacy",
    privacy: "privacy",
    satzung: "bylaws",
    bylaws: "bylaws",
    vorstand: "board",
    board: "board",
    mitglied: "membership",
    membership: "membership"
  };
  return `/pages/${routes[key] || key}.html`;
}

function editableGroups() {
  const groups = [];
  collectEditableGroups(state.content.site || {})
    .filter((group) => group.path[0] !== "theme")
    .forEach((group) => groups.push(annotateGroup(group, "site")));
  collectEditableGroups(state.content.pages || {}).forEach((group) => groups.push(annotateGroup(group, "pages")));
  collectEditableGroups(state.content.culture || {}).forEach((group) => groups.push(annotateGroup(group, "culture")));
  return groups;
}

function annotateGroup(group, dataset) {
  const annotated = { ...group, id: `${dataset}:${group.id}`, dataset };
  if (dataset === "site") {
    annotated.pageId = "homepage";
    annotated.pageLabel = "Homepage";
    annotated.sectionId = homepageSectionFor(group.path);
    annotated.sectionLabel = humanizePath([annotated.sectionId]);
  } else if (dataset === "pages") {
    const pageKey = String(group.path[0] || "");
    const page = state.content.pages?.[pageKey] || {};
    annotated.pageId = `page:${pageKey}`;
    annotated.pageLabel = page.title || humanizePath([pageKey]);
    const section = group.path[1] === "sections" ? page.sections?.[Number(group.path[2])] : null;
    annotated.sectionId = section?.id || String(group.path[1] || "overview");
    annotated.sectionLabel = section?.heading || humanizePath([annotated.sectionId]);
  } else {
    const theme = group.path[0] === "themes" ? state.content.culture?.themes?.[Number(group.path[1])] : null;
    annotated.pageId = theme ? `culture:${theme.id}` : "all";
    annotated.pageLabel = theme?.title ? `Culture: ${theme.title}` : "Culture";
    annotated.sectionId = ["leads", "artists"].includes(group.path[2]) ? group.path[2] : "overview";
    annotated.sectionLabel = annotated.sectionId === "leads" ? (theme?.leadsTitle || "Program leads")
      : annotated.sectionId === "artists" ? (theme?.artistsTitle || "Creators") : "Overview";
  }
  annotated.type = elementType(annotated);
  return annotated;
}

function homepageSectionFor(path) {
  const root = String(path[0] || "general");
  if (root === "images") return path[1] === "gallery" ? "gallery" : "general";
  return ({
    eventsSection: "events",
    cultureSection: "culture",
    gallerySection: "gallery",
    instagramSection: "instagram",
    membershipSection: "membership",
    contactSection: "contact"
  })[root] || root;
}

async function uploadMedia(event) {
  event.preventDefault();
  const form = new FormData(els.mediaUpload);
  const file = form.get("file");
  if (!file || !file.size) return;
  const selectedEvent = currentSelectedEvent();
  const dataBase64 = await readFileAsDataUrl(file);
  const result = await api("/api/editor/media/upload", {
    method: "POST",
    body: {
      filename: file.name,
      kind: form.get("kind"),
      eventSlug: form.get("eventSlug") || selectedEvent?.id || selectedEvent?.slug || "",
      date: form.get("date") || selectedEvent?.date || "",
      dataBase64
    }
  });
  state.media = (await api("/api/editor/media")).media;
  setStatus(`Uploaded ${result.media.path}`);
  render();
}

function mainGallery() {
  return state.content.site?.images?.gallery || [];
}

function selectedEventForMedia() {
  return currentSelectedEvent() || null;
}

function mediaEventOptions() {
  return [...state.events]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((event) => `
      <option value="${escapeHtml(event.id || event.slug)}"${event.id === state.selectedEventId || event.slug === state.selectedEventId ? " selected" : ""}>
        ${escapeHtml(event.status === "archive" ? `Archive: ${event.title}` : `Active: ${event.title}`)}
      </option>
    `).join("");
}

function eventGalleryHasPath(mediaPath) {
  const event = selectedEventForMedia();
  return (event?.gallery || []).some((image) => (typeof image === "string" ? image : image.src) === mediaPath);
}

async function addToEventGallery(mediaPath) {
  const event = selectedEventForMedia();
  if (!event) {
    setStatus("Select or create an event first", true);
    return;
  }
  const gallery = (event.gallery || []).map((image) => typeof image === "string" ? image : image.src);
  if (gallery.includes(mediaPath)) return;
  await saveEventGallery(event, [...gallery, mediaPath], "Added to event gallery");
}

async function removeFromEventGallery(mediaPath) {
  const event = selectedEventForMedia();
  if (!event) {
    setStatus("Select or create an event first", true);
    return;
  }
  const gallery = (event.gallery || []).map((image) => typeof image === "string" ? image : image.src);
  if (!gallery.includes(mediaPath)) return;
  if (!window.confirm(`Remove this image from the event gallery for "${event.title}"? The media file will stay on disk.`)) return;
  await saveEventGallery(event, gallery.filter((item) => item !== mediaPath), "Removed from event gallery");
}

async function saveEventGallery(event, gallery, message) {
  const nextEvent = {
    ...event,
    gallery
  };
  try {
    const result = await api(`/api/editor/events/${encodeURIComponent(event.id || event.slug)}`, {
      method: "PUT",
      body: { event: nextEvent }
    });
    state.events = result.events;
    state.content.events = state.events;
    state.selectedEventId = result.event?.id || event.id;
    setStatus(message);
    render();
    reloadPreview();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function addToMainGallery(mediaPath) {
  const gallery = mainGallery();
  if (galleryHasPath(gallery, mediaPath)) return;
  const alt = window.prompt("Alternative text for this gallery image:");
  if (!alt?.trim()) {
    setStatus("Alternative text is required before adding an image", true);
    return;
  }
  state.content.site.images ||= {};
  state.content.site.images.gallery = addGalleryReference(gallery, mediaPath, alt);
  await saveSiteContent("Added to main gallery");
}

async function removeFromMainGallery(mediaPath) {
  const gallery = mainGallery();
  if (!galleryHasPath(gallery, mediaPath)) return;
  if (!window.confirm("Remove this image from the main gallery? The media file will stay on disk.")) return;
  state.content.site.images.gallery = removeGalleryReference(gallery, mediaPath);
  await saveSiteContent("Removed from main gallery");
}

async function saveSiteContent(message) {
  const result = await api("/api/editor/content/site", { method: "PUT", body: { content: state.content.site } });
  state.content.site = result.content;
  setStatus(message);
  render();
  reloadPreview();
}

function eventFromForm() {
  const form = els.eventEditor;
  return {
    title: form.elements.title.value,
    id: form.elements.id.value,
    status: form.elements.status.value,
    date: form.elements.date.value,
    displayDate: form.elements.displayDate.value,
    location: form.elements.location.value,
    excerpt: form.elements.excerpt.value,
    description: form.elements.description.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    image: form.elements.image.value,
    coverImage: form.elements.image.value,
    imagePosition: form.elements.imagePosition.value,
    tags: form.elements.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    ticketUrl: form.elements.ticketUrl.value,
    ticketEmbed: form.elements.ticketEmbed.value,
    ticketEmbedHeight: form.elements.ticketEmbedHeight.value,
    gallery: form.elements.gallery.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    sections: sectionsFromEditor()
  };
}

function updateTicketState() {
  const archived = els.eventEditor.elements.status.value === "archive";
  document.querySelector("[data-ticket-fields]").classList.toggle("is-disabled", archived);
  els.eventEditor.elements.ticketUrl.disabled = archived;
  els.eventEditor.elements.ticketEmbed.disabled = archived;
  els.eventEditor.elements.ticketEmbedHeight.disabled = archived;
  els.statusHelp.textContent = archived
    ? "Archived events appear in the archive, keep galleries visible, and never show ticket buttons."
    : "Active events can show ticket links or an embedded ticket shop.";
  els.archiveEvent.hidden = archived || !state.selectedEventId;
  els.deleteEvent.hidden = !state.selectedEventId;
}

function renderSectionEditors(sections = []) {
  els.sectionList.innerHTML = "";
  if (!sections.length) {
    addSectionEditor();
    return;
  }
  sections.forEach((section) => addSectionEditor(section));
}

function addSectionEditor(section = {}) {
  const item = document.createElement("article");
  item.className = "section-editor";
  item.innerHTML = `
    <label>
      <span>Section heading</span>
      <input name="sectionHeading" value="${escapeHtml(section.heading || "")}" placeholder="Credits, Line-up, Danke">
    </label>
    <label>
      <span>Section paragraphs</span>
      <textarea name="sectionParagraphs" rows="4" placeholder="One paragraph per line">${escapeHtml((section.paragraphs || []).join("\n"))}</textarea>
    </label>
    <button class="button button--ghost button--small" type="button" data-remove-section>Remove section</button>
  `;
  item.querySelector("[data-remove-section]").addEventListener("click", () => {
    item.remove();
    if (!els.sectionList.children.length) addSectionEditor();
  });
  els.sectionList.append(item);
}

function sectionsFromEditor() {
  return [...els.sectionList.querySelectorAll(".section-editor")]
    .map((item) => ({
      heading: item.querySelector('[name="sectionHeading"]').value,
      paragraphs: item.querySelector('[name="sectionParagraphs"]').value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    }))
    .filter((section) => section.heading.trim() || section.paragraphs.length);
}

async function applyMediaToSelectedEvent(mediaPath, mode) {
  try {
    const event = currentSelectedEvent() || activeEvents()[0] || archiveEvents()[0];
    if (!event) {
      setStatus("Select or create an event first", true);
      return;
    }
    const nextEvent = { ...event };
    if (mode === "cover") {
      nextEvent.image = mediaPath;
      nextEvent.coverImage = mediaPath;
    } else {
      const gallery = (nextEvent.gallery || []).map((image) => typeof image === "string" ? image : image.src);
      if (!gallery.includes(mediaPath)) gallery.push(mediaPath);
      nextEvent.gallery = gallery;
    }
    const result = await api(`/api/editor/events/${encodeURIComponent(event.id || event.slug)}`, {
      method: "PUT",
      body: { event: nextEvent }
    });
    state.events = result.events;
    state.content.events = state.events;
    state.selectedEventId = result.event?.id || event.id;
    setStatus(mode === "cover" ? "Cover image updated" : "Gallery image added");
    render();
    reloadPreview();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function currentSelectedEvent() {
  return state.events.find((event) => event.id === state.selectedEventId || event.slug === state.selectedEventId);
}

function clearEventErrors() {
  els.eventErrors.hidden = true;
  els.eventErrors.innerHTML = "";
}

function renderEventErrors(errors = {}) {
  const entries = Object.entries(errors);
  els.eventErrors.hidden = !entries.length;
  els.eventErrors.innerHTML = entries.map(([field, message]) => (
    `<p><strong>${escapeHtml(humanizePath(field.split(".")))}:</strong> ${escapeHtml(message)}</p>`
  )).join("");
}

function attachPreviewClickHandler() {
  const doc = els.preview.contentDocument;
  if (!doc) return;
  doc.addEventListener("click", (event) => {
    const text = textFromNode(event.target);
    if (!text) return;
    const match = findFieldByText(text);
    if (!match) return;
    event.preventDefault();
    event.stopPropagation();
    state.section = "pages";
    state.dataset = match.dataset;
    state.selectedField = match.field;
    state.pageFilter = match.field.pageId;
    state.sectionFilter = match.field.sectionId;
    render();
  }, true);
}

function textFromNode(node) {
  const text = String(node?.textContent || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 260) return "";
  return text;
}

function findFieldByText(text) {
  const field = editableGroups().find((group) => (
    group.fields.some((item) => String(item.value).replace(/\s+/g, " ").trim() === text)
  ));
  if (field) return { dataset: field.dataset, field };
  return null;
}

function collectEditableGroups(value, path = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const groups = [];
  const fields = [];
  Object.entries(value).forEach(([key, child]) => {
    if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      fields.push({ key, path: [...path, key], value: child });
    } else if (Array.isArray(child) && child.every((item) => typeof item === "string")) {
      fields.push({ key, path: [...path, key], value: child.join("\n"), multiline: true });
    }
  });
  if (fields.length) {
    groups.push({
      id: path.join(".") || "general",
      path,
      label: groupLabel(value, path),
      fields
    });
  }
  Object.entries(value).forEach(([key, child]) => {
    if (Array.isArray(child)) {
      if (!child.every((item) => typeof item === "string")) {
        child.forEach((item, index) => {
          groups.push(...collectEditableGroups(item, [...path, key, index]));
        });
      }
    } else if (child && typeof child === "object") {
      groups.push(...collectEditableGroups(child, [...path, key]));
    }
  });
  return groups;
}

function setValueAtPath(root, path, value) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    current = current[path[index]];
  }
  const key = path[path.length - 1];
  if (Array.isArray(current[key])) {
    current[key] = value.split(/\r?\n/);
  } else {
    current[key] = value;
  }
}

function activeEvents() {
  return state.events.filter((event) => event.status !== "archive");
}

function archiveEvents() {
  return state.events.filter((event) => event.status === "archive");
}

function defaultEvent(status = "upcoming") {
  return {
    status,
    imagePosition: "center center",
    description: [],
    sections: [],
    gallery: [],
    tags: []
  };
}

function renderMediaDatalist() {
  els.mediaDatalist.innerHTML = state.media.map((item) => `<option value="${escapeHtml(item.path)}"></option>`).join("");
}

function reloadPreview(options = {}) {
  els.preview.src = els.previewTarget.value;
  if (options.syncPage === false || state.section !== "pages") return;
  const target = els.previewTarget.value;
  const match = pageCatalog().find((page) => page.target === target);
  if (!match) return;
  state.pageFilter = match.id;
  state.sectionFilter = "all";
  state.selectedField = null;
  if (match.dataset) state.dataset = match.dataset;
  renderContentNavigation();
  renderList();
}

function renderPreviewTargets() {
  const current = els.previewTarget.value || "/index.html";
  const pageOptions = [
    ["/index.html", "Homepage"],
    ["/pages/contact.html", "Contact"],
    ["/pages/membership.html", "Membership"],
    ["/pages/crowdfunding.html", "Crowdfunding"],
    ["/pages/legal-notice.html", "Legal Notice"],
    ["/pages/privacy.html", "Privacy"],
    ["/pages/bylaws.html", "Bylaws"],
    ["/pages/board.html", "Board"]
  ];
  const cultureOptions = (state.content.culture?.themes || []).map((theme) => [
    `/pages/culture-detail.html?id=${encodeURIComponent(theme.id)}`,
    theme.title || theme.id
  ]);
  const eventOptions = [...state.events]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((event) => [eventPreviewUrl(event), `${event.status === "archive" ? "Archive" : "Active"}: ${event.title}`]);
  els.previewTarget.innerHTML = [
    optionGroup("Website pages", pageOptions),
    optionGroup("Culture pages", cultureOptions),
    optionGroup("Event pages", eventOptions)
  ].join("");
  els.previewTarget.value = [...pageOptions, ...cultureOptions, ...eventOptions].some(([value]) => value === current)
    ? current
    : "/index.html";
}

function optionGroup(label, options) {
  if (!options.length) return "";
  return `<optgroup label="${escapeHtml(label)}">${options.map(([value, text]) => (
    `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`
  )).join("")}</optgroup>`;
}

function eventPreviewUrl(event) {
  return `/pages/events/${encodeURIComponent(event.id || event.slug)}.html`;
}

function renderGroupField(field, index) {
  const value = String(field.value ?? "");
  const multiline = field.multiline || value.length > 100 || value.includes("\n") || value.includes("<");
  const control = multiline
    ? `<textarea data-group-field="${index}" rows="${field.multiline ? 6 : 4}">${escapeHtml(value)}</textarea>`
    : `<input data-group-field="${index}" value="${escapeHtml(value)}">`;
  return `
    <label>
      <span>${escapeHtml(humanizePath([field.key]))}</span>
      ${control}
      <small>${escapeHtml(field.path.join("."))}</small>
    </label>
  `;
}

function groupLabel(value, path) {
  const ownLabel = value.label || value.title || value.heading || value.name;
  if (ownLabel) return String(ownLabel);
  if (!path.length) return "General website settings";
  const last = path[path.length - 1];
  if (Number.isInteger(last)) return `${humanizePath(path.slice(-2, -1))} #${last + 1}`;
  return humanizePath(path.slice(-2));
}

function groupMedia(items) {
  const groups = new Map();
  items.forEach((item) => {
    const details = mediaGroupDetails(item.path);
    if (!groups.has(details.id)) groups.set(details.id, { ...details, domId: `media-${slugify(details.id)}`, items: [] });
    groups.get(details.id).items.push(item);
  });
  return [...groups.values()].sort((a, b) => a.order.localeCompare(b.order));
}

function slugify(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "group";
}

function mediaGroupDetails(mediaPath) {
  const archive = mediaPath.match(/^assets\/images\/eventsArchive\/([^/]+)\/(display|original)\//);
  if (archive) {
    const [, folder, variant] = archive;
    const event = state.events.find((item) => (
      String(item.image || "").includes(`/eventsArchive/${folder}/`)
      || (item.gallery || []).some((image) => String(typeof image === "string" ? image : image.src).includes(`/eventsArchive/${folder}/`))
    ));
    const selected = event?.id === state.selectedEventId ? "0" : "1";
    return {
      id: `archive-${folder}-${variant}`,
      label: `${event?.title || folder} · ${variant === "display" ? "Web gallery" : "Original files"}`,
      order: `${selected}-archive-${invertDate(folder)}-${variant}`
    };
  }
  if (mediaPath.startsWith("assets/images/events/")) return { id: "events", label: "Active event covers", order: "2-events" };
  if (mediaPath.startsWith("assets/images/gallery/")) return { id: "gallery", label: "Homepage gallery", order: "3-gallery" };
  if (mediaPath.startsWith("assets/images/instagram-previews/")) return { id: "instagram", label: "Instagram previews", order: "4-instagram" };
  if (mediaPath.startsWith("assets/images/editor/")) return { id: "editor", label: "Editor uploads", order: "5-editor" };
  return { id: "other", label: "Other website images", order: "6-other" };
}

function invertDate(value) {
  return String(value).replace(/^(\d{4})-(\d{2})-(\d{2})/, (_, year, month, day) => (
    String(9999 - Number(year)).padStart(4, "0")
    + String(99 - Number(month)).padStart(2, "0")
    + String(99 - Number(day)).padStart(2, "0")
  ));
}

async function api(url, options = {}) {
  setStatus("Working");
  const method = options.method || "GET";
  const headers = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRF-Token"] = state.csrfToken;
  const response = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  if (response.status === 401) {
    window.location.assign("/editor/login");
  }
  if (!response.ok) {
    setStatus(body.error || "Request failed", true);
    const error = new Error(body.error || "Request failed");
    error.errors = body.errors;
    throw error;
  }
  setStatus("Ready");
  return body;
}

async function logout() {
  await api("/api/editor/auth/logout", { method: "POST", body: {} });
  window.location.assign("/editor/login");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function setStatus(message, error = false) {
  els.saveState.textContent = message;
  els.saveState.style.color = error ? "#ffb4ab" : "";
}

function previewValue(value) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 130 ? `${text.slice(0, 130)}...` : text;
}

function humanizePath(path) {
  return path
    .map((part) => String(part)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" / ");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
