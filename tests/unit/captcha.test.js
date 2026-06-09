import test from "node:test";
import assert from "node:assert/strict";
import { CaptchaVerificationError, createCaptchaProvider } from "../../server/security/captcha.js";

test("captcha provider defaults to none when no provider config exists", async () => {
  const provider = createCaptchaProvider({});

  assert.equal(provider.name, "none");
  assert.deepEqual(provider.publicConfig, { provider: "none" });
  assert.equal(await provider.verify(), true);
});

test("captcha provider selects hCaptcha from hCaptcha secret config", () => {
  const provider = createCaptchaProvider({
    HCAPTCHA_SECRET: "private-secret",
    HCAPTCHA_SITE_KEY: "public-key"
  }, createFetch({ success: true }));

  assert.equal(provider.name, "hcaptcha");
  assert.deepEqual(provider.publicConfig, { provider: "hcaptcha", siteKey: "public-key" });
});

test("captcha provider selects mCaptcha from full mCaptcha config", () => {
  const provider = createCaptchaProvider(mcaptchaEnv(), createFetch({ valid: true }));

  assert.equal(provider.name, "mcaptcha");
  assert.deepEqual(provider.publicConfig, {
    provider: "mcaptcha",
    siteKey: "site-key",
    widgetUrl: "https://captcha.example/widget",
    scriptUrl: "https://unpkg.com/@mcaptcha/vanilla-glue@0.1.0-rc2/dist/index.js"
  });
});

test("captcha provider rejects missing explicit provider configuration", () => {
  assert.throws(
    () => createCaptchaProvider({ CAPTCHA_PROVIDER: "mcaptcha" }),
    /Missing mCaptcha configuration: MCAPTCHA_VERIFY_URL, MCAPTCHA_SITE_KEY, MCAPTCHA_SECRET, MCAPTCHA_WIDGET_URL/
  );
  assert.throws(
    () => createCaptchaProvider({ CAPTCHA_PROVIDER: "hcaptcha" }),
    /HCAPTCHA_SECRET/
  );
  assert.throws(
    () => createCaptchaProvider({ CAPTCHA_PROVIDER: "existing" }),
    /CAPTCHA_PROVIDER must be none, hcaptcha, or mcaptcha/
  );
});

test("captcha provider rejects ambiguous automatic configuration", () => {
  assert.throws(
    () => createCaptchaProvider({ ...mcaptchaEnv(), HCAPTCHA_SECRET: "hcaptcha-secret" }),
    /Ambiguous CAPTCHA configuration/
  );
});

test("hCaptcha verification posts the provider form payload and parses success", async () => {
  const calls = [];
  const provider = createCaptchaProvider({
    CAPTCHA_PROVIDER: "hcaptcha",
    HCAPTCHA_SECRET: "private-secret",
    HCAPTCHA_SITE_KEY: "public-key"
  }, createFetch({ success: true }, calls));

  assert.equal(await provider.verify("token-123", { remoteIp: "203.0.113.10" }), true);
  assert.equal(calls[0].url, "https://hcaptcha.com/siteverify");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/x-www-form-urlencoded");
  const body = new URLSearchParams(calls[0].options.body);
  assert.equal(body.get("secret"), "private-secret");
  assert.equal(body.get("response"), "token-123");
  assert.equal(body.get("remoteip"), "203.0.113.10");
});

test("hCaptcha verification rejects missing, false, and provider-error tokens safely", async () => {
  const provider = createCaptchaProvider({
    CAPTCHA_PROVIDER: "hcaptcha",
    HCAPTCHA_SECRET: "private-secret"
  }, createFetch({ success: false }));

  assert.equal(await provider.verify(""), false);
  assert.equal(await provider.verify("bad-token"), false);

  const failing = createCaptchaProvider({
    CAPTCHA_PROVIDER: "hcaptcha",
    HCAPTCHA_SECRET: "private-secret"
  }, createFetch({ error: "bad gateway" }, [], { ok: false, status: 502 }));

  await assert.rejects(
    () => failing.verify("token"),
    (error) => error instanceof CaptchaVerificationError
      && error.provider === "hcaptcha"
      && error.status === 502
  );
});

test("mCaptcha verification posts JSON and parses valid response", async () => {
  const calls = [];
  const provider = createCaptchaProvider(mcaptchaEnv(), createFetch({ valid: true }, calls));

  assert.equal(await provider.verify("pow-token"), true);
  assert.equal(calls[0].url, "https://captcha.example/api/v1/pow/siteverify");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    token: "pow-token",
    key: "site-key",
    secret: "private-secret"
  });
});

test("mCaptcha verification rejects invalid and provider-error responses safely", async () => {
  const provider = createCaptchaProvider(mcaptchaEnv(), createFetch({ valid: false }));
  assert.equal(await provider.verify("bad-token"), false);

  const failing = createCaptchaProvider(mcaptchaEnv(), createFetch({}, [], { ok: false, status: 500 }));
  await assert.rejects(
    () => failing.verify("token"),
    (error) => error instanceof CaptchaVerificationError
      && error.provider === "mcaptcha"
      && error.status === 500
  );
});

function mcaptchaEnv() {
  return {
    MCAPTCHA_VERIFY_URL: "https://captcha.example/api/v1/pow/siteverify",
    MCAPTCHA_SITE_KEY: "site-key",
    MCAPTCHA_SECRET: "private-secret",
    MCAPTCHA_WIDGET_URL: "https://captcha.example/widget"
  };
}

function createFetch(jsonBody, calls = [], responseOptions = {}) {
  return async (url, options) => {
    calls.push({ url, options });
    return {
      ok: responseOptions.ok ?? true,
      status: responseOptions.status ?? 200,
      async json() {
        return jsonBody;
      }
    };
  };
}
