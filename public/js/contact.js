import { initAnimations } from "./animations.js";
import { configureCaptcha, resolveCaptchaConfig } from "./captcha.js";
import { loadMergedJson } from "./data.js";
import { safeAsset, safeHref, sanitizeRichHtml } from "./security.js";
import { applyTheme } from "./theme.js";

const defaultSitePath = new URL("../data/site.default.json", import.meta.url);
const localSitePath = new URL("../data/site.local.json", import.meta.url);

let messages = {
  name: "Please enter your name.",
  email: "Please enter a valid email address.",
  subject: "Please enter a subject.",
  betreff: "Please enter a subject.",
  message: "Please write a short message.",
  nachricht: "Please write a short message.",
  privacy: "Please confirm the privacy policy.",
  datenschutz_akzeptiert: "Please confirm the privacy policy."
};
let contactFormCopy = {
  invalidMessage: "Please check the marked fields."
};
const allowedBackSections = new Set(["hero", "events", "culture", "membership", "contact", "gallery", "instagram"]);

function initBackLink() {
  const requestedBack = new URLSearchParams(window.location.search).get("back");
  const section = allowedBackSections.has(requestedBack) ? requestedBack : "contact";
  document.querySelectorAll("[data-back-label]").forEach((node) => {
    node.href = `../index.html#${section}`;
  });
}

function applySiteContent(site = {}) {
  const formCopy = site.contactForm || {};
  contactFormCopy = { ...contactFormCopy, ...formCopy };
  messages = {
    ...messages,
    ...formCopy.validation,
    betreff: formCopy.validation?.subject || messages.betreff,
    nachricht: formCopy.validation?.message || messages.nachricht,
    datenschutz_akzeptiert: formCopy.validation?.privacy || messages.datenschutz_akzeptiert
  };

  document.title = `${formCopy.title || "Contact"} | ${site.name || "Website"}`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", formCopy.description || site.description || "");
  const favicon = document.querySelector("[data-favicon]");
  if (favicon && safeAsset(site.images?.logo)) favicon.href = safeAsset(site.images.logo);
  document.querySelectorAll("[data-contact-email]").forEach((link) => {
    const email = String(site.email || "hello@example.org").trim();
    link.textContent = email;
    link.href = safeHref(`mailto:${email}`, { mailto: true }) || "#";
  });
  configureCaptcha(document, resolveCaptchaConfig(site));
  applyContactFormCopy(formCopy);
}

function applyContactFormCopy(formCopy = {}) {
  document.querySelectorAll("[data-contact-text]").forEach((node) => {
    const key = node.dataset.contactText;
    if (key && formCopy[key]) node.textContent = formCopy[key];
  });

  document.querySelectorAll("[data-contact-label]").forEach((node) => {
    const key = node.dataset.contactLabel;
    const value = formCopy.labels?.[key];
    if (!key || !value) return;
    if (key === "privacy") {
      node.innerHTML = sanitizeRichHtml(value);
    } else {
      node.textContent = value;
    }
  });

  Object.entries({
    name: "name",
    email: "email",
    subject: "subject",
    message: "message",
    privacy: "privacy"
  }).forEach(([field, key]) => {
    const error = document.querySelector(`[data-error-for="${field}"]`);
    const value = formCopy.validation?.[key];
    if (error && value) error.textContent = value;
  });
}

function setError(input, message = "") {
  const form = input.closest("form");
  const error = form?.querySelector(`[data-error-for="${input.name}"]`);
  input.setAttribute("aria-invalid", message ? "true" : "false");
  input.setCustomValidity(message);
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
}

function validateInput(input) {
  let message = "";
  if (input.required) {
    if (input.type === "checkbox" && !input.checked) message = messages[input.name] || messages.genericConfirm || "Please confirm this field.";
    if (input.type !== "checkbox" && !input.value.trim()) message = messages[input.name] || messages.genericRequired || "Please fill out this field.";
  }
  if (!message && input.type === "email" && input.value && !input.validity.valid) {
    message = messages.email;
  }
  setError(input, message);
  return !message;
}

function initContactForm() {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const subject = form.querySelector("[data-subject-input]");
  const params = new URLSearchParams(window.location.search);
  const subjectValue = params.get("subject") || params.get("betreff");
  if (subject && subjectValue) subject.value = subjectValue;

  const inputs = Array.from(form.querySelectorAll("input, textarea"));
  inputs.forEach((input) => {
    input.addEventListener("input", () => validateInput(input));
    input.addEventListener("change", () => validateInput(input));
  });

  form.addEventListener("submit", (event) => {
    const valid = inputs.every(validateInput);
    const status = form.querySelector("[data-form-status]");
    if (!valid) {
      event.preventDefault();
      status.textContent = contactFormCopy.invalidMessage || "Please check the marked fields.";
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      firstInvalid?.focus();
      return;
    }
    status.textContent = "";
  });
}

async function boot() {
  const site = await loadMergedJson(defaultSitePath, localSitePath);
  applyTheme(site.theme);
  applySiteContent(site);
  initBackLink();
  initContactForm();
  initAnimations();
}

boot().catch(console.warn);
