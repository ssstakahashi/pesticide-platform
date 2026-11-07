import { agrCollectionJobs, agrPesticides, type Database } from '@pesticide/db';
import { eq, sql } from 'drizzle-orm';
import { collectForPesticide, type CollectDeps, type CollectStats } from './collect';

/** 巡回状態が未作成の農薬（新規登録分を含む）をキューに追加する */
export async function ensureJobs(db: Database): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO ${agrCollectionJobs} (registration_number)
    SELECT ${agrPesticides.registrationNumber} FROM ${agrPesticides}
    ON CONFLICT DO NOTHING
  `);
  return result.rowCount ?? 0;
}

/** 実行時期が来たジョブを優先度順に取得してロックする（複数プロセスでも重複しない） */
export async function claimDueJobs(db: Database, limit: number): Promise<string[]> {
  const result = await db.execute<{ registration_number: string }>(sql`
    UPDATE ${agrCollectionJobs} SET locked_until = now() + interval '30 minutes'
    WHERE registration_number IN (
      SELECT registration_number FROM ${agrCollectionJobs}
      WHERE next_run_at <= now() AND (locked_until IS NULL OR locked_until < now())
      ORDER BY priority DESC, next_run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING registration_number
  `);
  return result.rows.map((r) => r.registration_number);
}

export async function completeJob(db: Database, registrationNumber: string, stats: CollectStats, recheckDays: number) {
  await db
    .update(agrCollectionJobs)
    .set({
      attempts: 0,
      priority: 0,
      lastRunAt: new Date(),
      nextRunAt: new Date(Date.now() + recheckDays * 86400_000),
      lastError: null,
      lastStats: stats,
      lockedUntil: null,
    })
    .where(eq(agrCollectionJobs.registrationNumber, registrationNumber));
}

export async function failJob(db: Database, registrationNumber: string, error: Error) {
  await db
    .update(agrCollectionJobs)
    .set({
      attempts: sql`${agrCollectionJobs.attempts} + 1`,
      lastRunAt: new Date(),
      // 1h, 2h, 4h ... 最大7日で再試行
      nextRunAt: sql`now() + least(interval '1 hour' * power(2, ${agrCollectionJobs.attempts}), interval '7 days')`,
      lastError: error.message.slice(0, 1000),
      lockedUntil: null,
    })
    .where(eq(agrCollectionJobs.registrationNumber, registrationNumber));
}

export async function runBatch(deps: CollectDeps, limit = deps.config.COLLECTOR_BATCH_SIZE) {
  const added = await ensureJobs(deps.db);
  if (added) deps.log(`新規に ${added} 件をキューに追加しました`);

  const regs = await claimDueJobs(deps.db, limit);
  deps.log(`処理対象: ${regs.length} 件 (検索: ${deps.search.name})`);
  let succeeded = 0;
  for (const reg of regs) {
    try {
      const stats = await collectForPesticide(deps, reg);
      await completeJob(deps.db, reg, stats, deps.config.COLLECTOR_RECHECK_DAYS);
      succeeded++;
    } catch (err) {
      deps.log(`[${reg}] 失敗: ${(err as Error).message}`);
      await failJob(deps.db, reg, err as Error);
    }
  }
  return { processed: regs.length, succeeded };
}
