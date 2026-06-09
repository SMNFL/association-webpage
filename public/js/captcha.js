const HCAPTCHA_SCRIPT_URL = "https://js.hcaptcha.com/1/api.js?hl=en";
const MCAPTCHA_SCRIPT_URL = "https://unpkg.com/@mcaptcha/vanilla-glue@0.1.0-rc2/dist/index.js";

export function resolveCaptchaConfig(site = {}, form = {}) {
  const explicit = {
    ...(site.captcha || {}),
    ...(form.captcha || {})
  };
  const provider = normalizeProvider(explicit.provider);

  if (provider === "none") return { provider: "none" };
  if (provider === "hcaptcha") {
    return {
      provider: "hcaptcha",
      siteKey: clean(explicit.siteKey)
    };
  }
  if (provider === "mcaptcha") {
    return {
      provider: "mcaptcha",
      siteKey: clean(explicit.siteKey),
      widgetUrl: clean(explicit.widgetUrl),
      scriptUrl: clean(explicit.scriptUrl) || MCAPTCHA_SCRIPT_URL
    };
  }

  return { provider: "none" };
}

export function configureCaptcha(root = document, config = {}) {
  const target = root.querySelector?.("[data-contact-captcha], .captcha-box");
  const provider = normalizeProvider(config.provider);
  if (!target || provider === "none") {
    if (target) target.hidden = true;
    return { enabled: false, provider: "none" };
  }

  if (provider === "hcaptcha") return configureHCaptcha(target, config);
  if (provider === "mcaptcha") return configureMCaptcha(target, config);

  target.hidden = true;
  return { enabled: false, provider: "none" };
}

export function captchaTokenValue(provider = "hcaptcha") {
  const selector = provider === "mcaptcha"
    ? '[name="mcaptcha__token"], [name="mcaptchaToken"]'
    : '[name="h-captcha-response"], [name="hcaptchaToken"]';
  return document.querySelector(selector)?.value || "";
}

export function resetCaptcha(provider = "hcaptcha") {
  if (provider === "hcaptcha" && window.hcaptcha) window.hcaptcha.reset();
  if (provider === "mcaptcha") {
    document.querySelectorAll('[name="mcaptcha__token"], [name="mcaptchaToken"]').forEach((input) => {
      input.value = "";
    });
  }
}

function configureHCaptcha(box, config = {}) {
  const siteKey = clean(config.siteKey);
  if (!siteKey) {
    box.hidden = true;
    return { enabled: false, provider: "hcaptcha" };
  }

  box.hidden = false;
  const captcha = ensureChild(box, "[data-hcaptcha]", "div");
  captcha.dataset.hcaptcha = "";
  captcha.className = "h-captcha";
  captcha.dataset.sitekey = siteKey;
  captcha.dataset.size ||= "normal";
  captcha.dataset.theme ||= "dark";
  removeMCaptchaNodes(box);
  loadScript("hcaptcha", HCAPTCHA_SCRIPT_URL);
  return { enabled: true, provider: "hcaptcha", tokenName: "h-captcha-response", element: captcha };
}

function configureMCaptcha(box, config = {}) {
  const widgetUrl = clean(config.widgetUrl);
  if (!widgetUrl) {
    box.hidden = true;
    return { enabled: false, provider: "mcaptcha" };
  }

  box.hidden = false;
  const hcaptcha = box.querySelector("[data-hcaptcha]");
  if (hcaptcha) hcaptcha.remove();

  const label = box.querySelector(".captcha-label") || ensureChild(box, "label", "label");
  label.id = "mcaptcha__token-label";
  label.setAttribute("for", "mcaptcha__token");
  label.dataset.mcaptcha_url = widgetUrl;

  const input = ensureChild(box, '[name="mcaptcha__token"]', "input");
  input.id = "mcaptcha__token";
  input.name = "mcaptcha__token";
  input.type = "text";
  input.classList.add("visually-hidden");

  const container = ensureChild(box, "#mcaptcha__widget-container", "div");
  container.id = "mcaptcha__widget-container";
  container.dataset.mcaptchaWidget = "";

  loadScript("mcaptcha", clean(config.scriptUrl) || MCAPTCHA_SCRIPT_URL);
  return { enabled: true, provider: "mcaptcha", tokenName: "mcaptcha__token", element: container };
}

function ensureChild(root, selector, tagName) {
  const existing = root.querySelector(selector);
  if (existing) return existing;
  const child = document.createElement(tagName);
  root.append(child);
  return child;
}

function removeMCaptchaNodes(root) {
  root.querySelector('[name="mcaptcha__token"]')?.remove();
  root.querySelector("#mcaptcha__widget-container")?.remove();
}

function loadScript(name, src) {
  if (!src || document.querySelector(`script[data-captcha-script="${name}"]`)) return;
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  script.defer = true;
  script.dataset.captchaScript = name;
  if (name === "hcaptcha") script.dataset.hcaptchaScript = "";
  if (name === "mcaptcha") script.dataset.mcaptchaScript = "";
  document.head.append(script);
}

function normalizeProvider(value = "") {
  const provider = clean(value).toLowerCase();
  if (provider === "none" || provider === "hcaptcha" || provider === "mcaptcha") return provider;
  return "";
}

function clean(value = "") {
  return String(value || "").trim();
}
