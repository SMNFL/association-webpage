import "dotenv/config";
import express from "express";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadMergedPublicJson, readPublicJsonSync } from "./public-data.js";
import { createPublicPagesRouter } from "./public-pages.js";
import { handleContactRequest } from "./api/contact.js";
import { createInstagramFeedService, createInstagramHandler, resolveInstagramUsername } from "./api/instagram.js";
import { assertMailEnv, createTransportFromEnv } from "./mailer.js";
import { createEditorRouter } from "./editor/router.js";
import { assertEditorSecurityEnv } from "./security/editor-auth.js";
import { securityHeaders } from "./security/headers.js";
import { createMemoryRateLimiter } from "./security/rate-limit.js";
import { securityLog } from "./security/logging.js";
import { configureTrustProxy, parseTrustProxy, sameOriginOrReferer } from "./security/request-policy.js";
import { createCaptchaProvider } from "./security/captcha.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const app = express();
const port = Number(process.env.PORT || 8080);
const editorMode = process.env.EDITOR_MODE === "1";
const captchaProvider = process.env.NODE_ENV === "test"
  ? createCaptchaProvider({ CAPTCHA_PROVIDER: "none" })
  : createCaptchaProvider(process.env);
configureTrustProxy(app);
if (editorMode) assertEditorSecurityEnv();
if (process.env.NODE_ENV === "production") assertProductionSecurityEnv();

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 40 }));
if (editorMode) app.use("/api/editor/media/upload", express.json({ limit: "12mb" }));
app.use(express.json({ limit: "256kb" }));

if (editorMode) {
  app.use(createEditorRouter(rootDir));
}

app.get("/healthz", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({ ok: true });
});

app.use(createPublicPagesRouter({ publicDir }));

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

const instagramLimiter = createMemoryRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many requests. Please try again later.",
  onLimit: (req) => securityLog("instagram_rate_limited", req)
});

const instagramService = createInstagramFeedService({
  username: resolveInstagramUsername({
    env: process.env,
    configs: [readPublicJsonSync(publicDir, "site.local.json"), readPublicJsonSync(publicDir, "site.default.json")]
  }),
  onRefreshError: (error) => console.error(JSON.stringify({
    level: "error",
    event: "instagram_feed_refresh_failed",
    at: new Date().toISOString(),
    message: String(error?.message || error).slice(0, 2000)
  }))
});

app.get(["/api/instagram-feed", "/.netlify/functions/instagram-feed"], instagramLimiter, createInstagramHandler(instagramService));

const contactLimiter = createMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many requests. Please try again later.",
  onLimit: (req) => securityLog("contact_rate_limited", req)
});

app.post("/api/contact", contactLimiter, requireProductionSameOrigin, async (req, res, next) => {
  try {
    assertMailEnv();
    await handleContactRequest(req, res, {
      transport: createTransportFromEnv(),
      mailOptions: {
        to: process.env.CONTACT_TO,
        from: process.env.SMTP_FROM || process.env.SMTP_USER
      },
      captchaProvider,
      onCaptchaError: logCaptchaError
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/pages/contact.html", "/pages/membership.html", "/contact", "/membership"], contactLimiter, requireProductionSameOrigin, async (req, res, next) => {
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
      captchaProvider,
      onCaptchaError: logCaptchaError
    });
  } catch (error) {
    next(error);
  }
});

app.get("/js/contact.js", (req, res, next) => {
  sendFileOnlyNextOnError(res, next, path.join(publicDir, "js", "contact-live.js"));
});

app.use(express.static(publicDir, {
  extensions: ["html"],
  setHeaders(res, filePath) {
    const cacheControl = staticCacheControl(filePath);
    if (cacheControl) res.set("Cache-Control", cacheControl);
  }
}));

app.use((req, res) => {
  res.status(404).type("html").send("<h1>404</h1><p>Page not found.</p>");
});

app.use(handleServerError);

const MEDIA_CACHE_SECONDS = 7 * 24 * 60 * 60;
const LONG_CACHE_PATH = /[\\/]assets[\\/](images|icons|fonts|docs|videos)[\\/]/;

/**
 * Media and fonts get a week of browser caching (uploads always get new file names).
 * Code, styles, data and pages keep Express' default revalidation so edits show up immediately.
 * @param {string} filePath
 * @returns {string} Cache-Control value, or "" to keep the default
 */
export function staticCacheControl(filePath = "") {
  return LONG_CACHE_PATH.test(filePath) ? `public, max-age=${MEDIA_CACHE_SECONDS}` : "";
}

