const HCAPTCHA_VERIFY_URL = "https://hcaptcha.com/siteverify";
const DEFAULT_MCAPTCHA_SCRIPT_URL = "https://unpkg.com/@mcaptcha/vanilla-glue@0.1.0-rc2/dist/index.js";
// SHA-384 of the exact file above. Update both together; custom MCAPTCHA_SCRIPT_URL values are self-hosted and not pinned.
const DEFAULT_MCAPTCHA_SCRIPT_INTEGRITY = "sha384-ODJS3m32+GRF5ESoJeKxB8UeuD82gQvd8dR6r1gQ3+hwMsf05E2q6N4EZvI01QUY";
const VERIFY_TIMEOUT_MS = 8000;

export class CaptchaVerificationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CaptchaVerificationError";
    this.provider = details.provider || "unknown";
    this.status = details.status || 0;
  }
}

export function createCaptchaProvider(env = process.env, fetchImpl = fetch) {
  const providerName = selectCaptchaProvider(env);
  if (providerName === "none") return noneProvider();
  if (providerName === "hcaptcha") return hcaptchaProvider(env, fetchImpl);
  if (providerName === "mcaptcha") return mcaptchaProvider(env, fetchImpl);
  throw new Error(`Unsupported CAPTCHA_PROVIDER: ${providerName}`);
}

export function selectCaptchaProvider(env = process.env) {
  const explicit = normalizeProvider(env.CAPTCHA_PROVIDER);
  const hasHcaptcha = Boolean(clean(env.HCAPTCHA_SECRET));
  const hasMcaptcha = Boolean(
    clean(env.MCAPTCHA_VERIFY_URL)
    || clean(env.MCAPTCHA_SITE_KEY)
    || clean(env.MCAPTCHA_SECRET)
    || clean(env.MCAPTCHA_WIDGET_URL)
    || clean(env.MCAPTCHA_SCRIPT_URL)
  );

  if (explicit) return explicit;
  if (hasHcaptcha && hasMcaptcha) {
    throw new Error("Ambiguous CAPTCHA configuration: set CAPTCHA_PROVIDER=hcaptcha or CAPTCHA_PROVIDER=mcaptcha.");
  }
  if (hasHcaptcha) return "hcaptcha";
  if (hasMcaptcha) return "mcaptcha";
  return "none";
}

export function captchaCspSources(env = process.env) {
  const sources = { script: [], frame: [], connect: [] };
  const provider = safeSelectCaptchaProvider(env);
  if (provider !== "mcaptcha") return sources;

  addOrigin(sources.script, clean(env.MCAPTCHA_SCRIPT_URL) || DEFAULT_MCAPTCHA_SCRIPT_URL);
  addOrigin(sources.frame, clean(env.MCAPTCHA_WIDGET_URL));
  addOrigin(sources.connect, clean(env.MCAPTCHA_WIDGET_URL));
  addOrigin(sources.connect, clean(env.MCAPTCHA_VERIFY_URL));
  return sources;
}

function noneProvider() {
  return {
    name: "none",
    publicConfig: { provider: "none" },
    requiresToken: false,
    async verify() {
      return true;
    }
  };
}

function hcaptchaProvider(env, fetchImpl) {
  const secret = clean(env.HCAPTCHA_SECRET);
  if (!secret) throw new Error("HCAPTCHA_SECRET is required when CAPTCHA_PROVIDER=hcaptcha.");
  return {
    name: "hcaptcha",
    publicConfig: {
      provider: "hcaptcha",
      siteKey: clean(env.HCAPTCHA_SITE_KEY)
    },
    requiresToken: true,
    tokenField: "hcaptcha",
    async verify(token, context = {}) {
      if (!clean(token)) return false;
      const body = new URLSearchParams({
        secret,
        response: clean(token)
      });
      if (context.remoteIp) body.set("remoteip", context.remoteIp);
      const siteKey = clean(env.HCAPTCHA_SITE_KEY);
      if (siteKey) body.set("sitekey", siteKey);

      const response = await fetchWithTimeout(fetchImpl, HCAPTCHA_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      }, "hcaptcha");
      if (!response.ok) {
        throw new CaptchaVerificationError("hCaptcha verification request failed.", {
          provider: "hcaptcha",
          status: response.status
        });
      }
      const result = await response.json();
      return Boolean(result.success);
    }
  };
}

function mcaptchaProvider(env, fetchImpl) {
  const verifyUrl = clean(env.MCAPTCHA_VERIFY_URL);
  const siteKey = clean(env.MCAPTCHA_SITE_KEY);
  const secret = clean(env.MCAPTCHA_SECRET);
  const widgetUrl = clean(env.MCAPTCHA_WIDGET_URL);
  const missing = [];
  if (!verifyUrl) missing.push("MCAPTCHA_VERIFY_URL");
  if (!siteKey) missing.push("MCAPTCHA_SITE_KEY");
  if (!secret) missing.push("MCAPTCHA_SECRET");
  if (!widgetUrl) missing.push("MCAPTCHA_WIDGET_URL");
  if (missing.length) throw new Error(`Missing mCaptcha configuration: ${missing.join(", ")}.`);
  validateHttpUrl(verifyUrl, "MCAPTCHA_VERIFY_URL");
  validateHttpUrl(widgetUrl, "MCAPTCHA_WIDGET_URL");
  if (clean(env.MCAPTCHA_SCRIPT_URL)) validateHttpUrl(clean(env.MCAPTCHA_SCRIPT_URL), "MCAPTCHA_SCRIPT_URL");

  return {
    name: "mcaptcha",
    publicConfig: {
      provider: "mcaptcha",
      siteKey,
      widgetUrl,
      scriptUrl: clean(env.MCAPTCHA_SCRIPT_URL) || DEFAULT_MCAPTCHA_SCRIPT_URL,
      scriptIntegrity: clean(env.MCAPTCHA_SCRIPT_URL) ? "" : DEFAULT_MCAPTCHA_SCRIPT_INTEGRITY
    },
    requiresToken: true,
    tokenField: "mcaptcha",
    async verify(token) {
      if (!clean(token)) return false;
      const response = await fetchWithTimeout(fetchImpl, verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: clean(token), key: siteKey, secret })
      }, "mcaptcha");
      if (!response.ok) {
        throw new CaptchaVerificationError("mCaptcha verification request failed.", {
          provider: "mcaptcha",
          status: response.status
        });
      }
      const result = await response.json();
      return Boolean(result.valid);
    }
  };
}

async function fetchWithTimeout(fetchImpl, url, options = {}, provider = "captcha") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new CaptchaVerificationError("CAPTCHA verification request failed.", {
      provider
    });
  } finally {
    clearTimeout(timeout);
  }
}

function validateHttpUrl(value, name) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return;
  } catch {
    // Fall through to the shared error below.
  }
  throw new Error(`${name} must be an http or https URL.`);
}

function normalizeProvider(value = "") {
  const provider = clean(value).toLowerCase();
  if (!provider) return "";
  if (["none", "hcaptcha", "mcaptcha"].includes(provider)) return provider;
  throw new Error("CAPTCHA_PROVIDER must be none, hcaptcha, or mcaptcha.");
}

function safeSelectCaptchaProvider(env) {
  try {
    return selectCaptchaProvider(env);
  } catch {
    return "";
  }
}

function addOrigin(target, value) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol)) target.push(url.origin);
  } catch {
    // Startup validation reports invalid provider URLs; CSP generation stays best-effort.
  }
}

function clean(value = "") {
  return String(value || "").trim();
}
