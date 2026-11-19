// Best-effort, in-memory token-bucket rate limiting.
//
// Buckets live in this server instance's memory, so the limit is per instance:
// when a host runs several instances at once, a client can get a few times the
// limit. For a hard limit, also add a platform rule (e.g. a Vercel Firewall
// rate-limit rule on /api/music/*/search).

export interface RateLimit {
  /** Requests allowed back to back. */
  burst: number;
  /** Milliseconds to earn back one request. */
  refillMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const MAX_BUCKETS = 10_000;
const buckets = new Map<string, Bucket>();

/**
 * Spends one request from `key`'s bucket. Returns 0 when the request is
 * allowed, otherwise the number of seconds until it would be.
 */
export function rateLimit(key: string, { burst, refillMs }: RateLimit, now = Date.now()): number {
  const prev = buckets.get(key);
  const tokens = prev ? Math.min(burst, prev.tokens + (now - prev.updatedAt) / refillMs) : burst;
  if (tokens < 1) return Math.ceil(((1 - tokens) * refillMs) / 1000);

  // Re-insert so the map stays ordered by last use, then drop the stalest bucket if over the cap.
  buckets.delete(key);
  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  if (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
  return 0;
}

/**
 * The client's IP as reported by the reverse proxy in front of the app.
 * Vercel sets these headers itself; without such a proxy, clients can spoof them.
 */
export function clientIp(request: Request): string {
  const h = request.headers;
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
