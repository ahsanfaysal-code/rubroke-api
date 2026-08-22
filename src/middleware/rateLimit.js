// Lightweight in-memory rate limiter (no external dependency).
// Tracks hits per key (IP by default) in a sliding window. Suitable for a single
// Node instance (Render free tier runs one instance). For multi-instance
// deployments, swap this for a Redis-backed limiter.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function createRateLimiter({ windowMs = WINDOW_MS, max = 10, message = 'Too many requests, please try again later.' } = {}) {
  const hits = new Map(); // key -> array of timestamps

  // Periodic cleanup so the Map doesn't grow unbounded.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, arr] of hits) {
      const recent = arr.filter((t) => now - t < windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref();

  return function rateLimit(req, res, next) {
    const key = (req.ip || req.headers['x-forwarded-for'] || 'unknown') + ':' + (req.routeKey || req.originalUrl);
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);

    const remaining = max - arr.length;
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, remaining)));

    if (arr.length > max) {
      const oldest = arr[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, message });
    }
    next();
  };
}

module.exports = { createRateLimiter };
