/**
 * Rate limiting with an optional Upstash Redis backend.
 *
 * When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set, counters are
 * shared across serverless instances. Otherwise it falls back to an in-memory
 * fixed window (best effort per instance).
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > 5_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0, remaining: limit - bucket.count };
}

function redisConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  return url && token ? { url, token } : null;
}

/** Async variant used by server actions; uses Upstash when configured. */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const config = redisConfig();
  if (!config) return memoryLimit(key, limit, windowMs);

  const prefix = "sfe:rl:";
  const ttl = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", `${prefix}${key}`],
        ["EXPIRE", `${prefix}${key}`, ttl],
      ]),
    });
    if (!response.ok) throw new Error(`Upstash status ${response.status}`);
    const payload = (await response.json()) as Array<{ result?: number | string | null; error?: string }>;
    const count = Number(payload[0]?.result ?? 0);
    if (!Number.isFinite(count)) throw new Error("Invalid Upstash INCR result");
    if (count === 1) return { ok: true, retryAfterSeconds: 0, remaining: limit - 1 };
    if (count > limit) {
      return {
        ok: false,
        retryAfterSeconds: ttl,
        remaining: 0,
      };
    }
    return { ok: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - count) };
  } catch (error) {
    console.error("[rate-limit] Upstash failed, using memory fallback:", error);
    return memoryLimit(key, limit, windowMs);
  }
}

/** Synchronous variant for code paths that cannot await. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  return memoryLimit(key, limit, windowMs);
}
