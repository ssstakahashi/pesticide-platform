import type {
  CropSeason,
  CropSeasonInput,
  Me,
  SprayRecord,
  SprayRecordInput,
  VerifyResponse,
} from '@pesticide/api-contract';
import { agrPesticides, appUsers, userCropSeasons, userSprayRecords, type Database } from '@pesticide/db';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FirebasePrincipal } from '../middleware/auth';
import { verifyUsage } from './verify';

type SeasonRow = typeof userCropSeasons.$inferSelect;
type RecordRow = typeof userSprayRecords.$inferSelect;

const toSeason = (row: SeasonRow, recordCount: number): CropSeason => ({
  id: row.id,
  name: row.name,
  fieldName: row.fieldName,
  cropName: row.cropName,
  startedOn: row.startedOn,
  endedOn: row.endedOn,
  recordCount,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toRecord = (row: RecordRow): SprayRecord => ({
  id: row.id,
  seasonId: row.seasonId,
  registrationNumber: row.registrationNumber,
  pesticideName: row.pesticideName,
  sprayedDate: row.sprayedDate,
  dilution: row.dilution,
  amount: row.amount,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

const seasonValues = (input: CropSeasonInput) => ({
  name: input.name,
  fieldName: input.fieldName || null,
  cropName: input.cropName,
  startedOn: input.startedOn ?? null,
  endedOn: input.endedOn ?? null,
});

/** 利用者を登録・更新する。匿名から登録済みに変わったときは linked_at を記録する */
export async function ensureUser(db: Pick<Database, 'insert'>, principal: FirebasePrincipal) {
  await db
    .insert(appUsers)
    .values({ uid: principal.uid, isAnonymous: principal.isAnonymous, email: principal.email ?? null })
    .onConflictDoUpdate({
      target: appUsers.uid,
      set: {
        isAnonymous: principal.isAnonymous,
        email: principal.email ?? null,
        lastSeenAt: sql`now()`,
        linkedAt: principal.isAnonymous
          ? appUsers.linkedAt
          : sql`case when ${appUsers.isAnonymous} then now() else ${appUsers.linkedAt} end`,
      },
    });
}

export async function getMe(db: Database, principal: FirebasePrincipal, isAdmin: boolean): Promise<Me> {
  await ensureUser(db, principal);
  const [counts] = await db
    .select({
      seasonCount: sql<number>`count(distinct ${userCropSeasons.id})::int`,
      recordCount: sql<number>`count(${userSprayRecords.id})::int`,
    })
    .from(userCropSeasons)
    .leftJoin(userSprayRecords, eq(userSprayRecords.seasonId, userCropSeasons.id))
    .where(eq(userCropSeasons.uid, principal.uid));
  return {
    uid: principal.uid,
    isAnonymous: principal.isAnonymous,
    email: principal.email ?? null,
    seasonCount: counts?.seasonCount ?? 0,
    recordCount: counts?.recordCount ?? 0,
    isAdmin,
  };
}

async function findOwnSeason(db: Database, uid: string, seasonId: string): Promise<SeasonRow | null> {
  const [row] = await db
    .select()
    .from(userCropSeasons)
    .where(and(eq(userCropSeasons.id, seasonId), eq(userCropSeasons.uid, uid)));
  return row ?? null;
}

async function countRecords(db: Database, seasonId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(userSprayRecords).where(eq(userSprayRecords.seasonId, seasonId));
  return row?.n ?? 0;
}

export async function listSeasons(db: Database, uid: string): Promise<CropSeason[]> {
  const rows = await db
    .select({ season: userCropSeasons, recordCount: count(userSprayRecords.id) })
    .from(userCropSeasons)
    .leftJoin(userSprayRecords, eq(userSprayRecords.seasonId, userCropSeasons.id))
    .where(eq(userCropSeasons.uid, uid))
    .groupBy(userCropSeasons.id)
    .orderBy(sql`${userCropSeasons.startedOn} desc nulls last`, desc(userCropSeasons.createdAt));
  return rows.map((r) => toSeason(r.season, r.recordCount));
}

export async function createSeason(
  db: Database,
  principal: FirebasePrincipal,
  input: CropSeasonInput,
): Promise<CropSeason> {
  await ensureUser(db, principal);
  const [row] = await db
    .insert(userCropSeasons)
    .values({ uid: principal.uid, ...seasonValues(input) })
    .returning();
  return toSeason(row!, 0);
}

export async function updateSeason(
  db: Database,
  uid: string,
  seasonId: string,
  input: CropSeasonInput,
): Promise<CropSeason | null> {
  const [row] = await db
    .update(userCropSeasons)
    .set({ ...seasonValues(input), updatedAt: sql`now()` })
    .where(and(eq(userCropSeasons.id, seasonId), eq(userCropSeasons.uid, uid)))
    .returning();
  if (!row) return null;
  return toSeason(row, await countRecords(db, row.id));
}

export async function deleteSeason(db: Database, uid: string, seasonId: string): Promise<boolean> {
  const rows = await db
    .delete(userCropSeasons)
    .where(and(eq(userCropSeasons.id, seasonId), eq(userCropSeasons.uid, uid)))
    .returning({ id: userCropSeasons.id });
  return rows.length > 0;
}

export async function listRecords(db: Database, uid: string, seasonId: string): Promise<SprayRecord[] | null> {
  if (!(await findOwnSeason(db, uid, seasonId))) return null;
  const rows = await db
    .select()
    .from(userSprayRecords)
    .where(eq(userSprayRecords.seasonId, seasonId))
    .orderBy(asc(userSprayRecords.sprayedDate), asc(userSprayRecords.createdAt));
  return rows.map(toRecord);
}

export async function createRecords(
  db: Database,
  uid: string,
  seasonId: string,
  inputs: SprayRecordInput[],
): Promise<SprayRecord[] | null> {
  if (!(await findOwnSeason(db, uid, seasonId))) return null;

  const numbers = [...new Set(inputs.map((r) => r.registrationNumber))];
  const names = new Map(
    (
      await db
        .select({ registrationNumber: agrPesticides.registrationNumber, name: agrPesticides.name })
        .from(agrPesticides)
        .where(inArray(agrPesticides.registrationNumber, numbers))
    ).map((p) => [p.registrationNumber, p.name]),
  );

  const rows = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(userSprayRecords)
      .values(
        inputs.map((r) => ({
          seasonId,
          registrationNumber: r.registrationNumber,
          pesticideName: names.get(r.registrationNumber) ?? null,
          sprayedDate: r.sprayedDate,
          dilution: r.dilution || null,
          amount: r.amount || null,
          note: r.note || null,
        })),
      )
      .returning();
    await tx
      .update(userCropSeasons)
      .set({ updatedAt: sql`now()` })
      .where(eq(userCropSeasons.id, seasonId));
    return inserted;
  });
  return rows.map(toRecord);
}

export async function deleteRecord(db: Database, uid: string, recordId: string): Promise<boolean> {
  const rows = await db
    .delete(userSprayRecords)
    .where(
      and(
        eq(userSprayRecords.id, recordId),
        inArray(
          userSprayRecords.seasonId,
          db.select({ id: userCropSeasons.id }).from(userCropSeasons).where(eq(userCropSeasons.uid, uid)),
        ),
      ),
    )
    .returning({ id: userSprayRecords.id });
  return rows.length > 0;
}

export async function verifySeason(
  db: Database,
  uid: string,
  seasonId: string,
  candidates: string[] | undefined,
): Promise<VerifyResponse | null> {
  const season = await findOwnSeason(db, uid, seasonId);
  if (!season) return null;
  const records = await db
    .select({ registrationNumber: userSprayRecords.registrationNumber, sprayedDate: userSprayRecords.sprayedDate })
    .from(userSprayRecords)
    .where(eq(userSprayRecords.seasonId, seasonId))
    .orderBy(asc(userSprayRecords.sprayedDate))
    .limit(500);
  return verifyUsage(db, { crop: season.cropName, history: records, candidates });
}

/** 匿名ユーザーの作付けを登録済みユーザーに付け替え、匿名ユーザーを削除する */
export async function mergeAnonymousUser(
  db: Database,
  target: FirebasePrincipal,
  anonymousUid: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    await ensureUser(tx, target);
    const moved = await tx
      .update(userCropSeasons)
      .set({ uid: target.uid, updatedAt: sql`now()` })
      .where(eq(userCropSeasons.uid, anonymousUid))
      .returning({ id: userCropSeasons.id });
    await tx.delete(appUsers).where(and(eq(appUsers.uid, anonymousUid), eq(appUsers.isAnonymous, true)));
    return moved.length;
  });
}
