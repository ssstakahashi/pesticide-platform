import { agrCollectionJobs, type Database } from '@pesticide/db';

/** 手動URL登録時などに、次回の実行で最優先に処理させる */
export async function enqueueNow(db: Database, registrationNumber: string, priority = 10) {
  await db
    .insert(agrCollectionJobs)
    .values({ registrationNumber, priority, nextRunAt: new Date() })
    .onConflictDoUpdate({
      target: agrCollectionJobs.registrationNumber,
      set: { priority, nextRunAt: new Date(), lockedUntil: null },
    });
}

/** 候補URLが見つからなかった農薬を、次回の自動取得から外す */
export async function markPageFinderChecked(db: Database, registrationNumber: string) {
  await db
    .insert(agrCollectionJobs)
    .values({ registrationNumber, pageFinderCheckedAt: new Date() })
    .onConflictDoUpdate({
      target: agrCollectionJobs.registrationNumber,
      set: { pageFinderCheckedAt: new Date() },
    });
}
