import type { Context, Env as HonoEnv } from 'hono';
import { createMiddleware } from 'hono/factory';
import { getConnInfo } from '@hono/node-server/conninfo';

type Bucket = { count: number; resetAt: number };

/**
 * 単一プロセス向けの固定ウィンドウ方式レートリミット。
 * PM2 でクラスタ化する場合はプロセスごとの上限になる点に注意（厳密に制御するなら Cloudflare の Rate Limiting Rules を併用）。
 */
export function rateLimit<E extends HonoEnv = HonoEnv>({
  limit,
  windowMs = 60_000,
  key,
}: {
  limit: number;
  windowMs?: number;
  /** 省略時はクライアントIP単位 */
  key?: (c: Context<E>) => string;
}) {
  const buckets = new Map<string, Bucket>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, windowMs).unref();

  return createMiddleware<E>(async (c, next) => {
    // Cloudflare Tunnel 経由ではクライアントIPは CF-Connecting-IP に入る
    const id = key ? key(c) : (c.req.header('CF-Connecting-IP') ?? getConnInfo(c).remote.address ?? 'unknown');
    const now = Date.now();
    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
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
