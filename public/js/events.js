import { loadMergedJson } from "./data.js";
import {
  eventExcerpt,
  eventUrl,
  hasTickets,
  isPast,
  splitEventsForDisplay
} from "./event-model.js";
import { escapeHtml, safeAsset, safeCssPosition, safeHref } from "./security.js";

const defaultEventsPath = new URL("../data/events.default.json", import.meta.url);
const localEventsPath = new URL("../data/events.content.json", import.meta.url);
const defaultSitePath = new URL("../data/site.default.json", import.meta.url);
const localSitePath = new URL("../data/site.local.json", import.meta.url);

function formatDate(dateString, labels = {}) {
  if (!dateString) return labels.datePending || "";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${dateString}T12:00:00`));
}

function eventCard(event, index, labels = {}, mode = "upcoming") {
  const archiveMode = mode === "archive" || isPast(event);
  const href = eventUrl(event, index);
  const ticketUrl = event.ticketUrl || event.ticketLink;
  const actions = archiveMode ? [] : [
    hasTickets(event) && ticketUrl ? `<a class="text-link" href="${escapeHtml(safeHref(ticketUrl) || "#")}" target="_blank" rel="noreferrer">${escapeHtml(labels.tickets || "")}</a>` : "",
    event.instagramPostUrl ? `<a class="text-link" href="${escapeHtml(safeHref(event.instagramPostUrl) || "#")}" target="_blank" rel="noreferrer">${escapeHtml(labels.instagramPost || "")}</a>` : ""
  ].filter(Boolean);
  const title = escapeHtml(event.title);
  const tag = archiveMode ? "a" : "article";
  const tagAttrs = archiveMode
    ? `href="${escapeHtml(safeHref(href) || "#")}" aria-label="${escapeHtml(labels.archiveOpenLabel || "")}: ${title}"`
    : "";
  const location = escapeHtml(event.location || labels.locationPending || "");
  const tags = (event.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");

  return `
    <${tag} class="event-card ${archiveMode ? "event-card--past" : ""}" ${tagAttrs} data-date="${escapeHtml(event.date || "")}" data-reveal>
      <div class="event-card__image">
        <img src="${escapeHtml(safeAsset(event.image || "assets/icons/site-placeholder.svg"))}" alt="${title}" loading="lazy" style="object-position: ${escapeHtml(safeCssPosition(event.imagePosition))}">
      </div>
      <div class="event-card__body">
        <div class="event-card__meta">
          <span>${escapeHtml(event.displayDate || formatDate(event.date, labels))}</span>
          ${event.time ? `<span>${escapeHtml(event.time)}</span>` : ""}
        </div>
        <h3>${title}</h3>
        <p>${escapeHtml(eventExcerpt(event))}</p>
        <p class="event-card__location">${location}</p>
        <div class="tag-list">${tags}</div>
        ${archiveMode ? "" : `
          <div class="event-card__actions">
            <a class="text-link" href="${escapeHtml(safeHref(href) || "#")}">${escapeHtml(labels.openEventPage || "")}</a>
            ${actions.join("")}
          </div>
        `}
      </div>
    </${tag}>
  `;
}

function getVisibleCount() {
  if (window.matchMedia("(max-width: 760px)").matches) return 1;
  if (window.matchMedia("(max-width: 980px)").matches) return 2;
  return 3;
}

function initArchiveSlider(slider) {
  const viewport = slider.querySelector("[data-archive-viewport]");
  const track = slider.querySelector("[data-past-events]");
  const prevButton = slider.querySelector("[data-archive-prev]");
  const nextButton = slider.querySelector("[data-archive-next]");
  if (!viewport || !track || !prevButton || !nextButton) return;

  let currentIndex = 0;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerTracking = false;

  function maxIndex() {
    return Math.max(0, track.children.length - getVisibleCount());
  }

  function equalizeCardHeights() {
    const cards = [...track.children];
    cards.forEach((card) => {
      card.style.height = "auto";
    });
    const maxHeight = Math.max(...cards.map((card) => card.offsetHeight), 0);
    cards.forEach((card) => {
      card.style.height = `${maxHeight}px`;
    });
  }

  function update() {
    equalizeCardHeights();
    currentIndex = Math.min(Math.max(currentIndex, 0), maxIndex());
    const activeCard = track.children[currentIndex];
    const offset = activeCard ? activeCard.offsetLeft : 0;
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    prevButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex >= maxIndex();
  }

  function goTo(index) {
    currentIndex = index;
    update();
  }

  function step(direction) {
    const visibleCount = getVisibleCount();
    goTo(currentIndex + (visibleCount * direction));
  }

  prevButton.addEventListener("click", () => step(-1));
  nextButton.addEventListener("click", () => step(1));

  slider.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    pointerTracking = true;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
  });

  viewport.addEventListener("pointerup", (event) => {
    if (!pointerTracking) return;
    pointerTracking = false;
    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    step(deltaX < 0 ? 1 : -1);
  });

  viewport.addEventListener("pointercancel", () => {
    pointerTracking = false;
  });

  window.addEventListener("resize", () => {
    window.requestAnimationFrame(update);
  });
  window.requestAnimationFrame(update);
}

export async function renderEvents(labels = {}) {
  const upcomingNode = document.querySelector("[data-upcoming-events]");
  const pastNode = document.querySelector("[data-past-events]");
  const emptyNode = document.querySelector("[data-events-empty]");
  if (!upcomingNode || !pastNode) return;

  try {
    const eventLabels = await resolveEventLabels(labels);
    const events = await loadMergedJson(defaultEventsPath, localEventsPath);
    const { upcoming, archive } = splitEventsForDisplay(events);

    upcomingNode.innerHTML = upcoming.map((event, index) => eventCard(event, index, eventLabels)).join("");
    pastNode.innerHTML = archive.map((event, index) => eventCard(event, index, eventLabels, "archive")).join("");
    if (emptyNode) emptyNode.hidden = events.length > 0;
    initArchiveSlider(document.querySelector("[data-archive-slider]"));

    if (!upcoming.length) {
      upcomingNode.innerHTML = `<div class="empty-state">${escapeHtml(eventLabels.emptyUpcoming || "")}</div>`;
    }
  } catch (error) {
    console.warn(error);
    const eventLabels = await resolveEventLabels(labels);
    emptyNode.textContent = eventLabels.emptyError || "";
    emptyNode.hidden = false;
  }
}

async function resolveEventLabels(section = {}) {
  if (section?.labels) return flattenEventLabels(section);
  try {
    const site = await loadMergedJson(defaultSitePath, localSitePath);
    return flattenEventLabels(site.eventsSection || {});
  } catch {
    return flattenEventLabels(section);
  }
}

function flattenEventLabels(section = {}) {
  return {
    ...section,
    ...(section.labels || {})
  };
}
