import { createMiddleware } from 'hono/factory';
import { getConnInfo } from '@hono/node-server/conninfo';

type Bucket = { count: number; resetAt: number };

/**
 * 単一プロセス向けの固定ウィンドウ方式レートリミット。
 * PM2 でクラスタ化する場合はプロセスごとの上限になる点に注意（厳密に制御するなら Cloudflare の Rate Limiting Rules を併用）。
 */
export function rateLimit({ limit, windowMs = 60_000 }: { limit: number; windowMs?: number }) {
  const buckets = new Map<string, Bucket>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, windowMs).unref();

  return createMiddleware(async (c, next) => {
    // Cloudflare Tunnel 経由ではクライアントIPは CF-Connecting-IP に入る
    const ip = c.req.header('CF-Connecting-IP') ?? getConnInfo(c).remote.address ?? 'unknown';
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;

    c.header('RateLimit-Limit', String(limit));
    c.header('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    c.header('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > limit) {
      return c.json({ error: 'リクエストが多すぎます。しばらくしてから再度お試しください' }, 429);
    }
    return next();
  });
}
