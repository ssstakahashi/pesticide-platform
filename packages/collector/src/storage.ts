import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export type AssetKind = 'documents' | 'images';

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** STORAGE_DIR 配下の相対パスを絶対パスに解決する（ディレクトリトラバーサルを拒否） */
export function resolveStoragePath(storageDir: string, storagePath: string): string {
  const root = resolve(storageDir);
  const full = resolve(root, storagePath);
  const rel = relative(root, full);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`不正な保存パスです: ${storagePath}`);
  return full;
}

/** pesticides/{登録番号}/{documents|images}/{sha256}.{ext} に保存し、相対パスを返す */
export async function saveAsset(
  storageDir: string,
  registrationNumber: string,
  kind: AssetKind,
  data: Uint8Array,
  ext: string,
): Promise<{ storagePath: string; sha256: string }> {
  const hash = sha256(data);
  const storagePath = `pesticides/${registrationNumber}/${kind}/${hash}.${ext}`;
  const full = resolveStoragePath(storageDir, storagePath);
  await mkdir(dirname(full), { recursive: true });
  const tmp = `${full}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, full);
  return { storagePath, sha256: hash };
}
