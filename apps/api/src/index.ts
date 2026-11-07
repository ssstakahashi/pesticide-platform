import { serve } from '@hono/node-server';
import { createDb } from '@pesticide/db';
import { createApp } from './app';
import { parseEnv } from './env';

const env = parseEnv();
const { db, pool } = createDb(env.DATABASE_URL);
const app = createApp({ db, env });

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`API listening on http://${info.address}:${info.port} (docs: /ui)`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
