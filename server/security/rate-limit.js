export function createMemoryRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || 15 * 60 * 1000);
  const max = Number(options.max || 5);
  const entries = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = String(options.key?.(req) || req.ip || req.socket?.remoteAddress || "unknown");
    const current = entries.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    entry.count += 1;
    entries.set(key, entry);
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.set("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ ok: false, error: options.message || "Too many requests. Please try again later." });
    }

    return next();
  };
}
