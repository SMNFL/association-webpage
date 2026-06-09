import { loadMergedJson } from "./data.js";
import { initAnimations } from "./animations.js";
import { configureCaptcha, captchaTokenValue, resetCaptcha, resolveCaptchaConfig } from "./captcha.js";
import { escapeHtml, safeAsset, safeHref, sanitizeRichHtml } from "./security.js";
import { applyTheme } from "./theme.js";

const defaultSitePath = new URL("../data/site.default.json", import.meta.url);
const localSitePath = new URL("../data/site.local.json", import.meta.url);
const defaultPagesPath = new URL("../data/pages.default.json", import.meta.url);
const localPagesPath = new URL("../data/pages.local.json", import.meta.url);
const allowedBackSections = new Set(["hero", "events", "culture", "membership", "contact", "gallery", "instagram", "footer"]);
const pageBackFallbacks = {
  crowdfunding: "hero",
  legalNotice: "footer",
  privacy: "footer",
  bylaws: "footer",
  board: "footer",
  membership: "membership"
};
const pageAliases = {
  legalNotice: ["impressum"],
  privacy: ["datenschutz", "datenschutzerklaerung"],
  bylaws: ["satzung"],
  board: ["vorstand"],
  membership: ["mitglied"]
};
let cleanupStatuteTocBounds = () => {};
let cleanupStatuteTocDisclosure = () => {};
const fixedTocPages = new Set(["bylaws", "crowdfunding"]);

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

function setAttr(selector, attr, value) {
  document.querySelectorAll(selector).forEach((node) => {
    if (value) node.setAttribute(attr, value);
  });
}

function resolveBackHref(pageKey = "") {
  const requestedBack = new URLSearchParams(window.location.search).get("back");
  if (allowedBackSections.has(requestedBack)) return `../index.html#${requestedBack}`;
  const fallback = pageBackFallbacks[pageKey];
  return fallback ? `../index.html#${fallback}` : "../index.html";
}

function setBackLinks(pageKey = "") {
  document.querySelectorAll("[data-back-label]").forEach((node) => {
    node.href = resolveBackHref(pageKey);
  });
}

function renderSections(page) {
  const node = document.querySelector("[data-page-sections]");
  if (!node) return;
  node.innerHTML = (page.sections || []).map((section) => `
    <section class="statute-section"${section.id ? ` id="${escapeHtml(section.id)}"` : ""}>
      <h2>${escapeHtml(section.heading || "")}</h2>
      ${(section.paragraphs || []).map(renderPlainParagraph).join("")}
      ${(section.blocks || []).map(renderBlock).join("")}
    </section>
  `).join("");
}

function renderPlainParagraph(value = "") {
  return `<p>${escapeHtml(value)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/(?:\r\n|\r|\n)/g, "<br>")}</p>`;
}

