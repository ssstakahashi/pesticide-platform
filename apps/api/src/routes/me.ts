import {
  createRecordsRoute,
  createSeasonRoute,
  deleteRecordRoute,
  deleteSeasonRoute,
  getMeRoute,
  listRecordsRoute,
  listSeasonsRoute,
  mergeAccountRoute,
  updateSeasonRoute,
  verifySeasonRoute,
} from '@pesticide/api-contract';
import type { Database } from '@pesticide/db';
import type { FirebasePrincipal, UserVariables } from '../middleware/auth';
import { createRouter } from '../router';
import {
  createRecords,
  createSeason,
  deleteRecord,
  deleteSeason,
  getMe,
  listRecords,
  listSeasons,
  mergeAnonymousUser,
  updateSeason,
  verifySeason,
} from '../services/user-records';

type TokenVerifier = (token: string) => Promise<FirebasePrincipal | null>;

const seasonNotFound = { error: '作付けが見つかりません' };
const recordNotFound = { error: '散布記録が見つかりません' };

export const meRoutes = (db: Database, verifyToken: TokenVerifier | null) =>
  createRouter<{ Variables: UserVariables }>()
    .openapi(getMeRoute, async (c) => {
      return c.json(await getMe(db, c.get('principal')), 200);
    })
    .openapi(listSeasonsRoute, async (c) => {
      return c.json({ items: await listSeasons(db, c.get('principal').uid) }, 200);
    })
    .openapi(createSeasonRoute, async (c) => {
      return c.json(await createSeason(db, c.get('principal'), c.req.valid('json')), 200);
    })
    .openapi(updateSeasonRoute, async (c) => {
      const season = await updateSeason(db, c.get('principal').uid, c.req.valid('param').id, c.req.valid('json'));
      if (!season) return c.json(seasonNotFound, 404);
      return c.json(season, 200);
    })
    .openapi(deleteSeasonRoute, async (c) => {
      const { id } = c.req.valid('param');
      if (!(await deleteSeason(db, c.get('principal').uid, id))) return c.json(seasonNotFound, 404);
      return c.json({ id, deleted: true as const }, 200);
    })
    .openapi(listRecordsRoute, async (c) => {
      const items = await listRecords(db, c.get('principal').uid, c.req.valid('param').id);
      if (!items) return c.json(seasonNotFound, 404);
      return c.json({ items }, 200);
    })
    .openapi(createRecordsRoute, async (c) => {
      const { records } = c.req.valid('json');
      const items = await createRecords(db, c.get('principal').uid, c.req.valid('param').id, records);
      if (!items) return c.json(seasonNotFound, 404);
      return c.json({ items }, 200);
    })
    .openapi(deleteRecordRoute, async (c) => {
      const { id } = c.req.valid('param');
      if (!(await deleteRecord(db, c.get('principal').uid, id))) return c.json(recordNotFound, 404);
      return c.json({ id, deleted: true as const }, 200);
    })
    .openapi(verifySeasonRoute, async (c) => {
      const { candidates } = c.req.valid('json');
      const result = await verifySeason(db, c.get('principal').uid, c.req.valid('param').id, candidates);
      if (!result) return c.json(seasonNotFound, 404);
      return c.json(result, 200);
    })
    .openapi(mergeAccountRoute, async (c) => {
      const principal = c.get('principal');
      if (principal.isAnonymous) return c.json({ error: '登録済みのアカウントでログインしてください' }, 400);
      if (!verifyToken) return c.json({ error: 'この環境では引き継ぎを利用できません' }, 400);

      const source = await verifyToken(c.req.valid('json').anonymousIdToken);
      if (!source?.isAnonymous || source.uid === principal.uid) {
        return c.json({ error: '引き継ぎ元のトークンが不正です' }, 400);
      }
      return c.json({ movedSeasons: await mergeAnonymousUser(db, principal, source.uid) }, 200);
    });
