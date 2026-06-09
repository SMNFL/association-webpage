import { initNavigation } from "./navigation.js";
import { initAnimations } from "./animations.js";
import { renderEvents } from "./events.js";
import { renderInstagram } from "./instagram-live.js";
import { loadMergedJson } from "./data.js";
import { escapeHtml, safeAsset, safeHref, safeIframeSrc } from "./security.js";
import { applyTheme } from "./theme.js";

const defaultConfigPath = new URL("../data/site.default.json", import.meta.url);
const localConfigPath = new URL("../data/site.local.json", import.meta.url);

async function loadSiteConfig() {
  return loadMergedJson(defaultConfigPath, localConfigPath);
}

function setText(selector, value = "") {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function setHtml(selector, value = "") {
  document.querySelectorAll(selector).forEach((node) => {
    node.innerHTML = value;
  });
}

function setHref(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    const href = safeHref(value, { mailto: true });
    if (href) node.href = href;
  });
}

function setMeta(selector, value) {
  const node = document.querySelector(selector);
  if (node && value !== undefined) node.setAttribute("content", value);
}

function resolveConfigHref(action, config) {
  if (action.configHref && config.links?.[action.configHref]) return config.links[action.configHref];
  return action.href || "#";
}

function renderNav(config) {
  const nav = document.querySelector("[data-nav]");
  if (!nav) return;
  nav.innerHTML = (config.nav || []).map((item) => (
    `<a data-nav-link href="${escapeHtml(safeHref(item.href) || "#")}">${escapeHtml(item.label)}</a>`
  )).join("");
}

function renderHero(config) {
  const hero = config.hero || {};
  setText("[data-hero-signal]", hero.signal);
  setText("[data-hero-title]", hero.title);
  setText("[data-hero-body]", hero.body);
  setText("[data-hero-panel-label]", hero.panel?.label);
  setText("[data-hero-panel-text]", hero.panel?.text);

  const videoWrapper = document.querySelector("[data-hero-video-wrapper]");
  if (videoWrapper) {
    const videoSrc = safeIframeSrc(hero.video?.src);
    if (hero.video?.enabled && videoSrc) {
      videoWrapper.hidden = false;
      videoWrapper.setAttribute("aria-label", hero.video.label || hero.video.title || "Featured video");
      videoWrapper.innerHTML = `
        <iframe
          src="${escapeHtml(videoSrc)}"
          title="${escapeHtml(hero.video.title || "Featured video")}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture"
          referrerpolicy="strict-origin-when-cross-origin"></iframe>
      `;
    } else {
      videoWrapper.hidden = true;
      videoWrapper.innerHTML = "";
    }
  }

  const actions = document.querySelector("[data-hero-actions]");
  if (actions) {
    actions.innerHTML = (hero.actions || []).map((action) => {
      const variant = action.variant === "ghost" ? " button--ghost" : "";
      return `<a class="button${variant}" href="${escapeHtml(safeHref(resolveConfigHref(action, config)) || "#")}">${escapeHtml(action.label)}</a>`;
    }).join("");
  }
}