function renderBlock(block) {
  if (!block) return "";
  if (typeof block === "string") return renderPlainParagraph(block);
  if (block.type === "address") return `<address>${(block.lines || []).map(escapeHtml).join("<br>")}</address>`;
  if (block.type === "html") return sanitizeRichHtml(block.value || "");
  if (block.type === "paragraph") return `<p>${sanitizeRichHtml(block.value || "")}</p>`;
  if (block.type === "buttonLink") {
    return `<p class="document-action"><a class="button${block.variant === "ghost" ? " button--ghost" : ""}" href="${escapeHtml(safeHref(block.href) || "#")}">${escapeHtml(block.label || "")}</a></p>`;
  }
  if (block.type === "pdfPreview") {
    return `
      <div class="pdf-preview">
        <div class="pdf-preview__header">
          <div>
          <span>${escapeHtml(block.label || "")}</span>
          <h3>${escapeHtml(block.title || "")}</h3>
          </div>
          <a class="text-link" href="${escapeHtml(safeAsset(block.src) || "#")}" target="_blank" rel="noreferrer">${escapeHtml(block.linkLabel || "Open PDF")}</a>
        </div>
          <iframe src="${escapeHtml(safeAsset(block.src))}" title="${escapeHtml(block.title || "PDF preview")}" loading="lazy"></iframe>
      </div>
    `;
  }
  if (block.type === "orderedList" || block.type === "unorderedList") {
    const tag = block.type === "orderedList" ? "ol" : "ul";
    return `<${tag}>${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
  }
  return "";
}

function renderDocumentPage(page, pageKey = "") {
  const main = document.querySelector("[data-document-page]");
  const layout = document.querySelector(".statute-layout");
  const toc = document.querySelector("[data-page-toc]");
  const tocList = document.querySelector("[data-page-toc-list]");

  setText("[data-page-signal]", page.hero?.signal || page.signal || "");
  setText("[data-page-title]", page.hero?.title || page.title);
  setText("[data-page-description]", page.hero?.description || page.description);
  setText("[data-page-toc-title]", page.tocTitle || "Contents");
  setAttr("[data-page-toc]", "aria-label", page.tocAriaLabel || page.tocTitle || "Table of contents");

  const sections = page.sections || [];
  const hasToc = Boolean(page.showToc && sections.some((section) => section.id));
  const hasFixedToc = hasToc && fixedTocPages.has(pageKey);
  if (main) {
    main.classList.toggle("legal-page--wide", page.layout === "document");
    main.classList.toggle("statute-page", page.layout === "document");
    main.classList.toggle("statute-page--fixed-toc", hasFixedToc);
  }
  if (layout) layout.classList.toggle("statute-layout--single", !hasToc);
  if (toc) toc.hidden = !hasToc;
  if (tocList) {
    tocList.innerHTML = hasToc
      ? sections
        .filter((section) => section.id)
        .map((section) => `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(section.tocLabel || section.heading || "")}</a></li>`)
        .join("")
      : "";
  }

  renderSections(page);
  setupStatuteTocDisclosure(toc, hasFixedToc, page.tocTitle || "Contents");
  setupStatuteTocBounds(hasFixedToc);
}

function setupStatuteTocDisclosure(toc, enabled, label = "Contents") {
  cleanupStatuteTocDisclosure();
  cleanupStatuteTocDisclosure = () => {};

  if (!toc || !enabled) {
    toc?.querySelector("[data-toc-toggle]")?.remove();
    toc?.removeAttribute("data-toc-disclosure");
    toc?.removeAttribute("data-toc-open");
    return;
  }

  const list = toc.querySelector("[data-page-toc-list]");
  if (!list) return;

  toc.dataset.tocDisclosure = "";
  toc.id ||= "document-toc";
  list.id ||= `${toc.id}-list`;

  let button = toc.querySelector("[data-toc-toggle]");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "statute-toc__toggle";
    button.dataset.tocToggle = "";
    button.innerHTML = `
      <span data-toc-toggle-label></span>
      <span class="statute-toc__chevron" aria-hidden="true"></span>
    `;
    toc.prepend(button);
  }

  const media = window.matchMedia("(max-width: 980px)");
  let pointerScrollTop = 0;
  const setOpen = (open, options = {}) => {
    const shouldRestoreScroll = Boolean(media.matches && options.preserveScroll);
    const scrollTop = shouldRestoreScroll ? pointerScrollTop : window.scrollY;
    const nextOpen = media.matches ? open : true;
    toc.dataset.tocOpen = String(nextOpen);
    button.setAttribute("aria-expanded", String(nextOpen));
    pointerScrollTop = 0;
    if (shouldRestoreScroll) {
      const restoreScroll = () => window.scrollTo(0, scrollTop);
      restoreScroll();
      window.requestAnimationFrame(() => {
        restoreScroll();
        window.requestAnimationFrame(restoreScroll);
      });
      let restoreCount = 0;
      const restoreTimer = window.setInterval(() => {
        restoreScroll();
        restoreCount += 1;
        if (restoreCount >= 5) window.clearInterval(restoreTimer);
      }, 40);
    }
  };
  const handleToggle = (event) => {
    event.preventDefault();
    if (!pointerScrollTop) pointerScrollTop = window.scrollY;
    setOpen(toc.dataset.tocOpen !== "true", { preserveScroll: true });
  };
  const handlePointerDown = (event) => {
    if (!media.matches) return;
    pointerScrollTop = window.scrollY;
    event.preventDefault();
  };
  const handleResize = () => setOpen(!media.matches);
  const handleListClick = (event) => {
    if (media.matches && event.target.closest("a")) setOpen(false);
  };

  button.querySelector("[data-toc-toggle-label]").textContent = label;
  button.setAttribute("aria-controls", list.id);
  button.setAttribute("aria-label", label);
  button.addEventListener("pointerdown", handlePointerDown);
  button.addEventListener("mousedown", handlePointerDown);
  button.addEventListener("touchstart", handlePointerDown, { passive: false });
  button.addEventListener("click", handleToggle);
  list.addEventListener("click", handleListClick);
  media.addEventListener("change", handleResize);
  setOpen(!media.matches);

  cleanupStatuteTocDisclosure = () => {
    button.removeEventListener("pointerdown", handlePointerDown);
    button.removeEventListener("mousedown", handlePointerDown);
    button.removeEventListener("touchstart", handlePointerDown);
    button.removeEventListener("click", handleToggle);
    list.removeEventListener("click", handleListClick);
    media.removeEventListener("change", handleResize);
  };
}

function setupStatuteTocBounds(enabled) {
  cleanupStatuteTocBounds();
  cleanupStatuteTocBounds = () => {};

  const toc = document.querySelector("[data-page-toc]");
  if (!enabled || !toc) {
    toc?.removeAttribute("data-toc-pin");
    toc?.style.removeProperty("--toc-anchor-top");
    return;
  }

  const layout = document.querySelector(".statute-layout");
  const documentNode = document.querySelector("[data-page-sections]");
  let frame = 0;
  let resizeObserver;

  const update = () => {
    frame = 0;
    const sections = Array.from(documentNode?.querySelectorAll(".statute-section") || []);
    const firstSection = sections[0];
    const lastSection = sections.at(-1);
    if (!layout || !firstSection || !lastSection) return;

    const fixedTop = window.matchMedia("(min-width: 981px)").matches ? 96 : 80;
    const layoutTop = layout.getBoundingClientRect().top + window.scrollY;
    const lastBottom = lastSection.getBoundingClientRect().bottom + window.scrollY;
    const tocHeight = toc.offsetHeight;
    const startTop = layoutTop;
    const endTop = Math.max(startTop, lastBottom - tocHeight);
    const desiredTop = window.scrollY + fixedTop;
    const anchoredTop = Math.min(Math.max(desiredTop, startTop), endTop);

    toc.dataset.tocPin = desiredTop <= startTop
      ? "before"
      : desiredTop >= endTop
        ? "after"
        : "fixed";
    toc.style.setProperty("--toc-anchor-top", `${Math.max(0, anchoredTop - layoutTop)}px`);
  };

  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(toc);
  }
  document.fonts?.ready.then(schedule).catch(() => {});
  schedule();

  cleanupStatuteTocBounds = () => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    resizeObserver?.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
    toc.removeAttribute("data-toc-pin");
    toc.style.removeProperty("--toc-anchor-top");
  };
}

function renderMembership(page, site = {}) {
  const form = page.form || {};
  setText("[data-page-signal]", page.hero?.signal);
  setText("[data-page-title]", page.hero?.title);
  setText("[data-page-description]", page.hero?.description);
  setHtml("[data-membership-copy]", sanitizeRichHtml(page.introHtml || ""));
  setText("[data-form-title]", form.title);
  setText("[data-form-description]", form.description);
  setText("[data-form-submit]", form.submitLabel);
  setHtml("[data-form-note]", sanitizeRichHtml(form.privacyNote));
  setText("[data-thanks-title]", form.thanksTitle);
  setHtml("[data-thanks-text]", sanitizeRichHtml(form.thanksText));
  setAttr("[data-form-subject]", "value", form.subject || page.title || "Membership application");
  setAttr("[data-form-source]", "value", form.source || window.location.pathname);

  const info = document.querySelector("[data-info-cards]");
  if (info) {
    info.innerHTML = (page.infoCards || []).map((card) => `
      <article>
        <h2>${escapeHtml(card.title || "")}</h2>
        <p>${escapeHtml(card.description || "")}</p>
      </article>
    `).join("");
  }

  Object.entries(form.labels || {}).forEach(([key, value]) => {
    setText(`[data-label="${key}"]`, value);
    setAttr(`[data-placeholder="${key}"]`, "placeholder", value);
  });

  const membershipOptions = document.querySelector("[data-membership-options]");
  if (membershipOptions) {
    const optionNodes = Array.from(membershipOptions.querySelectorAll(".choice"));
    (form.membershipOptions || []).forEach((option, index) => {
      const node = optionNodes[index];
      if (!node) return;
      const input = node.querySelector("input");
      const label = node.querySelector("[data-option-label]");
      if (input) input.value = option.value;
      if (label) label.textContent = option.label;
    });
  }

  const membershipSelect = document.querySelector("[data-membership-select]");
  if (membershipSelect) {
    membershipSelect.innerHTML = (form.membershipOptions || []).map((option, index) => (
      `<option value="${escapeHtml(option.value || "")}"${index === 0 ? " selected" : ""}>${escapeHtml(option.label || "")}</option>`
    )).join("");
  }

  const consents = document.querySelector("[data-consents]");
  if (consents) {
    const consentNodes = Array.from(consents.querySelectorAll("[data-consent-block]"));
    (form.consents || []).forEach((consent, index) => {
      const node = consentNodes[index];
      if (!node) return;
      const input = node.querySelector("input");
      const label = node.querySelector("[data-consent-label]");
      const title = node.querySelector("[data-consent-title]");
      const description = node.querySelector("[data-consent-description]");
      if (input) {
        input.name = consent.name;
        input.required = Boolean(consent.required);
      }
      if (label) label.textContent = consent.label;
      if (title) title.textContent = consent.title || "";
      if (description) description.textContent = consent.description || "";
    });
  }

  const membershipForm = document.querySelector("[data-membership-form]");
  const captchaError = document.querySelector("[data-captcha-error]");
  const captchaState = configureCaptcha(document, resolveCaptchaConfig(site, form));
  initMembershipSubmit(membershipForm, {
    captchaError,
    captchaState,
    successMessage: form.thanksText || "Message was sent.",
    errorMessage: form.errorMessage || "Message could not be sent.",
    invalidMessage: form.invalidMessage || "Please check the marked fields.",
    captchaMessage: form.captchaMessage || "Please complete the captcha.",
    unreachableMessage: form.unreachableMessage || "Server is not reachable. Please try again later."
  });
}

function initMembershipSubmit(form, options = {}) {
  if (!form) return;
  form.action = "/api/contact";
  form.method = "post";
  form.noValidate = true;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMembershipStatus(form);

    if (!validateRequiredFields(form)) {
      renderMembershipStatus(form, options.invalidMessage, "error");
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    if (options.captchaState?.enabled && !validateMembershipCaptcha(options.captchaState, options.captchaError)) {
      renderMembershipStatus(form, options.captchaMessage, "error");
      options.captchaState.element?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(new FormData(form))
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        renderMembershipStatus(form, result.errors?.server || options.errorMessage, "error");
        return;
      }

      form.reset();
      resetCaptcha(options.captchaState?.provider);
      renderMembershipStatus(form, options.successMessage, "success");
    } catch (error) {
      renderMembershipStatus(form, options.unreachableMessage, "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

function validateMembershipCaptcha(captchaState, captchaError) {
  const response = captchaTokenValue(captchaState?.provider);
  const valid = Boolean(response.trim());
  if (captchaError) captchaError.hidden = valid;
  return valid;
}

function validateRequiredFields(form) {
  return Array.from(form.elements).every((field) => {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return true;
    if (field.type === "hidden" || field.type === "submit" || field.disabled) return true;
    let valid = true;
    if (field.required) {
      valid = field.type === "checkbox" ? field.checked : Boolean(field.value.trim());
    }
    if (valid && field.type === "email" && field.value) valid = field.validity.valid;
    field.setAttribute("aria-invalid", valid ? "false" : "true");
    return valid;
  });
}

function clearMembershipStatus(form) {
  form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.setAttribute("aria-invalid", "false"));
  const status = form.querySelector("[data-form-status]");
  if (status) {
    status.textContent = "";
    status.removeAttribute("role");
    status.classList.remove("form-status--error", "form-status--success");
  }
}

function renderMembershipStatus(form, message, type) {
  const status = form.querySelector("[data-form-status]");
  if (!status) return;
  status.textContent = message;
  status.setAttribute("role", type === "error" ? "alert" : "status");
  status.classList.toggle("form-status--error", type === "error");
  status.classList.toggle("form-status--success", type === "success");
}

async function boot() {
  const pageKey = document.body.dataset.page;
  const [site, pages] = await Promise.all([
    loadMergedJson(defaultSitePath, localSitePath),
    loadMergedJson(defaultPagesPath, localPagesPath)
  ]);
  const normalizedPages = normalizePageAliases(pages);
  const page = normalizedPages[pageKey] || {};

  applyTheme(site.theme);
  document.title = `${page.title || site.name} | ${site.name}`;
  setAttr('meta[name="description"]', "content", page.description || site.description);
  setAttr("[data-favicon]", "href", site.images?.logo);
  setText("[data-back-label]", page.backLabel || "Back");
  setBackLinks(pageKey);

  if (pageKey === "membership") {
    renderMembership(page, site);
  } else {
    renderDocumentPage(page, pageKey);
  }

  initAnimations();
}

boot().catch(console.warn);

function normalizePageAliases(pages = {}) {
  const normalized = { ...pages };
  Object.entries(pageAliases).forEach(([canonical, aliases]) => {
    aliases.forEach((alias) => {
      if (pages[alias]) normalized[canonical] = mergePageData(normalized[canonical] || {}, pages[alias]);
    });
  });
  return normalized;
}

function mergePageData(base, override) {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;
  const merged = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    merged[key] = key in merged ? mergePageData(merged[key], value) : value;
  });
  return merged;
}
