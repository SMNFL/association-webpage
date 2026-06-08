import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

process.env.NODE_ENV = "test";
const {
  applyRuntimePublicConfig,
  assertProductionSecurityEnv,
  handleServerError,
  requireProductionSameOrigin,
  sendFileOnlyNextOnError
} = await import("../../server/index.js");

test("sendFile helper only calls next when sendFile reports an error", () => {
  const calls = [];
  const res = {
    sendFile(filePath, callback) {
      calls.push(["sendFile", filePath]);
      callback();
    }
  };

  sendFileOnlyNextOnError(res, (error) => calls.push(["next", error]), "/tmp/contact-live.js");

  assert.deepEqual(calls, [["sendFile", "/tmp/contact-live.js"]]);
});

test("sendFile helper forwards actual sendFile errors", () => {
  const expected = new Error("missing file");
  const calls = [];
  const res = {
    sendFile(filePath, callback) {
      calls.push(["sendFile", filePath]);
      callback(expected);
    }
  };

  sendFileOnlyNextOnError(res, (error) => calls.push(["next", error]), "/tmp/missing.js");

  assert.deepEqual(calls, [
    ["sendFile", "/tmp/missing.js"],
    ["next", expected]
  ]);
});

test("server error handler delegates when headers are already sent", () => {
  const expected = new Error("late failure");
  const calls = [];
  const res = {
    headersSent: true,
    status() {
      calls.push(["status"]);
      return this;
    },
    json() {
      calls.push(["json"]);
      return this;
    }
  };

  withSilencedConsoleError(() => {
    handleServerError(expected, {}, res, (error) => calls.push(["next", error]));
  });

  assert.deepEqual(calls, [["next", expected]]);
});

test("server error handler returns controlled JSON for missing mail configuration without error logging", () => {
  const expected = new Error("Missing mail configuration: SMTP_HOST, SMTP_FROM, CONTACT_TO");
  const res = createJsonResponse();
  const logCalls = [];
  const warnCalls = [];

  withCapturedConsoleWarn(warnCalls, () => withCapturedConsoleError(logCalls, () => {
    handleServerError(expected, createRequest(), res, () => {
      throw new Error("next should not be called");
    });
  }));

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    ok: false,
    errors: {
      server: "Missing mail configuration: SMTP_HOST, SMTP_FROM, CONTACT_TO"
    }
  });
  assert.deepEqual(logCalls, []);
  assert.equal(warnCalls.length, 1);
});

test("server error handler returns actionable JSON for SMTP auth failures without error logging", () => {
  const expected = Object.assign(new Error("Invalid login: 535 Authentication credentials invalid"), {
    code: "EAUTH",
    responseCode: 535
  });
  const res = createJsonResponse();
  const logCalls = [];
  const warnCalls = [];

  withCapturedConsoleWarn(warnCalls, () => withCapturedConsoleError(logCalls, () => {
    handleServerError(expected, createRequest(), res, () => {
      throw new Error("next should not be called");
    });
  }));

  assert.equal(res.statusCode, 503);
  assert.match(res.body.errors.server, /SMTP login failed/);
  assert.match(res.body.errors.server, /App Password/);
  assert.deepEqual(logCalls, []);
  assert.equal(warnCalls.length, 1);
});

