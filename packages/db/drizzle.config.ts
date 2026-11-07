import { defineConfig } from 'drizzle-kit';
import { loadEnvFile, requireDatabaseUrl } from './src/env';

loadEnvFile();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: requireDatabaseUrl() },
  // agri DB は他プロジェクトと共有しているため、マイグレーション履歴は専用テーブルで管理する
  migrations: { schema: 'drizzle', table: '__pesticide_platform_migrations' },
  strict: true,
  verbose: true,
});
