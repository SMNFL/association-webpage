import "dotenv/config";
import express from "express";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { handleContactRequest } from "./api/contact.js";
import { handleInstagramRequest } from "./api/instagram.js";
import { assertMailEnv, createTransportFromEnv } from "./mailer.js";
import { createEditorRouter } from "./editor/router.js";
import { assertEditorSecurityEnv } from "./security/editor-auth.js";
import { securityHeaders } from "./security/headers.js";
import { createMemoryRateLimiter } from "./security/rate-limit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const app = express();
const port = Number(process.env.PORT || 8080);
const editorMode = process.env.EDITOR_MODE === "1";
if (editorMode) assertEditorSecurityEnv();

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 40 }));
if (editorMode) app.use("/api/editor/media/upload", express.json({ limit: "12mb" }));
app.use(express.json({ limit: "256kb" }));

if (editorMode) {
  app.use(createEditorRouter(rootDir));
}

app.get("/healthz", (req, res) => {
  res.status(200).json({ ok: true, service: "website-template", timestamp: new Date().toISOString() });
});

app.get(["/api/instagram-feed", "/.netlify/functions/instagram-feed"], handleInstagramRequest);

app.get(["/pages/contact.html", "/pages/membership.html"], async (req, res, next) => {
  try {
    const filePath = path.join(publicDir, req.path);
    const html = await readFile(filePath, "utf8");
    res.type("html").send(enhanceFormPage(html));
  } catch (error) {
    next();
  }
});

app.get([
  "/data/site.default.json",
  "/data/site.local.json",
  "/data/pages.default.json",
  "/data/pages.local.json"
], async (req, res, next) => {
  try {
    const filePath = path.join(publicDir, req.path);
    const data = JSON.parse(await readFile(filePath, "utf8"));
    res.type("json").send(JSON.stringify(applyRuntimePublicConfig(data, req.path)));
  } catch (error) {
    next(error);
  }
});

const contactLimiter = createMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many requests. Please try again later."
});

