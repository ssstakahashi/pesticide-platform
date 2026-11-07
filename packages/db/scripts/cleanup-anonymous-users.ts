import { parseArgs } from 'node:util';
import { createDb } from '../src/client';
import { loadEnvFile, requireDatabaseUrl } from '../src/env';
import { sql } from 'drizzle-orm';

/**
 * 記録の無い匿名ユーザーを app_users から削除する
 *   pnpm users:cleanup -- [--days 90] [--dry-run]
 * Firebase Auth 側の匿名アカウントは削除しない。
 */
export async function runCleanupAnonymousUsers(argv = process.argv.slice(2)) {
  loadEnvFile();
  const { values } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    options: {
      days: { type: 'string', default: '90' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1) throw new Error('--days は1以上の整数で指定してください');

  const { db, pool } = createDb(requireDatabaseUrl());
  try {
    const target = sql`
      from app_users u
      where u.is_anonymous
        and u.last_seen_at < now() - make_interval(days => ${days})
        and not exists (select 1 from user_crop_seasons s where s.uid = u.uid)`;
    if (values['dry-run']) {
      const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n ${target}`);
      console.log(`削除対象: ${rows[0]?.n ?? 0}件（dry-run のため削除していません）`);
      return;
    }
    const { rowCount } = await db.execute(sql`delete ${target}`);
    console.log(`削除: ${rowCount ?? 0}件（最終利用から${days}日以上・記録なしの匿名ユーザー）`);
  } finally {
    await pool.end();
  }
}

if (import.meta.filename === process.argv[1]) {
  runCleanupAnonymousUsers().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
