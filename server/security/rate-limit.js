/**
 * Removes expired entries. Runs at most once per window so the cost stays O(entries / window).
 * @param {Map<string, { resetAt: number, lockUntil?: number }>} entries
 * @param {number} time
 */
function sweepExpired(entries, time) {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= time && !(entry.lockUntil > time)) entries.delete(key);
  }
}

function createSweeper(entries, windowMs) {
  let nextSweepAt = 0;
  return (time) => {
    if (time < nextSweepAt) return;
    sweepExpired(entries, time);
    nextSweepAt = time + windowMs;
  };
}

export function createMemoryRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || 15 * 60 * 1000);
  const max = Number(options.max || 5);
  const now = options.now || (() => Date.now());
  const entries = new Map();
  const sweep = createSweeper(entries, windowMs);

  function rateLimit(req, res, next) {
    const time = now();
    sweep(time);
    const key = String(options.key?.(req) || req.ip || req.socket?.remoteAddress || "unknown");
    const current = entries.get(key);
    const entry = !current || current.resetAt <= time
      ? { count: 0, resetAt: time + windowMs }
      : current;

    entry.count += 1;
    entries.set(key, entry);
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.set("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - time) / 1000)));
      options.onLimit?.(req, entry);
      return res.status(429).json({ ok: false, error: options.message || "Too many requests. Please try again later." });
    }

    return next();
  }

  rateLimit.size = () => entries.size;
  return rateLimit;
}

export function createProgressiveLoginGuard(options = {}) {
  const threshold = Number(options.threshold || 5);
  const windowMs = Number(options.windowMs || 15 * 60 * 1000);
  const baseLockMs = Number(options.baseLockMs || 60 * 1000);
  const maxLockMs = Number(options.maxLockMs || 15 * 60 * 1000);
  const now = options.now || (() => Date.now());
  const entries = new Map();
  const sweep = createSweeper(entries, windowMs);

  function keyFor(req) {
    return String(options.key?.(req) || req.ip || req.socket?.remoteAddress || "unknown");
  }

  function entryFor(key) {
    const time = now();
    sweep(time);
    const current = entries.get(key);
    if (!current || current.resetAt <= time) {
      const fresh = { count: 0, resetAt: time + windowMs, lockUntil: 0 };
      entries.set(key, fresh);
      return fresh;
    }
    return current;
  }

  function middleware(req, res, next) {
    const key = keyFor(req);
    const entry = entryFor(key);
    const time = now();
    if (entry.lockUntil > time) {
      const retryAfter = Math.ceil((entry.lockUntil - time) / 1000);
      res.set("Retry-After", String(retryAfter));
      options.onBlocked?.(req, entry);
      return res.status(429).json({ ok: false, error: options.message || "Too many attempts. Please try again later." });
    }
    return next();
  }

  function recordFailure(req) {
    const key = keyFor(req);
    const entry = entryFor(key);
    entry.count += 1;
    if (entry.count >= threshold) {
      const exponent = Math.max(0, entry.count - threshold);
      entry.lockUntil = now() + Math.min(maxLockMs, baseLockMs * (2 ** exponent));
      options.onLocked?.(req, entry);
    }
  }

  function recordSuccess(req) {
    entries.delete(keyFor(req));
  }

  return { middleware, recordFailure, recordSuccess, size: () => entries.size };
}