function renderAbout(config) {
  const about = config.about || {};
  setText("[data-about-number]", about.number);
  setText("[data-about-title]", about.title);
  setHtml("[data-about-copy]", (about.paragraphs || []).map((text) => `<p>${escapeHtml(text)}</p>`).join(""));
  setHtml("[data-about-tags]", (about.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join(""));
}

function renderSectionHeadings(config) {
  const events = config.eventsSection || {};
  setText("[data-events-number]", events.number);
  setText("[data-events-title]", events.title);
  setText("[data-events-description]", events.description);
  setText("[data-events-archive-title]", events.archiveTitle);
  setText("[data-events-archive-description]", events.archiveDescription);
  setText("[data-events-empty]", events.emptyError);

  const culture = config.cultureSection || {};
  setText("[data-culture-number]", culture.number);
  setText("[data-culture-title]", culture.title);
  setText("[data-culture-description]", culture.description);

  const gallery = config.gallerySection || {};
  setText("[data-gallery-number]", gallery.number);
  setText("[data-gallery-title]", gallery.title);
  setText("[data-gallery-description]", gallery.description);

  const instagram = config.instagramSection || {};
  setText("[data-instagram-number]", instagram.number);
  setText("[data-instagram-title]", instagram.title);
  setText("[data-instagram-description]", instagram.description);
  setText("[data-instagram-link]", instagram.buttonLabel);
  setText("[data-instagram-source]", instagram.sourceLabel);

  const membership = config.membershipSection || {};
  setText("[data-membership-title]", membership.title);
  setText("[data-membership-description]", membership.description);
  setText("[data-membership-link]", membership.buttonLabel);
  setText("[data-membership-secondary]", membership.secondaryLabel);
  setHref("[data-membership-secondary]", membership.secondaryHref);

  const contact = config.contactSection || {};
  setText("[data-contact-number]", contact.number);
  setText("[data-contact-title]", contact.title);
  setText("[data-contact-description]", contact.description);
  setText("[data-map-label]", contact.map?.label);
  setText("[data-map-title]", contact.map?.title);
  setText("[data-map-description]", contact.map?.description);
  setText("[data-map-button]", contact.map?.buttonLabel);
}

function renderCulture(config) {
  const node = document.querySelector("[data-culture-cards]");
  if (!node) return;
  node.innerHTML = (config.cultureSection?.cards || []).map((card) => {
    const tag = card.href ? "a" : "article";
    const href = card.href ? ` href="${escapeHtml(safeHref(card.href) || "#")}"` : "";
    const label = card.href ? `<small>${escapeHtml(card.linkLabel || "Mehr erfahren")}</small>` : "";
    return `
    <${tag} class="culture-card"${href} data-reveal>
      <span>${escapeHtml(card.number || "")}</span>
      <h3>${escapeHtml(card.title || "")}</h3>
      <p>${escapeHtml(card.description || "")}</p>
      ${label}
    </${tag}>
  `;
  }).join("");
}

function renderGallery(config) {
  const gallery = document.querySelector("[data-gallery]");
  if (!gallery) return;
  gallery.innerHTML = (config.images?.gallery || []).map((image, index) => `
    <figure class="mood-tile ${index === 0 ? "mood-tile--wide" : ""}" data-reveal>
      <img src="${escapeHtml(safeAsset(image.src))}" alt="${escapeHtml(image.alt || config.name || "Gallery image")}" loading="lazy">
    </figure>
  `).join("");
}

function renderContact(config) {
  const contact = config.contactSection || {};
  const cards = document.querySelector("[data-contact-cards]");
  if (cards) {
    const socialLinks = (contact.socialLinks || config.socialLinks || []).map((link) => (
      `<a href="${escapeHtml(safeHref(link.url) || "#")}" target="_blank" rel="noreferrer"><strong>${escapeHtml(link.label)}</strong></a>`
    )).join("");

    const emailHref = safeHref(`mailto:${config.email || ""}`, { mailto: true }) || "#";
    const contactHref = safeHref(contact.contactButtonHref || config.links?.contact || "pages/contact.html?back=contact") || "#";
    cards.innerHTML = `
      <article class="contact-card" data-reveal>
        <span>${escapeHtml(contact.emailLabel || "Email")}</span>
        <a class="contact-card__email" href="${escapeHtml(emailHref)}"><strong data-site-email>${escapeHtml(config.email || "")}</strong></a>
        <a class="contact-card__button" href="${escapeHtml(contactHref)}">${escapeHtml(contact.contactButtonLabel || "Contact form")}</a>
      </article>
      <div class="contact-card" data-reveal>
        <span>${escapeHtml(contact.instagramLabel || "Instagram")}</span>
        <div class="contact-card__links">${socialLinks}</div>
      </div>
      <a class="contact-card" data-maps-link href="${escapeHtml(safeHref(config.address?.mapsUrl) || "#")}" target="_blank" rel="noreferrer" data-reveal>
        <span>${escapeHtml(contact.mapsLabel || "Maps")}</span>
        <strong>${escapeHtml(contact.mapsCardText || config.address?.mapsPlaceName || "")}</strong>
      </a>
    `;
  }

  setHref("[data-maps-link]", config.address?.mapsUrl);
  const mapEmbed = document.querySelector("[data-maps-embed]");
  if (mapEmbed && safeIframeSrc(config.address?.mapsEmbedUrl)) {
    mapEmbed.src = safeIframeSrc(config.address.mapsEmbedUrl);
    mapEmbed.title = `Google Maps: ${config.address.mapsPlaceName || config.address.name || config.name}`;
  }
}

function renderFooter(config) {
  setText("[data-footer-copyright]", config.footer?.copyright);
  const footerLinks = document.querySelector("[data-footer-links]");
  if (footerLinks) {
    footerLinks.innerHTML = (config.footer?.links || []).map((link) => (
      `<a href="${escapeHtml(safeHref(footerHref(link.href)) || "#")}">${escapeHtml(link.label)}</a>`
    )).join("");
  }
}

function footerHref(href = "") {
  const value = String(href || "");
  if (!/^pages\/(?:legal-notice|privacy|bylaws|board)\.html$/i.test(value)) return value;
  return `${value}?back=footer`;
}

function scrollToHashTarget() {
  if (!window.location.hash) return;
  const id = window.location.hash.slice(1);
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;

  const scroll = () => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    const offset = id === "hero" ? 0 : 88;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);
    window.scrollTo(0, top);
    window.dispatchEvent(new Event("scroll"));
    root.style.scrollBehavior = previousScrollBehavior;
  };
  window.requestAnimationFrame(() => {
    scroll();
    window.setTimeout(scroll, 180);
    window.setTimeout(scroll, 520);
  });
}

