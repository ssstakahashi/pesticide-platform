import { z } from 'zod';

const ConfigSchema = z.object({
  STORAGE_DIR: z.string().min(1, 'STORAGE_DIR を設定してください'),
  SEARCH_PROVIDER: z.enum(['none', 'google_cse', 'brave']).default('none'),
  GOOGLE_CSE_API_KEY: z.string().optional(),
  GOOGLE_CSE_CX: z.string().optional(),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  COLLECTOR_USER_AGENT: z.string().default('PesticidePlatformBot/0.1'),
  COLLECTOR_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  COLLECTOR_CRON: z.string().default('15 * * * *'),
  COLLECTOR_RECHECK_DAYS: z.coerce.number().int().positive().default(30),
  COLLECTOR_HOST_INTERVAL_MS: z.coerce.number().int().nonnegative().default(3000),
  AUTO_APPROVE_SCORE: z.coerce.number().int().min(1).max(100).default(90),
});

export type CollectorConfig = z.infer<typeof ConfigSchema>;

export function parseCollectorConfig(source: NodeJS.ProcessEnv = process.env): CollectorConfig {
  const result = ConfigSchema.safeParse(source);
  if (!result.success) throw new Error(`環境変数が不正です:\n${z.prettifyError(result.error)}`);
  return result.data;
}
