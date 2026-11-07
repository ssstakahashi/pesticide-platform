import type { AppType } from '@pesticide/api/rpc';
import { hc } from 'hono/client';

type TokenProvider = () => Promise<string | null> | string | null;

let tokenProvider: TokenProvider = () => null;

/** Firebase Auth 導入時に `setAuthTokenProvider(() => auth.currentUser?.getIdToken() ?? null)` を設定する */
export function setAuthTokenProvider(provider: TokenProvider) {
  tokenProvider = provider;
}

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8790';

/** API が返す署名付きファイルパス（/api/files/...）を絶対URLにする */
export const toApiUrl = (path: string) => new URL(path, API_BASE_URL).href;

export const api = hc<AppType>(API_BASE_URL, {
  headers: async (): Promise<Record<string, string>> => {
    const token = await tokenProvider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** 2xx 以外を ApiError に変換し、成功時のレスポンス型だけを返す */
export async function unwrap<T extends { ok: boolean; status: number; json(): Promise<unknown> }>(
  res: T,
): Promise<Awaited<ReturnType<Extract<T, { ok: true }>['json']>>> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `APIエラー (${res.status})`, res.status);
  }
  return res.json() as Promise<Awaited<ReturnType<Extract<T, { ok: true }>['json']>>>;
}
