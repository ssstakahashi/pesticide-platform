import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { getFileRoute } from '@pesticide/api-contract';
import { resolveStoragePath } from '@pesticide/collector/storage';
import type { Database } from '@pesticide/db';
import { createRouter } from '../router';
import { findStoredFile } from '../services/collection';
import type { FileUrlSigner } from '../services/file-url';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const filesRoutes = (db: Database, signer: FileUrlSigner, storageDir: string | undefined) =>
  createRouter().openapi(getFileRoute, async (c) => {
    const { type, id } = c.req.valid('param');
    const { exp, sig } = c.req.valid('query');
    if (!signer.verify(type, id, exp, sig)) return c.json({ error: 'URLが不正、または有効期限が切れています' }, 403);
    if (!storageDir) return c.json({ error: 'ファイル保存先が設定されていません' }, 404);

    const file = await findStoredFile(db, type, id);
    if (!file || !ALLOWED_TYPES.has(file.contentType)) return c.json({ error: 'ファイルが見つかりません' }, 404);

    const fullPath = resolveStoragePath(storageDir, file.storagePath);
    const info = await stat(fullPath).catch(() => null);
    if (!info?.isFile()) return c.json({ error: 'ファイルが見つかりません' }, 404);

    const etag = `"${file.sha256}"`;
    const headers: Record<string, string> = {
      'Content-Type': file.contentType,
      'Cache-Control': `private, max-age=${Math.max(0, Math.floor(exp - Date.now() / 1000))}, immutable`,
      ETag: etag,
    };
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304, headers);

    const ext = file.contentType === 'application/pdf' ? 'pdf' : file.contentType.split('/')[1];
    headers['Content-Length'] = String(info.size);
    headers['Content-Disposition'] = `inline; filename="${file.registrationNumber}-${type}-${id.slice(0, 8)}.${ext}"`;
    const stream = Readable.toWeb(createReadStream(fullPath)) as ReadableStream<Uint8Array>;
    return c.body(stream, 200, headers);
  });
