import nodemailer from "nodemailer";

export function createTransportFromEnv(env = process.env) {
  return nodemailer.createTransport(createTransportOptions(env));
}

export function createTransportOptions(env = process.env) {
  const host = cleanEnvValue(env.SMTP_HOST);
  const port = Number(env.SMTP_PORT || 587);
  const secureSetting = String(env.SMTP_SECURE || "").toLowerCase();
  const requireTlsSetting = String(env.SMTP_REQUIRE_TLS || "").toLowerCase();
  const authMethod = cleanEnvValue(env.SMTP_AUTH_METHOD).toUpperCase();
  if (port === 587 && secureSetting === "true") {
    throw new Error("Invalid SMTP configuration: port 587 uses STARTTLS with SMTP_SECURE=false. Use port 465 for implicit TLS.");
  }
  if (authMethod && !["PLAIN", "LOGIN", "CRAM-MD5"].includes(authMethod)) {
    throw new Error("Invalid SMTP configuration: SMTP_AUTH_METHOD must be PLAIN, LOGIN, or CRAM-MD5.");
  }
  const secure = port === 465 || secureSetting === "true";
  const requireTLS = requireTlsSetting
    ? ["1", "true", "yes"].includes(requireTlsSetting)
    : port === 587;
  const options = {
    host,
    port,
    secure,
    requireTLS,
    name: cleanEnvValue(env.SMTP_CLIENT_NAME) || undefined,
    tls: {
      servername: cleanEnvValue(env.SMTP_TLS_SERVERNAME) || host
    },
    auth: env.SMTP_USER && env.SMTP_PASS
      ? {
          user: cleanEnvValue(env.SMTP_USER),
          pass: normalizeSmtpPassword(env.SMTP_PASS, host)
        }
      : undefined
  };
  if (authMethod) options.authMethod = authMethod;
  return options;
}

export function assertMailEnv(env = process.env) {
  const missing = ["SMTP_HOST", "SMTP_FROM", "CONTACT_TO"].filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing mail configuration: ${missing.join(", ")}`);
  }
}

function cleanEnvValue(value = "") {
  return String(value || "").trim();
}

function normalizeSmtpPassword(value = "", host = "") {
  const password = cleanEnvValue(value);
  if (/(^|\.)g(?:oogle)?mail\.com$/i.test(host)) {
    return password.replace(/\s+/g, "");
  }
  return password;
}
