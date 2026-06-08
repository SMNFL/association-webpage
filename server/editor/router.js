import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveEvent,
  deleteEvent,
  editableRegistry,
  listMedia,
  normalizeEvent,
  readContent,
  readContentKey,
  readEvents,
  resolveEditablePath,
  saveEvents,
  saveUploadedMedia,
  writeContentKey
} from "./content-store.js";
import { createEditorAuth } from "../security/editor-auth.js";
import { createMemoryRateLimiter, createProgressiveLoginGuard } from "../security/rate-limit.js";
import { securityLog } from "../security/logging.js";
import { hasForwardedHeaders } from "../security/request-policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(__dirname, "../../ui-web-edit-tool");

export function createEditorRouter(rootDir, options = {}) {
  const router = express.Router();
  const loginGuard = createProgressiveLoginGuard({
    windowMs: 15 * 60 * 1000,
    threshold: 5,
    baseLockMs: 60 * 1000,
    maxLockMs: 15 * 60 * 1000,
    message: "Too many login attempts. Please wait before trying again.",
    onBlocked: (req) => securityLog("editor_login_lockout_blocked", req),
    onLocked: (req) => securityLog("editor_login_lockout_started", req)
  });
  const auth = options.auth || createEditorAuth({
    ...options,
    onLoginFailure: (req) => {
      loginGuard.recordFailure(req);
      securityLog("editor_login_failed", req);
    },
    onLoginSuccess: (req) => loginGuard.recordSuccess(req)
  });
  const globalLoginLimiter = createMemoryRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    key: () => "global",
    message: "Too many login attempts. Please wait before trying again.",
    onLimit: (req) => securityLog("editor_login_global_rate_limited", req)
  });
  const loginLimiter = createMemoryRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many login attempts. Please wait before trying again.",
    onLimit: (req) => securityLog("editor_login_rate_limited", req)
  });
  const editorApiLimiter = createMemoryRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 180,
    message: "Too many editor requests. Please try again later.",
    onLimit: (req) => securityLog("editor_api_rate_limited", req)
  });
  const uploadLimiter = createMemoryRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 12,
    message: "Too many uploads. Please try again later.",
    onLimit: (req) => securityLog("editor_upload_rate_limited", req)
  });

  router.use(requireLocalhost);
  router.use((req, res, next) => {
    if (req.path.startsWith("/editor") || req.path.startsWith("/api/editor")) {
      res.set("Cache-Control", "no-store");
    }
    next();
  });

  router.get("/api/editor/auth/session", auth.session);
  router.post("/api/editor/auth/login", globalLoginLimiter, loginLimiter, loginGuard.middleware, auth.login);
  router.post("/api/editor/auth/logout", auth.requireAuth, auth.requireCsrf, auth.logout);

  router.get("/editor/login", (req, res) => {
    if (auth.sessionFromRequest(req)) return res.redirect("/editor/");
    return res.sendFile(path.join(uiDir, "login.html"));
  });

  router.get("/editor/login.js", (req, res) => res.sendFile(path.join(uiDir, "login.js")));
  router.get("/editor/styles.css", (req, res) => res.sendFile(path.join(uiDir, "styles.css")));

  router.use("/api/editor", auth.requireAuth, auth.requireCsrf);
  router.use("/api/editor/media/upload", uploadLimiter);
  router.use("/api/editor", editorApiLimiter);

  router.get("/api/editor/health", (req, res) => {
    res.json({ ok: true, mode: "editor" });
  });

  router.get("/api/editor/registry", (req, res) => {
    res.json({ editable: editableRegistry() });
  });

  router.get("/api/editor/content", async (req, res, next) => {
    try {
      res.json({
        editable: editableRegistry(),
        content: await readContent(rootDir)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/editor/content/:key", async (req, res, next) => {
    try {
      res.json({
        key: req.params.key,
        path: path.relative(rootDir, resolveEditablePath(rootDir, req.params.key)),
        content: await readContentKey(rootDir, req.params.key)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/api/editor/content/:key", async (req, res, next) => {
    try {
      const content = await writeContentKey(rootDir, req.params.key, req.body?.content);
      res.json({ ok: true, key: req.params.key, content });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/editor/events", async (req, res, next) => {
    try {
      res.json({ events: await readEvents(rootDir) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/editor/events", async (req, res, next) => {
    try {
      const events = await readEvents(rootDir);
      const event = normalizeEvent(req.body?.event || {}, events, { existingId: "" });
      const saved = await saveEvents(rootDir, [event, ...events]);
      res.status(201).json({ ok: true, event: saved.find((item) => item.id === event.id), events: saved });
    } catch (error) {
      next(error);
    }
  });

  router.put("/api/editor/events/:id", async (req, res, next) => {
    try {
      const events = await readEvents(rootDir);
      const index = events.findIndex((event) => event.id === req.params.id || event.slug === req.params.id);
      if (index === -1) return res.status(404).json({ ok: false, error: "Event not found." });
      const existingId = events[index].id || events[index].slug;
      const event = normalizeEvent({ ...events[index], ...req.body?.event, id: existingId }, events, { existingId });
      const nextEvents = [...events];
      nextEvents[index] = event;
      const saved = await saveEvents(rootDir, nextEvents);
      return res.json({ ok: true, event, events: saved });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/editor/events/:id/archive", async (req, res, next) => {
    try {
      const events = await readEvents(rootDir);
      const index = events.findIndex((event) => event.id === req.params.id || event.slug === req.params.id);
      if (index === -1) return res.status(404).json({ ok: false, error: "Event not found." });
      const archived = archiveEvent(events[index]);
      const nextEvents = [...events];
      nextEvents[index] = archived;
      const saved = await saveEvents(rootDir, nextEvents);
      return res.json({ ok: true, event: archived, events: saved });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/api/editor/events/:id", async (req, res, next) => {
    try {
      const events = await readEvents(rootDir);
      const result = await deleteEvent(rootDir, events, req.params.id);
      return res.json({ ok: true, event: result.deleted, events: result.events });
    } catch (error) {
      next(error);
    }
  });

  router.get("/api/editor/media", async (req, res, next) => {
    try {
      res.json({ media: await listMedia(rootDir) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/api/editor/media/upload", async (req, res, next) => {
    try {
      const media = await saveUploadedMedia(rootDir, req.body || {});
      res.status(201).json({ ok: true, media });
    } catch (error) {
      next(error);
    }
  });

  router.use("/editor", auth.requirePageAuth, express.static(uiDir, { extensions: ["html"] }));

  router.get("/editor", auth.requirePageAuth, (req, res) => {
    res.sendFile(path.join(uiDir, "index.html"));
  });

  router.use((error, req, res, next) => {
    const status = error.status || 500;
    res.status(status).json({
      ok: false,
      error: status >= 500 && process.env.NODE_ENV === "production" ? "Editor server error." : error.message,
      errors: error.errors || undefined
    });
  });

  return router;
}

export function requireLocalhost(req, res, next) {
  if (hasForwardedHeaders(req)) {
    securityLog("editor_forwarded_request_blocked", req);
    return res.status(403).json({ ok: false, error: "Editor is available through direct local access only." });
  }
  const address = req.ip || req.socket?.remoteAddress || "";
  const allowed = address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1"
    || (process.env.EDITOR_ALLOW_DOCKER_BRIDGE === "1" && isPrivateDockerBridgeAddress(address));
  if (!allowed) {
    securityLog("editor_remote_request_blocked", req);
    return res.status(403).json({ ok: false, error: "Editor is available on localhost only." });
  }
  return next();
}

function isPrivateDockerBridgeAddress(address = "") {
  const normalized = String(address).replace(/^::ffff:/, "");
  const parts = normalized.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}
