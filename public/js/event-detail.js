import { initAnimations } from "./animations.js";
import { loadMergedJson } from "./data.js";
import { eventExcerpt, hasTickets, isArchive, normalizeGallery, ticketEmbedHeight } from "./event-model.js";
import { escapeHtml, safeAsset, safeCssPosition, safeHref, safeIframeSrc } from "./security.js";
import { applyTheme } from "./theme.js";

const defaultSitePath = new URL("../data/site.default.json", import.meta.url);
const localSitePath = new URL("../data/site.local.json", import.meta.url);
const defaultEventsPath = new URL("../data/events.default.json", import.meta.url);
const localEventsPath = new URL("../data/events.content.json", import.meta.url);

function pagePath(src = "") {
  const asset = safeAsset(src);
  if (!asset || /^(https?:|mailto:|#)/.test(asset) || asset.startsWith("../")) return asset;
  const prefix = window.location.pathname.includes("/pages/events/") ? "../../" : "../";
  return `${prefix}${src}`;
}

function iframeAllow(provider = "") {
  if (provider === "youtube") return "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture";
  if (provider === "spotify") return "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  if (provider === "soundcloud") return "autoplay; encrypted-media";
  return "fullscreen";
}

function eventDescriptionSections(event, labels = {}) {
  if (Array.isArray(event.description) && event.description.length) {
    return [{ heading: labels.eventSectionHeading || "Event", paragraphs: event.description }];
  }
  return [];
}

function indexAnchor(anchor) {
  const prefix = window.location.pathname.includes("/pages/events/") ? "../../" : "../";
  return `${prefix}index.html#${anchor}`;
}

function renderSections(sections = []) {
  return sections.map((section) => `
    <section class="event-detail-card" data-reveal>
      ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ""}
      ${(section.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </section>
  `).join("");
}

function visibleSections(event = {}) {
  if (!isArchive(event)) return event.sections || [];
  return (event.sections || []).filter((section) => {
    const content = [section.heading, ...(section.paragraphs || [])].join(" ").toLowerCase();
    return !content.includes("ticketshop")
      && !content.includes("ticket-shop")
      && !content.includes("ticket shop");
  });
}

function renderEmbeds(embeds = [], labels = {}) {
  if (!embeds.length) return "";
  const showHeading = labels.showEmbedsHeading !== false;
  return `
    <section class="event-embeds" ${showHeading ? 'aria-labelledby="event-embeds-title"' : `aria-label="${escapeHtml(labels.mediaLabel || "Media")}"`} data-reveal>
      ${showHeading ? `
        <span>${escapeHtml(labels.mediaLabel || "Media")}</span>
        <h2 id="event-embeds-title">${escapeHtml(labels.embedsTitle || "Eingebettete Inhalte")}</h2>
      ` : ""}
      <div class="event-embeds__grid">
        ${embeds.map((embed) => `
          <article class="event-embed event-embed--${escapeHtml(embed.provider || "media")}">
            <iframe
              src="${escapeHtml(safeIframeSrc(embed.src))}"
              title="${escapeHtml(embed.title || "Event Embed")}"
              loading="lazy"
              allow="${escapeHtml(iframeAllow(embed.provider))}"></iframe>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTicket(event, labels = {}) {
  if (!hasTickets(event)) return "";
  const ticketUrl = event.ticketUrl || event.ticketLink || event.ticketEmbed || "";
  const ticketEmbed = safeIframeSrc(event.ticketEmbed);
  return `
    <section class="event-ticket" aria-labelledby="event-ticket-title" data-reveal>
      <div>
        <span>${escapeHtml(labels.tickets || "Tickets")}</span>
        <h2 id="event-ticket-title">${escapeHtml(labels.ticketTitle || "Ticketshop")}</h2>
      </div>
      ${ticketEmbed ? `
        <div class="ticket-embed-wrapper" style="--ticket-embed-height: ${ticketEmbedHeight(event)}px">
          <iframe
            src="${escapeHtml(ticketEmbed)}"
            title="${escapeHtml(labels.ticketEmbedTitle || "Ticketshop")}"
            loading="lazy"
            allow="fullscreen"></iframe>
        </div>
      ` : ""}
      <a class="button" href="${escapeHtml(safeHref(ticketUrl) || "#")}" target="_blank" rel="noreferrer">${escapeHtml(labels.openTickets || "Open tickets")}</a>
    </section>
  `;
}

function renderGallery(event, labels = {}) {
  const gallery = normalizeGallery(event);
  if (!gallery.length) return "";
  const description = (labels.galleryDescription || "{count} locally stored archive images.").replace("{count}", gallery.length);
  return `
    <section class="event-gallery" aria-labelledby="event-gallery-title" data-reveal>
      <span>${escapeHtml(labels.galleryLabel || "Galerie")}</span>
      <h2 id="event-gallery-title">${escapeHtml(labels.galleryTitle || "Bilder des Events")}</h2>
      ${labels.showGalleryDescription === false ? "" : `<p>${escapeHtml(description)}</p>`}
      <div class="event-gallery__grid">
        ${gallery.map((image, index) => `
          <figure>
            <img src="${escapeHtml(pagePath(image.src))}" alt="${escapeHtml(image.alt || `${event.title} Bild ${index + 1}`)}" loading="${index < 4 ? "eager" : "lazy"}">
          </figure>
        `).join("")}
      </div>
    </section>
  `;
}

function renderEvent(event, labels = {}) {
  const cover = pagePath(event.coverImage || event.image || "assets/icons/site-placeholder.svg");
  const ticketAction = hasTickets(event)
    ? `<div class="event-card__actions"><a class="button" href="#event-ticket-title">${escapeHtml(labels.viewTickets || "Tickets ansehen")}</a></div>`
    : "";
  const gallery = renderGallery(event, labels);
  return `
    <article class="event-detail-hero" data-reveal>
      <div>
        <span>${escapeHtml(event.displayDate || event.date || (isArchive(event) ? "Archive" : "Event"))}</span>
        <h1>${escapeHtml(event.title || "Event")}</h1>
        <p>${escapeHtml(eventExcerpt(event))}</p>
        <p class="event-card__location">${escapeHtml(event.location || labels.locationPending || "Location follows")}</p>
        <div class="tag-list">${(event.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        ${ticketAction}
      </div>
      <figure>
        <img src="${escapeHtml(cover)}" alt="${escapeHtml(event.title || "Event")}" loading="eager" style="object-position: ${escapeHtml(safeCssPosition(event.imagePosition))}">
      </figure>
    </article>
    ${isArchive(event) ? gallery : ""}
    <div class="event-detail-content">
      ${renderSections(eventDescriptionSections(event, labels))}
      ${renderSections(visibleSections(event))}
    </div>
    ${renderTicket(event, labels)}
    ${renderEmbeds(event.embeds || [], labels)}
    ${isArchive(event) ? "" : gallery}
  `;
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const slug = document.body.dataset.event || params.get("id");
  const node = document.querySelector("[data-event-detail]");
  if (!slug || !node) return;
  const site = await loadMergedJson(defaultSitePath, localSitePath);
  const events = await loadMergedJson(defaultEventsPath, localEventsPath);
  applyTheme(site.theme);
  const labels = site.eventsSection?.labels || {};

  const event = events.find((item) => item.id === slug || item.slug === slug);
  if (!event) {
    node.innerHTML = `<div class="empty-state">${escapeHtml(labels.notFound || "Dieses Event konnte nicht gefunden werden.")}</div>`;
    return;
  }

  document.title = `${event.title} | ${site.name || "Event"}`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", eventExcerpt(event));
  const back = document.querySelector(".detail-back");
  if (back) {
    const archived = isArchive(event);
    back.textContent = archived ? (labels.backArchive || "Back to archive") : (labels.backEvents || "Back to events");
    back.href = indexAnchor(archived ? "archive" : "events");
  }
  node.innerHTML = renderEvent(event, labels);
  initAnimations();
}

boot().catch(console.warn);
