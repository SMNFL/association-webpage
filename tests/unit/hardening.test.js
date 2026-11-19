import test from "node:test";
import assert from "node:assert/strict";
import { createEditorAuth, hashPassword } from "../../server/security/editor-auth.js";
import { createMemoryRateLimiter, createProgressiveLoginGuard } from "../../server/security/rate-limit.js";
import { createCaptchaProvider } from "../../server/security/captcha.js";

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    redirect(location) { this.statusCode = 302; this.headers.Location = location; return this; }
  };
}

test("memory limiter drops expired entries so unique client keys cannot grow memory forever", () => {
  let now = 0;
  const limiter = createMemoryRateLimiter({ max: 5, windowMs: 1000, now: () => now });
  for (let index = 0; index < 50; index += 1) {
    limiter({ ip: `198.51.100.${index}` }, createResponse(), () => {});
  }
  assert.equal(limiter.size(), 50);

  now = 1001;
  limiter({ ip: "203.0.113.1" }, createResponse(), () => {});

  assert.equal(limiter.size(), 1);
});

test("login guard drops expired, unlocked entries", () => {
  let now = 0;
  const guard = createProgressiveLoginGuard({ threshold: 5, windowMs: 1000, now: () => now });
  for (let index = 0; index < 20; index += 1) guard.recordFailure({ ip: `198.51.100.${index}` });
  assert.equal(guard.size(), 20);

  now = 1001;
  guard.middleware({ ip: "203.0.113.1" }, createResponse(), () => {});

  assert.equal(guard.size(), 1);
});

test("editor auth treats a malformed session cookie as logged out instead of throwing", () => {
  const auth = createEditorAuth({ passwordHash: hashPassword("correct horse battery staple"), sessionSecret: "s".repeat(64) });
  const req = { headers: { cookie: "sukura_editor_session=%E0%A4%A" }, get: () => "" };

  assert.doesNotThrow(() => auth.sessionFromRequest(req));
  assert.equal(auth.sessionFromRequest(req), null);
});

test("hCaptcha verification binds the token to the configured site key", async () => {
  const calls = [];
  const provider = createCaptchaProvider({
    CAPTCHA_PROVIDER: "hcaptcha",
    HCAPTCHA_SECRET: "private-secret",
    HCAPTCHA_SITE_KEY: "public-key"
  }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ success: true }) };
  });

  await provider.verify("token-123");

  assert.equal(new URLSearchParams(calls[0].options.body).get("sitekey"), "public-key");
});

test("mCaptcha public config pins the default widget script with subresource integrity", () => {
  const provider = createCaptchaProvider({
    CAPTCHA_PROVIDER: "mcaptcha",
    MCAPTCHA_VERIFY_URL: "https://captcha.example.org/api/v1/pow/siteverify",
    MCAPTCHA_SITE_KEY: "site-key",
    MCAPTCHA_SECRET: "secret",
    MCAPTCHA_WIDGET_URL: "https://captcha.example.org/widget"
  });

  assert.match(provider.publicConfig.scriptIntegrity, /^sha384-[A-Za-z0-9+/]+=*$/);
});
