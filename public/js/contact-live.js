const BACK_TARGETS = new Map([
  ["hero", "../index.html#hero"],
  ["events", "../index.html#events"],
  ["culture", "../index.html#culture"],
  ["membership", "../index.html#membership"],
  ["contact", "../index.html#contact"],
  ["gallery", "../index.html#gallery"],
  ["instagram", "../index.html#instagram"]
]);

let contactFormCopy = {
  successMessage: "Message was sent.",
  errorMessage: "Message could not be sent.",
  invalidMessage: "Please check the marked fields.",
  unreachableMessage: "Server is not reachable. Please try again later.",
  validation: {
    name: "Please enter a name.",
    email: "Please enter a valid email address.",
    message: "Please enter a message.",
    privacy: "Please accept the privacy policy."
  }
};

document.addEventListener("DOMContentLoaded", () => {
  boot().catch(console.warn);
});

async function boot() {
  await applySiteContent();
  applyBackLinks();
  prefillSubject();
  enhanceForms();
}

async function applySiteContent() {
  const site = await loadMergedJson(defaultSitePath, localSitePath);
  contactFormCopy = {
    ...contactFormCopy,
    ...site.contactForm,
    validation: {
      ...contactFormCopy.validation,
      ...site.contactForm?.validation
    }
  };
  document.title = `${contactFormCopy.title || "Contact"} | ${site.name || "Website"}`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", contactFormCopy.description || site.description || "");
  const favicon = document.querySelector("[data-favicon]");
  if (favicon && safeAsset(site.images?.logo)) favicon.href = safeAsset(site.images.logo);
  document.querySelectorAll("[data-contact-email]").forEach((link) => {
    const email = String(site.email || "hello@example.org").trim();
    link.textContent = email;
    link.href = safeHref(`mailto:${email}`, { mailto: true }) || "#";
  });
  configureCaptcha(document, resolveCaptchaConfig(site));
  applyContactFormCopy(contactFormCopy);
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
}

function applyBackLinks() {
  const params = new URLSearchParams(window.location.search);
  const back = params.get("back");
  const href = BACK_TARGETS.get(back);
  if (!href) return;

  document.querySelectorAll("[data-back-label]").forEach((link) => {
    link.href = href;
  });
}

function prefillSubject() {
  const params = new URLSearchParams(window.location.search);
  const subject = params.get("subject") || params.get("betreff");
  if (!subject) return;

  const input = document.querySelector('[name="subject"], #subject, [name="betreff"], #betreff');
  if (input && !input.value) input.value = subject;
}

function enhanceForms() {
  document.querySelectorAll("form").forEach((form) => {
    if (!looksLikeContactForm(form)) return;

    form.method = "post";
    form.action = "/api/contact";
    form.noValidate = true;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFormState(form);

      const validation = validateForm(form);
      if (!validation.valid) {
        renderMessage(form, contactFormCopy.invalidMessage, "error");
        return;
      }

      const submit = form.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;

      try {
        const body = new URLSearchParams(new FormData(form));
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.ok) {
          renderMessage(form, result.errors?.server || contactFormCopy.errorMessage, "error");
          return;
        }

        form.reset();
        prefillSubject();
        renderMessage(form, contactFormCopy.successMessage, "success");
      } catch (error) {
        renderMessage(form, contactFormCopy.unreachableMessage, "error");
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });
}

function looksLikeContactForm(form) {
  const names = [...form.elements].map((element) => element.name || element.id).join(" ").toLowerCase();
  return /email|e-mail|mail/.test(names) && /message|nachricht|text/.test(names);
}

function validateForm(form) {
  const errors = [];
  const email = findField(form, ["email", "mail", "e-mail"]);
  const name = findField(form, ["name", "fullName", "vorname", "nachname"]);
  const message = findField(form, ["message", "nachricht", "text"]);
  const privacy = findField(form, ["privacy", "datenschutz", "consent", "acceptPrivacy"]);

  if (name && !name.value.trim()) errors.push(markInvalid(name, contactFormCopy.validation.name));
  if (message && !message.value.trim()) errors.push(markInvalid(message, contactFormCopy.validation.message));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    errors.push(markInvalid(email, contactFormCopy.validation.email));
  }
  if (privacy && privacy.type === "checkbox" && !privacy.checked) {
    errors.push(markInvalid(privacy, contactFormCopy.validation.privacy));
  }

  return { valid: errors.length === 0, errors };
}

function findField(form, names) {
  for (const name of names) {
    const exact = form.querySelector(`[name="${name}"], #${name}`);
    if (exact) return exact;
  }

  return [...form.elements].find((element) => {
    const key = `${element.name || ""} ${element.id || ""}`.toLowerCase();
    return names.some((name) => key.includes(name.toLowerCase()));
  });
}

function markInvalid(field, message) {
  field.setAttribute("aria-invalid", "true");
  const error = document.createElement("p");
  error.className = "form-error";
  error.textContent = message;
  field.insertAdjacentElement("afterend", error);
  return message;
}

function clearFormState(form) {
  form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
  form.querySelectorAll(".form-error, .form-status").forEach((node) => node.remove());
}

function renderMessage(form, message, type) {
  const node = document.createElement("p");
  node.className = `form-status form-status--${type}`;
  node.setAttribute("role", type === "error" ? "alert" : "status");
  node.textContent = message;
  form.append(node);
}
import { loadMergedJson } from "./data.js";
import { configureCaptcha, resolveCaptchaConfig } from "./captcha.js";
import { safeAsset, safeHref, sanitizeRichHtml } from "./security.js";

const defaultSitePath = new URL("../data/site.default.json", import.meta.url);
const localSitePath = new URL("../data/site.local.json", import.meta.url);