window.addEventListener("hashchange", scrollToHashTarget);

function applySiteConfig(config) {
  applyTheme(config.theme);
  document.documentElement.lang = config.language || "en";
  document.title = config.title || config.name || document.title;
  setMeta('meta[name="description"]', config.description || "");
  setMeta('meta[name="theme-color"]', config.theme?.themeColor || config.themeColor || "#060811");
  setMeta('meta[property="og:title"]', config.title || config.name || "");
  setMeta('meta[property="og:description"]', config.description || "");
  setMeta('meta[property="og:image"]', config.images?.socialPreview || config.images?.hero || "");

  setText("[data-site-name]", config.name);
  setText("[data-site-email]", config.email);
  setHref("[data-booking-link]", config.links?.booking);
  setHref("[data-membership-link]", config.links?.membership);

  const brand = document.querySelector("[data-brand-link]");
  if (brand) brand.setAttribute("aria-label", `${config.name} homepage`);

  const favicon = document.querySelector("[data-favicon]");
  if (favicon && config.images?.logo) favicon.href = safeAsset(config.images.logo);

  const heroImage = document.querySelector("[data-hero-image]");
  if (heroImage && safeAsset(config.images?.hero)) {
    heroImage.style.backgroundImage = `linear-gradient(90deg, rgba(5, 7, 15, .94), rgba(5, 7, 15, .58) 45%, rgba(5, 7, 15, .18)), url("${safeAsset(config.images.hero)}")`;
  }

  const logo = document.querySelector("[data-logo]");
  if (logo) {
    if (safeAsset(config.images?.logo)) logo.src = safeAsset(config.images.logo);
    logo.alt = config.name ? `${config.name} Logo` : "";
  }

  renderNav(config);
  renderHero(config);
  renderAbout(config);
  renderSectionHeadings(config);
  renderCulture(config);
  renderGallery(config);
  renderContact(config);
  renderFooter(config);
}

async function boot() {
  try {
    const config = await loadSiteConfig();
    applySiteConfig(config);
    initNavigation();
    renderInstagram(config.instagram);
    await renderEvents(config.eventsSection);
  } catch (error) {
    console.warn(error);
    initNavigation();
    await renderEvents();
  }

  initAnimations();
  scrollToHashTarget();
}

boot();
