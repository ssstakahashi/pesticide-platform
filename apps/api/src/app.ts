import { swaggerUI } from '@hono/swagger-ui';
import { BEARER_SECURITY_SCHEME } from '@pesticide/api-contract';
import type { Database } from '@pesticide/db';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './env';
import { bearerAuth } from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';
import { createRouter } from './router';
import { collectionAdminRoutes } from './routes/admin';
import { filesRoutes } from './routes/files';
import { cropsRoutes, pestsRoutes } from './routes/masters';
import { pesticidesRoutes } from './routes/pesticides';
import { verifyRoutes } from './routes/verify';
import { createFileUrlSigner } from './services/file-url';

export function createApp({ db, env }: { db: Database; env: Env }) {
  const app = createRouter();

  app.use('*', logger());
  const defaultSecureHeaders = secureHeaders();
  // 保存ファイルは Firebase Hosting など別オリジンの <img>/<a> から読まれるため CORP を緩める
  const fileSecureHeaders = secureHeaders({ crossOriginResourcePolicy: 'cross-origin' });
  app.use('*', (c, next) =>
    c.req.path.startsWith('/api/files/') ? fileSecureHeaders(c, next) : defaultSecureHeaders(c, next),
  );
  app.use(
    '/api/*',
    cors({
      origin: env.CORS_ORIGINS,
      allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  const searchLimiter = rateLimit({ limit: env.RATE_LIMIT_PER_MINUTE });
  app.use('/api/pesticides/*', searchLimiter);
  app.use('/api/crops/*', searchLimiter);
  app.use('/api/pests/*', searchLimiter);
  app.use('/api/files/*', searchLimiter);
  app.use('/api/verify/*', bearerAuth(env));
  app.use('/api/verify', bearerAuth(env));
  app.use('/api/admin/*', bearerAuth(env));

  const signer = createFileUrlSigner(env);

  app.openAPIRegistry.registerComponent('securitySchemes', BEARER_SECURITY_SCHEME, {
    type: 'http',
    scheme: 'bearer',
    description: 'APIキー、または Firebase Auth の ID トークン',
  });

  const routes = app
    .get('/health', (c) => c.json({ status: 'ok' as const }, 200))
    .route('/api/pesticides', pesticidesRoutes(db, signer))
    .route('/api/crops', cropsRoutes(db))
    .route('/api/pests', pestsRoutes(db))
    .route('/api/verify', verifyRoutes(db))
    .route('/api/files', filesRoutes(db, signer, env.STORAGE_DIR))
    .route('/api/admin/collection', collectionAdminRoutes(db, signer));

  app.doc31('/doc', {
    openapi: '3.1.0',
    info: {
      title: 'Pesticide Platform API',
      version: '0.1.0',
      description: 'FAMIC 農薬登録情報にもとづく農薬検索・使用回数検証 API',
    },
  });
  app.get('/ui', swaggerUI({ url: '/doc' }));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: 'サーバーエラーが発生しました' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Not Found' }, 404));

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
