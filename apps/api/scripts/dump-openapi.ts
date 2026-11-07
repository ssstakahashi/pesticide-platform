import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Database } from '@pesticide/db';
import { createApp } from '../src/app';

const app = createApp({
  db: {} as Database,
  env: {
    NODE_ENV: 'development',
    PORT: 0,
    DATABASE_URL: 'unused',
    CORS_ORIGINS: [],
    AUTH_MODE: 'disabled',
    API_KEYS: [],
    RATE_LIMIT_PER_MINUTE: 1,
    FILE_URL_TTL_SECONDS: 3600,
  },
});

const res = await app.request('/doc');
const out = resolve(import.meta.dirname, '../openapi.json');
writeFileSync(out, `${JSON.stringify(await res.json(), null, 2)}\n`);
console.log(`wrote ${out}`);
process.exit(0);
