/**
 * Tiny in-memory sliding-window rate limiter.
 *
 * Good enough for a single-instance deployment (one Node process, which is what
 * SQLite implies anyway). If you ever scale horizontally, swap this for Redis.
 */

type Store = Map<string, number[]>;

const g = globalThis as unknown as { __tmRateLimit?: Store };
const store: Store = g.__tmRateLimit ?? (g.__tmRateLimit = new Map());

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/**
 * Record a hit for `key` and report whether it is within `limit` hits per `windowMs`.
 * Rejected hits are NOT recorded, so a throttled caller isn't punished further.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  if (limit <= 0) return { ok: true, retryAfterSec: 0 };

  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    store.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }

  hits.push(now);
  store.set(key, hits);
  if (store.size > 10_000) prune(now);
  return { ok: true, retryAfterSec: 0 };
}

/** Drop keys that haven't been touched for 10 minutes (longer than any window we use). */
function prune(now: number) {
  for (const [key, hits] of store) {
    if (hits.length === 0 || now - hits[hits.length - 1] > 10 * 60_000) store.delete(key);
  }
}

/** Best-effort client IP behind a reverse proxy (nginx, Caddy, Cloudflare…). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
