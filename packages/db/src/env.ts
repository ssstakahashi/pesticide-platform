import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvFile(dir: string = process.cwd()): void {
  const path = resolve(dir, '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL が設定されていません');
  return url;
}
