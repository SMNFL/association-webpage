import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEditorAuth, hashPassword, sameOrigin, verifyPassword } from "../../server/security/editor-auth.js";
import { sanitizeRichHtml, safeIframeUrl } from "../../server/security/content-safety.js";
import { createMemoryRateLimiter } from "../../server/security/rate-limit.js";
import { requireLocalhost } from "../../server/editor/router.js";
import { saveUploadedMedia } from "../../server/editor/content-store.js";
import { isTrustedInstagramImageUrl } from "../../server/api/instagram.js";

const PASSWORD = "correct horse battery staple";

test("editor password hashes verify without storing the plain password", () => {
  const hash = hashPassword(PASSWORD, "fixed-salt");
  assert.match(hash, /^scrypt\$fixed-salt\$/);
  assert.equal(hash.includes(PASSWORD), false);
  assert.equal(verifyPassword(PASSWORD, hash), true);
  assert.equal(verifyPassword("wrong password", hash), false);
});

test("editor sessions require a valid cookie and CSRF token for writes", () => {
  const auth = createEditorAuth({
    passwordHash: hashPassword(PASSWORD, "session-salt"),
    sessionSecret: "test-session-secret"
  });
  const loginRes = createResponse();
  auth.login(createRequest({ method: "POST", body: { password: PASSWORD } }), loginRes);
  assert.equal(loginRes.statusCode, 200);

  const cookie = loginRes.headers["Set-Cookie"].split(";")[0];
  const sessionRes = createResponse();
  auth.session(createRequest({ cookie }), sessionRes);
  assert.equal(sessionRes.body.authenticated, true);

  const req = createRequest({
    method: "PUT",
    cookie,
    headers: { "X-CSRF-Token": sessionRes.body.csrfToken }
  });
  let called = false;
  auth.requireAuth(req, createResponse(), () => {
    auth.requireCsrf(req, createResponse(), () => {
      called = true;
    });
  });
  assert.equal(called, true);
});

test("editor rejects tampered cookies, invalidates logout and expires sessions", async () => {
  const auth = createEditorAuth({
    passwordHash: hashPassword(PASSWORD, "expiry-salt"),
    sessionSecret: "test-session-secret",
    sessionTtlMs: 1
  });
  const loginRes = createResponse();
  auth.login(createRequest({ method: "POST", body: { password: PASSWORD } }), loginRes);
  const cookie = loginRes.headers["Set-Cookie"].split(";")[0];

  const tampered = createResponse();
  auth.session(createRequest({ cookie: `${cookie}x` }), tampered);
  assert.equal(tampered.statusCode, 401);

  const logoutRes = createResponse();
  auth.logout(createRequest({ method: "POST", cookie }), logoutRes);
  const loggedOut = createResponse();
  auth.session(createRequest({ cookie }), loggedOut);
  assert.equal(loggedOut.statusCode, 401);

  const nextLogin = createResponse();
  auth.login(createRequest({ method: "POST", body: { password: PASSWORD } }), nextLogin);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const expired = createResponse();
  auth.session(createRequest({ cookie: nextLogin.headers["Set-Cookie"].split(";")[0] }), expired);
  assert.equal(expired.statusCode, 401);
});

test("editor rejects invalid CSRF tokens, origins and remote addresses", () => {
  assert.equal(sameOrigin(createRequest({ origin: "https://attacker.example" })), false);

  const res = createResponse();
  requireLocalhost({ ip: "203.0.113.10" }, res, () => {
    throw new Error("remote request should not continue");
  });
  assert.equal(res.statusCode, 403);
});

test("editor can allow Docker bridge addresses only when explicitly enabled", () => {
  const previous = process.env.EDITOR_ALLOW_DOCKER_BRIDGE;
  try {
    delete process.env.EDITOR_ALLOW_DOCKER_BRIDGE;
    const blocked = createResponse();
    requireLocalhost({ ip: "::ffff:172.18.0.1" }, blocked, () => {
      throw new Error("Docker bridge request should require an explicit flag");
    });
    assert.equal(blocked.statusCode, 403);

    process.env.EDITOR_ALLOW_DOCKER_BRIDGE = "1";
    const allowed = createResponse();
    let called = false;
    requireLocalhost({ ip: "::ffff:172.18.0.1" }, allowed, () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(allowed.statusCode, 200);
  } finally {
    if (previous === undefined) {
      delete process.env.EDITOR_ALLOW_DOCKER_BRIDGE;
    } else {
      process.env.EDITOR_ALLOW_DOCKER_BRIDGE = previous;
    }
  }
});

test("memory limiter blocks requests beyond its configured limit", () => {
  const limiter = createMemoryRateLimiter({ max: 1, windowMs: 60_000 });
  const req = { ip: "127.0.0.1" };
  limiter(req, createResponse(), () => {});
  const blocked = createResponse();
  limiter(req, blocked, () => {
    throw new Error("limited request should not continue");
  });
  assert.equal(blocked.statusCode, 429);
});

test("rich HTML sanitizer preserves approved embeds and removes executable markup", () => {
  const html = sanitizeRichHtml(`
    <script>alert(1)</script>
    <a href="javascript:alert(1)" onclick="alert(1)">bad</a>
    <iframe src="https://www.paypal.com/giving/campaigns?id=1" onload="alert(1)"></iframe>
  `);
  assert.doesNotMatch(html, /script|javascript:|onclick|onload/);
  assert.match(html, /https:\/\/www\.paypal\.com/);
  assert.equal(safeIframeUrl("https://tickets.clevertix.de/fourteen/w/example/?iframe=1"), "https://tickets.clevertix.de/fourteen/w/example/?iframe=1");
  assert.equal(safeIframeUrl("https://attacker.example/embed"), "");
});

test("media upload checks decoded image signatures", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sukura-upload-"));
  await mkdir(path.join(root, "public", "assets", "images"), { recursive: true });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const saved = await saveUploadedMedia(root, {
    filename: "safe.png",
    dataBase64: `data:image/png;base64,${png.toString("base64")}`
  });
  assert.equal(saved.path, "assets/images/editor/safe.png");

  await assert.rejects(
    saveUploadedMedia(root, {
      filename: "not-an-image.png",
      dataBase64: Buffer.from("<script>alert(1)</script>").toString("base64")
    }),
    /does not match/
  );
});

test("Instagram image proxy accepts expected CDN hosts only", () => {
  assert.equal(isTrustedInstagramImageUrl("https://scontent.cdninstagram.com/photo.jpg"), true);
  assert.equal(isTrustedInstagramImageUrl("https://example.org/photo.jpg"), false);
  assert.equal(isTrustedInstagramImageUrl("http://scontent.cdninstagram.com/photo.jpg"), false);
});

function createRequest(options = {}) {
  const headers = {
    Origin: options.origin || "http://127.0.0.1:8080",
    Host: "127.0.0.1:8080",
    Cookie: options.cookie || "",
    ...(options.headers || {})
  };
  return {
    body: options.body || {},
    method: options.method || "GET",
    headers: { cookie: headers.Cookie },
    secure: false,
    get(name) {
      return headers[name] || headers[name.toLowerCase()] || "";
    }
  };
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}
