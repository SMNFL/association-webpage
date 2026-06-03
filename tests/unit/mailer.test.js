import test from "node:test";
import assert from "node:assert/strict";
import { createTransportOptions } from "../../server/mailer.js";

test("SMTP port 587 uses STARTTLS settings", () => {
  const options = createTransportOptions({
    SMTP_HOST: "smtp.example.org",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_REQUIRE_TLS: "true",
    SMTP_USER: "user",
    SMTP_PASS: "pass"
  });

  assert.equal(options.port, 587);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.deepEqual(options.auth, { user: "user", pass: "pass" });
  assert.deepEqual(options.tls, { servername: "smtp.example.org" });
});

test("SMTP auth method can force LOGIN for providers that reject AUTH PLAIN", () => {
  const options = createTransportOptions({
    SMTP_HOST: "smtp.example.org",
    SMTP_PORT: "587",
    SMTP_AUTH_METHOD: "login",
    SMTP_TLS_SERVERNAME: "mail.example.org",
    SMTP_CLIENT_NAME: "sukura.local",
    SMTP_USER: "user",
    SMTP_PASS: "pass"
  });

  assert.equal(options.authMethod, "LOGIN");
  assert.equal(options.name, "sukura.local");
  assert.deepEqual(options.tls, { servername: "mail.example.org" });
});

test("SMTP auth method rejects unsupported values", () => {
  assert.throws(
    () => createTransportOptions({
      SMTP_HOST: "smtp.example.org",
      SMTP_AUTH_METHOD: "XOAUTH2"
    }),
    /SMTP_AUTH_METHOD/
  );
});

test("Gmail SMTP app passwords are trimmed and de-spaced", () => {
  const options = createTransportOptions({
    SMTP_HOST: " smtp.gmail.com ",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: " user@gmail.com ",
    SMTP_PASS: "abcd efgh ijkl mnop"
  });

  assert.equal(options.host, "smtp.gmail.com");
  assert.deepEqual(options.auth, { user: "user@gmail.com", pass: "abcdefghijklmnop" });
});

test("non-Gmail SMTP passwords keep internal spaces", () => {
  const options = createTransportOptions({
    SMTP_HOST: "smtp.example.org",
    SMTP_PORT: "587",
    SMTP_USER: "user",
    SMTP_PASS: " pass with spaces "
  });

  assert.deepEqual(options.auth, { user: "user", pass: "pass with spaces" });
});

test("Googlemail SMTP app passwords are also de-spaced", () => {
  const options = createTransportOptions({
    SMTP_HOST: "smtp.googlemail.com",
    SMTP_USER: "user@gmail.com",
    SMTP_PASS: "abcd efgh ijkl mnop"
  });

  assert.equal(options.auth.pass, "abcdefghijklmnop");
});

test("SMTP port 587 defaults to requiring STARTTLS", () => {
  const options = createTransportOptions({
    SMTP_HOST: "smtp.example.org",
    SMTP_PORT: "587",
    SMTP_SECURE: "false"
  });

  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
});

test("SMTP port 587 rejects implicit TLS", () => {
  assert.throws(
    () => createTransportOptions({
      SMTP_HOST: "smtp.example.org",
      SMTP_PORT: "587",
      SMTP_SECURE: "true"
    }),
    /port 587 uses STARTTLS/
  );
});

test("SMTP port 465 uses implicit TLS", () => {
  const options = createTransportOptions({
    SMTP_HOST: "smtp.example.org",
    SMTP_PORT: "465",
    SMTP_SECURE: "false"
  });

  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
});