export function sendFileOnlyNextOnError(res, next, filePath) {
  res.sendFile(filePath, (error) => {
    if (error) next(error);
  });
}

export function handleServerError(error, req, res, next) {
  if (res.headersSent) return next(error);
  const missingMailConfiguration = isMissingMailConfiguration(error);
  const smtpAuthError = isSmtpAuthError(error);
  if (missingMailConfiguration || smtpAuthError) {
    securityLog("server_mail_configuration_error", req, { code: error.code || "", responseCode: error.responseCode || "" });
  } else {
    console.error(error);
  }
  const status = missingMailConfiguration || smtpAuthError ? 503 : 500;
  const production = process.env.NODE_ENV === "production";
  return res.status(status).json({
    ok: false,
    errors: {
      server: production
        ? "Server error. Please try again later."
        : smtpAuthError
        ? "SMTP login failed. Check SMTP_USER and SMTP_PASS; Gmail requires an App Password, not the normal Google account password."
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

export function requireProductionSameOrigin(req, res, next) {
  if (process.env.NODE_ENV !== "production") return next();
  if (sameOriginOrReferer(req)) return next();
  securityLog("contact_origin_rejected", req);
  return res.status(403).json({ ok: false, errors: { request: "Request verification failed." } });
}

export function assertProductionSecurityEnv(env = process.env) {
  parseTrustProxy(env.TRUST_PROXY);
  const provider = createCaptchaProvider(env);
  const errors = [];
  if (env.EDITOR_MODE === "1" && env.EDITOR_LOCAL_ONLY !== "true") {
    errors.push("EDITOR_LOCAL_ONLY=true is required when EDITOR_MODE=1");
  }
  const contactMailConfigured = Boolean(env.SMTP_HOST && env.CONTACT_TO);
  if (contactMailConfigured && env.CONTACT_ALLOW_WITHOUT_CAPTCHA !== "1" && provider.name === "none") {
    errors.push("CAPTCHA provider is required for production contact forms unless CONTACT_ALLOW_WITHOUT_CAPTCHA=1 is set");
  }
  if (contactMailConfigured && provider.name === "hcaptcha" && !String(env.HCAPTCHA_SITE_KEY || "").trim()) {
    errors.push("HCAPTCHA_SITE_KEY is required when hCaptcha protects production contact forms");
  }
  if (contactMailConfigured && provider.name === "mcaptcha" && !String(env.MCAPTCHA_SITE_KEY || "").trim()) {
    errors.push("MCAPTCHA_SITE_KEY is required when mCaptcha protects production contact forms");
  }
  if (errors.length) throw new Error(`Invalid production security configuration: ${errors.join("; ")}`);
}

function inferSubjectFromPath(pathname) {
  return pathname.includes("membership") ? "Membership application" : "Contact";
}

export function applyRuntimePublicConfig(data, pathname) {
  const publicCaptcha = createCaptchaProvider(process.env).publicConfig;

  if (pathname.endsWith("/site.default.json") || pathname.endsWith("/site.local.json")) {
    return {
      ...withoutCaptchaConfig(data),
      captcha: publicCaptcha
    };
  }

  if (pathname.endsWith("/pages.default.json") || pathname.endsWith("/pages.local.json")) {
    const membership = stripPageCaptchaConfig({
      ...data.membership,
      ...data.mitglied,
      form: {
        ...data.membership?.form,
        ...data.mitglied?.form
      }
    });
    return {
      ...data,
      membership: {
        ...membership,
        form: {
          ...membership.form,
          captcha: publicCaptcha
        }
      },
      ...(data.mitglied ? { mitglied: stripPageCaptchaConfig(data.mitglied) } : {})
    };
  }

  return data;
}

function withoutCaptchaConfig(value = {}) {
  const { hcaptchaSiteKey, captcha, ...rest } = value || {};
  return rest;
}

function stripPageCaptchaConfig(page = {}) {
  const { form, ...rest } = page || {};
  if (form === undefined) return rest;
  return {
    ...rest,
    form: withoutCaptchaConfig(form)
  };
}

function logCaptchaError(error, req, provider) {
  securityLog("captcha_verification_error", req, {
    provider: provider?.name || error.provider || "",
    status: String(error.status || "")
  });
}

async function loadFormMessages(pathname = "") {
  if (pathname.includes("membership")) {
    const pages = await loadMergedPublicJson(publicDir, "pages.default.json", "pages.local.json");
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

  const site = await loadMergedPublicJson(publicDir, "site.default.json", "site.local.json");
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
