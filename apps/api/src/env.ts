import { z } from 'zod';
import { loadEnvFile } from '@pesticide/db';

loadEnvFile();

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().default(8790),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGINS: csv,
    AUTH_MODE: z.enum(['required', 'disabled']).default('required'),
    API_KEYS: csv,
    FIREBASE_PROJECT_ID: z.string().optional(),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
    STORAGE_DIR: z.string().min(1).optional(),
    FILE_URL_SECRET: z.string().min(32, 'FILE_URL_SECRET は32文字以上にしてください').optional(),
    FILE_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.AUTH_MODE === 'disabled') {
      ctx.addIssue({ code: 'custom', message: '本番環境で AUTH_MODE=disabled は使用できません' });
    }
    if (env.NODE_ENV === 'production' && (!env.STORAGE_DIR || !env.FILE_URL_SECRET)) {
      ctx.addIssue({ code: 'custom', message: '本番環境では STORAGE_DIR と FILE_URL_SECRET を設定してください' });
    }
    if (env.AUTH_MODE === 'required' && env.API_KEYS.length === 0 && !env.FIREBASE_PROJECT_ID) {
      ctx.addIssue({
        code: 'custom',
        message: 'AUTH_MODE=required の場合は API_KEYS か FIREBASE_PROJECT_ID を設定してください',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`環境変数が不正です:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
