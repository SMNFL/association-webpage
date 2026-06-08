import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const EDITOR_COOKIE = "sukura_editor_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const normalized = String(password || "");
  if (normalized.length < 12) throw new Error("Admin password must contain at least 12 characters.");
  const derived = scryptSync(normalized, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export function verifyPassword(password, storedHash = "") {
  const [algorithm, salt, expectedHex] = String(storedHash).split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(expectedHex || "")) return false;
  const actual = scryptSync(String(password || ""), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertEditorSecurityEnv(env = process.env) {
  const missing = ["EDITOR_PASSWORD_HASH", "EDITOR_SESSION_SECRET"].filter((key) => !env[key]);
  if (env.EDITOR_LOCAL_ONLY !== "true") missing.push("EDITOR_LOCAL_ONLY=true");
  if (missing.length) {
    throw new Error(`Missing editor security configuration: ${missing.join(", ")}. Run npm run security:setup-editor.`);
  }
}

export function createEditorAuth(options = {}) {
  const passwordHash = options.passwordHash || process.env.EDITOR_PASSWORD_HASH;
  const sessionSecret = options.sessionSecret || process.env.EDITOR_SESSION_SECRET;
  const sessionTtlMs = Number(options.sessionTtlMs || SESSION_TTL_MS);
  const sessions = new Map();
  if (!passwordHash || !sessionSecret) throw new Error("Editor authentication requires a password hash and session secret.");

  function sessionFromRequest(req) {
    const signedToken = readCookie(req, EDITOR_COOKIE);
    const id = verifySignedToken(signedToken, sessionSecret);
    if (!id) return null;
    const session = sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(id);
      return null;
    }
    return session;
  }

  function requireAuth(req, res, next) {
    const session = sessionFromRequest(req);
    if (!session) return res.status(401).json({ ok: false, error: "Authentication required." });
    req.editorSession = session;
    return next();
  }

  function requirePageAuth(req, res, next) {
    if (!sessionFromRequest(req)) return res.redirect("/editor/login");
    return next();
  }

  function requireCsrf(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const session = req.editorSession || sessionFromRequest(req);
    if (!session || !sameOrigin(req) || !safeEqual(req.get("X-CSRF-Token"), session.csrfToken)) {
      return res.status(403).json({ ok: false, error: "Request verification failed." });
    }
    req.editorSession = session;
    return next();
  }

  function session(req, res) {
    const current = sessionFromRequest(req);
    res.set("Cache-Control", "no-store");
    if (!current) return res.status(401).json({ ok: false, authenticated: false });
    return res.json({ ok: true, authenticated: true, csrfToken: current.csrfToken, expiresAt: current.expiresAt });
  }

  function login(req, res) {
    res.set("Cache-Control", "no-store");
    if (!sameOrigin(req) || !verifyPassword(req.body?.password, passwordHash)) {
      options.onLoginFailure?.(req);
      return res.status(401).json({ ok: false, error: "Invalid administrator credentials." });
    }
    options.onLoginSuccess?.(req);
    const id = randomBytes(32).toString("base64url");
    const current = {
      id,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: Date.now() + sessionTtlMs
    };
    sessions.set(id, current);
    res.set("Set-Cookie", sessionCookie(signToken(id, sessionSecret), req));
    return res.json({ ok: true, authenticated: true, csrfToken: current.csrfToken, expiresAt: current.expiresAt });
  }

  function logout(req, res) {
    const signedToken = readCookie(req, EDITOR_COOKIE);
    const id = verifySignedToken(signedToken, sessionSecret);
    if (id) sessions.delete(id);
    res.set("Set-Cookie", clearSessionCookie(req));
    return res.json({ ok: true });
  }

  return { login, logout, requireAuth, requireCsrf, requirePageAuth, session, sessionFromRequest };
}

export function sameOrigin(req) {
  const origin = req.get?.("Origin");
  const host = req.get?.("Host");
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return url.host === host && ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function signToken(id, secret) {
  const signature = createHmac("sha256", secret).update(id).digest("base64url");
  return `${id}.${signature}`;
}

function verifySignedToken(value = "", secret) {
  const [id, signature] = String(value).split(".");
  if (!id || !signature) return "";
  const expected = createHmac("sha256", secret).update(id).digest("base64url");
  return safeEqual(signature, expected) ? id : "";
}

function safeEqual(left = "", right = "") {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const item of header.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function sessionCookie(value, req) {
  const secure = req.secure;
  return `${EDITOR_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(req) {
  const secure = req.secure;
  return `${EDITOR_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