test("server error handler hides mail configuration details in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const res = createJsonResponse();
    withCapturedConsoleWarn([], () => {
      handleServerError(new Error("Missing mail configuration: SMTP_HOST"), createRequest(), res, () => {
        throw new Error("next should not be called");
      });
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {
      ok: false,
      errors: { server: "Server error. Please try again later." }
    });
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test("runtime public config injects hCaptcha site key into default JSON", () => {
  const previous = process.env.HCAPTCHA_SITE_KEY;
  process.env.HCAPTCHA_SITE_KEY = "real-public-site-key";

  try {
    assert.deepEqual(
      applyRuntimePublicConfig({ hcaptchaSiteKey: "test-key" }, "/data/site.default.json"),
      { hcaptchaSiteKey: "real-public-site-key" }
    );
    assert.deepEqual(
      applyRuntimePublicConfig({ hcaptchaSiteKey: "old-local-key" }, "/data/site.local.json"),
      { hcaptchaSiteKey: "real-public-site-key" }
    );
    assert.deepEqual(
      applyRuntimePublicConfig({ membership: { form: { hcaptchaSiteKey: "test-key" } } }, "/data/pages.default.json"),
      { membership: { form: { hcaptchaSiteKey: "real-public-site-key" } } }
    );
    assert.deepEqual(
      applyRuntimePublicConfig({ mitglied: { form: { hcaptchaSiteKey: "old-local-key" } } }, "/data/pages.local.json"),
      {
        mitglied: { form: { hcaptchaSiteKey: "old-local-key" } },
        membership: { form: { hcaptchaSiteKey: "real-public-site-key" } }
      }
    );
  } finally {
    if (previous === undefined) {
      delete process.env.HCAPTCHA_SITE_KEY;
    } else {
      process.env.HCAPTCHA_SITE_KEY = previous;
    }
  }
});

test("production contact posts require same-origin origin or referer", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const rejected = createJsonResponse();
    withCapturedConsoleWarn([], () => {
      requireProductionSameOrigin(createRequest({ origin: "https://attacker.example" }), rejected, () => {
        throw new Error("cross-origin request should not continue");
      });
    });
    assert.equal(rejected.statusCode, 403);

    let called = false;
    requireProductionSameOrigin(createRequest({ origin: "https://127.0.0.1:8080" }), createJsonResponse(), () => {
      called = true;
    });
    assert.equal(called, true);

    called = false;
    requireProductionSameOrigin(createRequest({ origin: "", referer: "https://127.0.0.1:8080/pages/contact.html" }), createJsonResponse(), () => {
      called = true;
    });
    assert.equal(called, true);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test("production security env requires captcha unless deliberately disabled", () => {
  assert.throws(
    () => assertProductionSecurityEnv({
      NODE_ENV: "production",
      TRUST_PROXY: "false",
      SMTP_HOST: "smtp.example.org",
      CONTACT_TO: "contact@example.org"
    }),
    /HCAPTCHA_SECRET/
  );
  assert.doesNotThrow(() => assertProductionSecurityEnv({
    NODE_ENV: "production",
    TRUST_PROXY: "loopback",
    SMTP_HOST: "smtp.example.org",
    CONTACT_TO: "contact@example.org",
    HCAPTCHA_SECRET: "secret"
  }));
});

test("Netlify Instagram function JSON responses include security headers", () => {
  const source = readFileSync("netlify/functions/instagram-feed.js", "utf8");
  const sandbox = { exports: {}, Buffer, URL, URLSearchParams, setTimeout, clearTimeout };
  vm.runInNewContext(`${source}\nexports.__testJson = json;`, sandbox);
  const response = sandbox.exports.__testJson(200, { ok: true });
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(response.headers["X-Frame-Options"], "SAMEORIGIN");
  assert.match(response.headers["Strict-Transport-Security"], /max-age=31536000/);
  assert.match(response.headers["Content-Security-Policy"], /default-src 'self'/);
});

function createJsonResponse() {
  return {
    headersSent: false,
    statusCode: 200,
    body: undefined,
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

function createRequest(options = {}) {
  const headers = {
    Host: options.host || "127.0.0.1:8080",
    Origin: options.origin ?? "http://127.0.0.1:8080",
    Referer: options.referer || "",
    "User-Agent": "node-test"
  };
  return {
    method: options.method || "POST",
    path: options.path || "/api/contact",
    headers,
    get(name) {
      return headers[name] || headers[name.toLowerCase()] || "";
    }
  };
}

function withSilencedConsoleError(callback) {
  const previous = console.error;
  console.error = () => {};
  try {
    return callback();
  } finally {
    console.error = previous;
  }
}

function withCapturedConsoleError(calls, callback) {
  const previous = console.error;
  console.error = (...args) => calls.push(args);
  try {
    return callback();
  } finally {
    console.error = previous;
  }
}

function withCapturedConsoleWarn(calls, callback) {
  const previous = console.warn;
  console.warn = (...args) => calls.push(args);
  try {
    return callback();
  } finally {
    console.warn = previous;
  }
}
