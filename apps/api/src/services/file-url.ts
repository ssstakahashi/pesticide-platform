import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../env';

export type FileAssetType = 'document' | 'image';

export type FileUrlSigner = {
  sign(type: FileAssetType, id: string): string;
  verify(type: FileAssetType, id: string, exp: number, sig: string): boolean;
};

/**
 * 保存ファイルへの署名付きURL。<img src> から直接読めるよう Bearer 認証の代わりに HMAC で保護する。
 * 失効時刻を TTL 単位で切り上げ、同じ時間帯は同じ URL になるようにしてブラウザキャッシュを効かせる。
 */
export function createFileUrlSigner(env: Pick<Env, 'FILE_URL_SECRET' | 'FILE_URL_TTL_SECONDS'>): FileUrlSigner {
  // 未設定（開発環境）の場合はプロセスごとの一時鍵。再起動すると発行済みURLは無効になる
  const secret = env.FILE_URL_SECRET ?? randomBytes(32).toString('hex');
  const ttl = env.FILE_URL_TTL_SECONDS;
  const mac = (type: string, id: string, exp: number) =>
    createHmac('sha256', secret).update(`${type}:${id}:${exp}`).digest('base64url');

  return {
    sign(type, id) {
      const now = Math.floor(Date.now() / 1000);
      const exp = (Math.floor(now / ttl) + 2) * ttl;
      return `/api/files/${type}/${id}?exp=${exp}&sig=${mac(type, id, exp)}`;
    },
    verify(type, id, exp, sig) {
      if (exp < Date.now() / 1000) return false;
      const expected = Buffer.from(mac(type, id, exp));
      const actual = Buffer.from(sig);
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },
  };
}
