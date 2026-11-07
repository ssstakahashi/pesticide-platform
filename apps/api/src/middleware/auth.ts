import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../env';

export type FirebasePrincipal = { type: 'firebase'; uid: string; email?: string; isAnonymous: boolean };

export type AuthPrincipal = { type: 'api_key'; keyIndex: number } | FirebasePrincipal | { type: 'dev' };

export type AuthVariables = { principal: AuthPrincipal };
export type UserVariables = { principal: FirebasePrincipal };

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/** ローカル開発（AUTH_MODE=disabled）で /api/me/* を使うときの固定ユーザー */
const DEV_USER: FirebasePrincipal = { type: 'firebase', uid: 'dev-user', isAnonymous: false };

function findApiKey(token: string, apiKeys: string[]): number {
  const input = Buffer.from(token);
  return apiKeys.findIndex((key) => {
    const expected = Buffer.from(key);
    return expected.length === input.length && timingSafeEqual(expected, input);
  });
}

function readBearer(header: string | undefined): string {
  const value = header ?? '';
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : '';
}

/** Firebase Auth の ID トークンを検証する。不正なら null */
export async function verifyFirebaseToken(token: string, projectId: string): Promise<FirebasePrincipal | null> {
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (!payload.sub) return null;
    const firebase = payload.firebase as { sign_in_provider?: unknown } | undefined;
    return {
      type: 'firebase',
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      isAnonymous: firebase?.sign_in_provider === 'anonymous',
    };
  } catch {
    return null;
  }
}

/**
 * システム間連携は APIキー（Bearer）、Web/モバイルからは Firebase Auth の ID トークンで認証する。
 * 匿名ログインのユーザーも通るため、管理系は requireAdmin を併用する。
 */
export function bearerAuth(env: Pick<Env, 'AUTH_MODE' | 'API_KEYS' | 'FIREBASE_PROJECT_ID'>) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (env.AUTH_MODE === 'disabled') {
      c.set('principal', { type: 'dev' });
      return next();
    }

    const token = readBearer(c.req.header('Authorization'));
    if (!token) return c.json({ error: '認証が必要です' }, 401);

    const keyIndex = findApiKey(token, env.API_KEYS);
    if (keyIndex >= 0) {
      c.set('principal', { type: 'api_key', keyIndex });
      return next();
    }

    if (env.FIREBASE_PROJECT_ID) {
      const principal = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
      if (principal) {
        c.set('principal', principal);
        return next();
      }
    }

    return c.json({ error: '認証に失敗しました' }, 401);
  });
}

/** bearerAuth の後に置く。APIキーか ADMIN_UIDS に含まれる登録済みユーザーだけを通す */
export function requireAdmin(env: Pick<Env, 'ADMIN_UIDS'>) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const principal = c.get('principal');
    const allowed =
      principal.type === 'dev' ||
      principal.type === 'api_key' ||
      (principal.type === 'firebase' && !principal.isAnonymous && env.ADMIN_UIDS.includes(principal.uid));
    if (!allowed) return c.json({ error: 'この操作を行う権限がありません' }, 403);
    return next();
  });
}

/** bearerAuth の後に置く。Firebase のユーザー（匿名を含む）だけを通す */
export function requireUser() {
  return createMiddleware<{ Variables: UserVariables }>(async (c, next) => {
    const principal = c.get('principal') as AuthPrincipal;
    if (principal.type === 'dev') {
      c.set('principal', DEV_USER);
      return next();
    }
    if (principal.type !== 'firebase') return c.json({ error: 'ユーザーとしてのログインが必要です' }, 403);
    return next();
  });
}
