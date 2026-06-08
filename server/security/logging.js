const SENSITIVE_FIELDS = /pass|password|secret|token|captcha|cookie|authorization/i;

export function securityLog(event, req, details = {}) {
  const record = {
    level: "warn",
    event,
    at: new Date().toISOString(),
    ip: req?.ip || req?.socket?.remoteAddress || "",
    method: req?.method || "",
    path: req?.originalUrl || req?.url || req?.path || "",
    userAgent: req?.get?.("User-Agent") || req?.headers?.["user-agent"] || "",
    ...redact(details)
  };
  console.warn(JSON.stringify(record));
}

function redact(value) {
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_FIELDS.test(key) ? "[redacted]" : item
    ])
  );
}