app.post("/api/contact", contactLimiter, async (req, res, next) => {
  try {
    assertMailEnv();
    await handleContactRequest(req, res, {
      transport: createTransportFromEnv(),
      mailOptions: {
        to: process.env.CONTACT_TO,
        from: process.env.SMTP_FROM || process.env.SMTP_USER
      },
      verifyCaptcha: verifyHCaptcha
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/pages/contact.html", "/pages/membership.html", "/contact", "/membership"], contactLimiter, async (req, res, next) => {
  try {
    assertMailEnv();
    const payload = {
      ...req.body,
      name: req.body.name
        || [req.body["given-name"], req.body["family-name"]].filter(Boolean).join(" ")
        || [req.body.vorname, req.body.nachname].filter(Boolean).join(" "),
      message: req.body.message || req.body.nachricht || req.body.motivation,
      subject: req.body.subject || req.body.betreff || inferSubjectFromPath(req.path),
      privacy: req.body.privacy
        || req.body.datenschutz
        || req.body.datenschutz_akzeptiert
        || req.body.datenverarbeitung
        || req.body.data_processing
        || req.body.consent,
      source: req.path
    };

    await handleContactRequest({ ...req, body: payload }, {
      status(code) {
        res.status(code);
        return this;
      },
      async json(body) {
        const messages = await loadFormMessages(req.path);
        if (body.ok) {
          return res.type("html").send(successHtml(messages));
        }
        return res.status(res.statusCode || 400).type("html").send(errorHtml(body.errors, messages));
      }
    }, {
      transport: createTransportFromEnv(),
      mailOptions: {
        to: process.env.CONTACT_TO,
        from: process.env.SMTP_FROM || process.env.SMTP_USER
      },
      verifyCaptcha: verifyHCaptcha
    });
  } catch (error) {
    next(error);
  }
});

app.get("/js/contact.js", (req, res, next) => {
  sendFileOnlyNextOnError(res, next, path.join(publicDir, "js", "contact-live.js"));
});

app.use(express.static(publicDir, {
  extensions: ["html"]
}));

app.use((req, res) => {
  res.status(404).type("html").send("<h1>404</h1><p>Page not found.</p>");
});

app.use(handleServerError);

export function sendFileOnlyNextOnError(res, next, filePath) {
  res.sendFile(filePath, (error) => {
    if (error) next(error);
  });
}

export function handleServerError(error, req, res, next) {
  if (res.headersSent) return next(error);
  const missingMailConfiguration = isMissingMailConfiguration(error);
  const smtpAuthError = isSmtpAuthError(error);
  if (!missingMailConfiguration && !smtpAuthError) console.error(error);
  const status = missingMailConfiguration || smtpAuthError ? 503 : 500;
  return res.status(status).json({
    ok: false,
    errors: {
      server: smtpAuthError
        ? "SMTP login failed. Check SMTP_USER and SMTP_PASS; Gmail requires an App Password, not the normal Google account password."
        : process.env.NODE_ENV === "production"
        ? "Server error. Please try again later."
      : error.message
    }
  });
}

function isMissingMailConfiguration(error) {
  return error.message?.startsWith("Missing mail configuration");
}

function isSmtpAuthError(error) {
  return error.code === "EAUTH" || error.responseCode === 535;
}

if (process.env.NODE_ENV !== "test") {
  const host = process.env.HOST || (editorMode ? "127.0.0.1" : undefined);
  app.listen(port, host, () => {
    console.log(`Website server listening on http://${host || "localhost"}:${port}`);
  });
}

export default app;

async function verifyHCaptcha(token, remoteIp) {
  if (!process.env.HCAPTCHA_SECRET) return true;
  if (!token) return false;

  const body = new URLSearchParams({
    secret: process.env.HCAPTCHA_SECRET,
    response: token
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetchWithTimeout("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  }, 8000);

  if (!response.ok) return false;
  const result = await response.json();
  return Boolean(result.success);
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function inferSubjectFromPath(pathname) {
  return pathname.includes("membership") ? "Membership application" : "Contact";
}

export function applyRuntimePublicConfig(data, pathname) {
  const hcaptchaSiteKey = String(process.env.HCAPTCHA_SITE_KEY || "").trim();
  if (!hcaptchaSiteKey) return data;

  if (pathname.endsWith("/site.default.json") || pathname.endsWith("/site.local.json")) {
    return {
      ...data,
      hcaptchaSiteKey
    };
  }

  if (pathname.endsWith("/pages.default.json") || pathname.endsWith("/pages.local.json")) {
    return {
      ...data,
      membership: {
        ...data.membership,
        ...data.mitglied,
        form: {
          ...data.membership?.form,
          ...data.mitglied?.form,
          hcaptchaSiteKey
        }
      }
    };
  }

  return data;
}

function enhanceFormPage(html) {
  let output = html.replace(/<form\b([^>]*)>/i, (match, attrs) => {
    let nextAttrs = attrs
      .replace(/\saction=(["']).*?\1/i, "")
      .replace(/\smethod=(["']).*?\1/i, "");
    return `<form${nextAttrs} method="post" action="/api/contact">`;
  });

  if (!/\/js\/contact\.js/.test(output)) {
    output = output.replace("</body>", '<script type="module" src="../js/contact.js"></script></body>');
  }

  return output;
}

async function loadFormMessages(pathname = "") {
  if (pathname.includes("membership")) {
    const pages = await loadMergedPublicJson("pages.default.json", "pages.local.json");
    const form = {
      ...pages.membership?.form,
      ...pages.mitglied?.form
    };
    return {
      htmlLang: "en",
      successTitle: form.thanksTitle || form.thanksText || "Message sent",
      successMessage: form.thanksText || "Message was sent.",
      successBody: form.privacyNote || "Thank you. We will get back to you as soon as possible.",
      errorTitle: form.errorTitle || form.errorMessage || "Message not sent",
      errorMessage: form.errorMessage || "Message could not be sent.",
      backLabel: form.backLabel || "Back to the form",
      backHref: "/pages/membership.html"
    };
  }

  const site = await loadMergedPublicJson("site.default.json", "site.local.json");
  const form = site.contactForm || {};
  return {
    htmlLang: site.language || "en",
    successTitle: form.successTitle || form.successMessage || "Message sent",
    successMessage: form.successMessage || "Message was sent.",
    successBody: form.thanksText || "Thank you. We will get back to you as soon as possible.",
    errorTitle: form.errorTitle || form.errorMessage || "Message not sent",
    errorMessage: form.errorMessage || "Message could not be sent.",
    backLabel: form.backLabel || "Back to the form",
    backHref: "/pages/contact.html"
  };
}

async function loadMergedPublicJson(defaultName, localName) {
  const base = await readPublicJson(defaultName, {});
  const local = await readPublicJson(localName, {});
  return mergeData(base, local);
}

async function readPublicJson(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(publicDir, "data", name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function mergeData(base, override) {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;

  const merged = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    merged[key] = key in merged ? mergeData(merged[key], value) : value;
  });
  return merged;
}

function successHtml(messages = {}) {
  return `
    <!doctype html>
    <html lang="${escapeHtml(messages.htmlLang || "en")}">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(messages.successTitle || "Message sent")}</title></head>
      <body>
        <main>
          <h1>${escapeHtml(messages.successMessage || "Message was sent.")}</h1>
          <p>${escapeHtml(messages.successBody || "Thank you. We will get back to you as soon as possible.")}</p>
          <p><a href="${escapeHtml(messages.backHref || "/")}">${escapeHtml(messages.backLabel || "Back to homepage")}</a></p>
        </main>
      </body>
    </html>
  `;
}

function errorHtml(errors = {}, messages = {}) {
  return `
    <!doctype html>
    <html lang="${escapeHtml(messages.htmlLang || "en")}">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(messages.errorTitle || "Message not sent")}</title></head>
      <body>
        <main>
          <h1>${escapeHtml(messages.errorMessage || "Message could not be sent.")}</h1>
          <pre>${escapeHtml(JSON.stringify(errors, null, 2))}</pre>
          <p><a href="${escapeHtml(messages.backHref || "/pages/contact.html")}">${escapeHtml(messages.backLabel || "Back to the form")}</a></p>
        </main>
      </body>
    </html>
  `;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
