const TRUST_PROXY_VALUES = new Map([
  ["", false],
  ["false", false],
  ["0", false],
  ["loopback", "loopback"],
  ["private", "loopback, linklocal, uniquelocal"]
]);

export function parseTrustProxy(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!TRUST_PROXY_VALUES.has(normalized)) {
    throw new Error("Invalid TRUST_PROXY value. Use false, loopback, or private.");
  }
  return TRUST_PROXY_VALUES.get(normalized);
}

export function configureTrustProxy(app, env = process.env) {
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  app.set("trust proxy", trustProxy);
  return trustProxy;
}

export function sameOriginOrReferer(req) {
  const host = req.get?.("Host");
  if (!host) return false;
  const origin = req.get?.("Origin");
  if (origin) return urlMatchesHost(origin, host);
  const referer = req.get?.("Referer") || req.get?.("Referrer");
  return Boolean(referer && urlMatchesHost(referer, host));
}

export function hasForwardedHeaders(req) {
  return Boolean(
    req.get?.("Forwarded")
    || req.get?.("X-Forwarded-For")
    || req.get?.("X-Forwarded-Host")
    || req.get?.("X-Forwarded-Proto")
  );
}

function urlMatchesHost(value, host) {
  try {
    const url = new URL(value);
    return url.host === host && ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}
