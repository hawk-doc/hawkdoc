import type { Request, Response, NextFunction, RequestHandler } from 'express';

interface RateLimitOptions {
  /** Requests allowed per client within one window */
  max: number;
  windowMs: number;
  /** Injectable clock, for tests */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, in-memory limiter keyed by client IP. It exists to slow down
 * password guessing on the auth routes; each bcrypt compare is also expensive
 * CPU, so unthrottled logins double as a cheap way to tie the server up.
 *
 * State is per process. Behind a load balancer each instance counts on its own,
 * so the effective limit is `max` times the instance count — good enough as a
 * brake, not as a quota. Behind a reverse proxy set Express's `trust proxy`,
 * or every client shares the proxy's address.
 */
export function createRateLimiter({ max, windowMs, now = Date.now }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  let nextSweep = now() + windowMs;

  return (req: Request, res: Response, next: NextFunction): void => {
    const time = now();

    // Drop expired buckets once per window so the map can't grow without bound
    if (time >= nextSweep) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= time) buckets.delete(key);
      }
      nextSweep = time + windowMs;
    }

    const key = req.ip ?? 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      bucket = { count: 0, resetAt: time + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - time) / 1000))));
      res.status(429).json({ error: 'Too many attempts, try again later' });
      return;
    }
    next();
  };
}
