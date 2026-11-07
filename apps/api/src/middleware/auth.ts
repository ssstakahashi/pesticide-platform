import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../env';

export type AuthPrincipal =
  { type: 'api_key'; keyIndex: number } | { type: 'firebase'; uid: string; email?: string } | { type: 'anonymous' };

export type AuthVariables = { principal: AuthPrincipal };

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

function findApiKey(token: string, apiKeys: string[]): number {
  const input = Buffer.from(token);
  return apiKeys.findIndex((key) => {
    const expected = Buffer.from(key);
    return expected.length === input.length && timingSafeEqual(expected, input);
  });
}

/**
 * システム間連携は APIキー（Bearer）、Web/モバイルからは Firebase Auth の ID トークンで認証する。
 */
export function bearerAuth(env: Pick<Env, 'AUTH_MODE' | 'API_KEYS' | 'FIREBASE_PROJECT_ID'>) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (env.AUTH_MODE === 'disabled') {
      c.set('principal', { type: 'anonymous' });
      return next();
    }

    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) return c.json({ error: '認証が必要です' }, 401);

    const keyIndex = findApiKey(token, env.API_KEYS);
    if (keyIndex >= 0) {
      c.set('principal', { type: 'api_key', keyIndex });
      return next();
    }

    if (env.FIREBASE_PROJECT_ID) {
      try {
        const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
          issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
          audience: env.FIREBASE_PROJECT_ID,
        });
        if (payload.sub) {
          c.set('principal', {
            type: 'firebase',
            uid: payload.sub,
            email: typeof payload.email === 'string' ? payload.email : undefined,
          });
          return next();
        }
      } catch {
        // 認証失敗として下で 401 を返す
      }
    }

    return c.json({ error: '認証に失敗しました' }, 401);
  });
}
