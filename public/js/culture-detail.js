import { initAnimations } from "./animations.js";
import { loadMergedJson } from "./data.js";
import { escapeHtml, safeAsset, safeCssPosition, safeHref, safeIframeSrc } from "./security.js";
import { applyTheme } from "./theme.js";

const defaultSitePath = new URL("../data/site.default.json", import.meta.url);
const localSitePath = new URL("../data/site.local.json", import.meta.url);
const defaultCulturePath = new URL("../data/culture.default.json", import.meta.url);
const localCulturePath = new URL("../data/culture.local.json", import.meta.url);
const allowedBackSections = new Set(["hero", "events", "culture", "membership", "contact", "gallery", "instagram"]);
let masonryFrame = 0;

function setText(selector, value = "") {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function setAttr(selector, attr, value) {
  document.querySelectorAll(selector).forEach((node) => {
    if (value) node.setAttribute(attr, value);
  });
}

function resolvePageAsset(path = "") {
  const asset = safeAsset(path);
  if (!asset || /^(https?:)?\/\//.test(asset) || asset.startsWith("/") || asset.startsWith("../")) return asset;
  return `../${asset}`;
}

function resolveBackHref() {
  const requestedBack = new URLSearchParams(window.location.search).get("back");
  const section = allowedBackSections.has(requestedBack) ? requestedBack : "culture";
  return `../index.html#${section}`;
}

function iframeAllow(provider = "") {
  if (provider === "youtube") return "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture";
  if (provider === "spotify") return "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  if (provider === "soundcloud") return "autoplay; encrypted-media";
  return "autoplay";
}

function renderEmbeds(embeds = []) {
  if (!embeds.length) return "";
  return `
    <div class="media-embed-grid">
      ${embeds.map((embed) => `
        <figure class="media-embed media-embed--${escapeHtml(embed.provider || "generic")}">
          <iframe
            title="${escapeHtml(embed.title || "Embedded media")}"
            src="${escapeHtml(safeIframeSrc(embed.src))}"
            loading="lazy"
            allow="${iframeAllow(embed.provider)}"
            ${embed.provider === "soundcloud" ? 'scrolling="no"' : ""}></iframe>
        </figure>
      `).join("")}
    </div>
  `;
}

function renderLinks(links = []) {
  const renderedLinks = links
    .map((link) => {
      const href = safeHref(link.url || link.href || "", { mailto: true });
      if (!href) return "";
      const external = /^https?:\/\//i.test(href);
      return `
        <a class="text-link" href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>
          ${escapeHtml(link.label || link.title || href)}
        </a>
      `;
    })
    .filter(Boolean)
    .join("");
  if (!renderedLinks) return "";
  return `<div class="artist-links">${renderedLinks}</div>`;
}

function renderPerson(person) {
  const image = resolvePageAsset(person.image || "");
  const position = person.imagePosition ? ` style="object-position: ${escapeHtml(safeCssPosition(person.imagePosition))};"` : "";
  const embeds = renderEmbeds(person.embeds || []);
  const links = renderLinks(person.links || []);
  const cardClasses = [
    "artist-card",
    image ? "" : "artist-card--no-image",
    embeds ? "" : "artist-card--no-embeds"
  ].filter(Boolean).join(" ");
  return `
    <article class="${cardClasses}" data-reveal>
      ${image ? `<img class="artist-card__image" src="${escapeHtml(image)}" alt="${escapeHtml(person.imageAlt || person.name || "")}" loading="lazy"${position}>` : ""}
      <div class="artist-card__content">
        <div class="artist-card__copy">
          <span>${escapeHtml(person.role || "")}</span>
          <h3>${escapeHtml(person.name || "")}</h3>
          ${(person.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
          ${links}
        </div>
      </div>
      ${embeds ? `<div class="artist-card__media">${embeds}</div>` : ""}
    </article>
  `;
}

function renderPeople(selector, sectionSelector, people = []) {
  const section = document.querySelector(sectionSelector);
  const node = document.querySelector(selector);
  if (!section || !node) return;
  section.hidden = !people.length;
  node.dataset.count = String(people.length);
  if (people.length === 1) node.dataset.single = "true";
  else delete node.dataset.single;
  node.innerHTML = people.map((person) => renderPerson(person)).join("");
}

function cssPixelValue(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resetMasonryGrid(grid) {
  grid.removeAttribute("data-masonry-ready");
  grid.style.removeProperty("height");
  Array.from(grid.children).forEach((card) => {
    card.style.removeProperty("position");
    card.style.removeProperty("width");
    card.style.removeProperty("top");
    card.style.removeProperty("left");
  });
}

function layoutMasonryGrid(grid) {
  const cards = Array.from(grid.children).filter((child) => child.classList.contains("artist-card"));
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  if (!cards.length || mobile) {
    resetMasonryGrid(grid);
    return;
  }

  const styles = window.getComputedStyle(grid);
  const width = grid.clientWidth;
  const gap = cssPixelValue(styles.columnGap || styles.gap, 24);
  const minWidth = cssPixelValue(styles.getPropertyValue("--masonry-min-width"), 360);
  const columnCount = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  if (columnCount <= 1) {
    resetMasonryGrid(grid);
    return;
  }

  const columnWidth = (width - gap * (columnCount - 1)) / columnCount;
  const columns = Array.from({ length: columnCount }, () => 0);

  grid.dataset.masonryReady = "true";
  grid.style.height = "auto";
  cards.forEach((card) => {
    card.style.width = `${columnWidth}px`;
    card.style.top = "0";
    card.style.left = "0";
  });

  cards.forEach((card) => {
    const shortest = columns.indexOf(Math.min(...columns));
    const x = shortest * (columnWidth + gap);
    const y = columns[shortest];
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    columns[shortest] += card.offsetHeight + gap;
  });

  grid.style.height = `${Math.max(0, Math.max(...columns) - gap)}px`;
}

function scheduleMasonryLayout() {
  if (masonryFrame) return;
  masonryFrame = window.requestAnimationFrame(() => {
    masonryFrame = 0;
    document.querySelectorAll("[data-masonry-grid]").forEach(layoutMasonryGrid);
  });
}

function setupMasonryLayouts() {
  const grids = Array.from(document.querySelectorAll("[data-masonry-grid]"));
  if (!grids.length) return;

  grids.forEach(layoutMasonryGrid);
  window.addEventListener("resize", scheduleMasonryLayout, { passive: true });
  document.fonts?.ready.then(scheduleMasonryLayout).catch(() => {});

  grids.forEach((grid) => {
    grid.querySelectorAll("img, iframe").forEach((media) => {
      media.addEventListener("load", scheduleMasonryLayout, { once: true });
      media.addEventListener("error", scheduleMasonryLayout, { once: true });
    });
  });
}

function findTheme(cultureData, id) {
  const themes = cultureData.themes || [];
  return themes.find((theme) => theme.id === id) || themes[0] || null;
}

async function boot() {
  const [site, cultureData] = await Promise.all([
    loadMergedJson(defaultSitePath, localSitePath),
    loadMergedJson(defaultCulturePath, localCulturePath)
  ]);

  const id = new URLSearchParams(window.location.search).get("id");
  const theme = findTheme(cultureData, id);
  if (!theme) {
    setText("[data-theme-title]", "Culture");
    setText("[data-theme-description]", "Add culture themes in public/data/culture.local.json.");
    initAnimations();
    return;
  }

  applyTheme(site.theme);
  document.documentElement.lang = site.language || "en";
  document.title = `${theme.title} | ${site.name}`;
  setAttr('meta[name="description"]', "content", theme.description || site.description);
  setAttr("[data-favicon]", "href", site.images?.logo);
  setText("[data-back-label]", cultureData.backLabel || "Back to overview");
  setAttr("[data-back-label]", "href", resolveBackHref());
  setText("[data-theme-number]", theme.number || "");
  setText("[data-theme-title]", theme.title || "");
  setText("[data-theme-description]", theme.description || "");
  setText("[data-theme-leads-title]", theme.leadsTitle || "Program leads");
  setText("[data-theme-artists-title]", theme.artistsTitle || "Aus dem Umfeld");

  const links = document.querySelector("[data-theme-links]");
  if (links) links.innerHTML = renderEmbeds(theme.embeds || []);

  renderPeople("[data-theme-leads]", "[data-theme-leads-section]", theme.leads || []);
  renderPeople("[data-theme-artists]", "[data-theme-artists-section]", theme.artists || []);
  setupMasonryLayouts();
  initAnimations();
}

boot().catch(console.warn);
