import {
  getPesticideAssetsRoute,
  getPesticideRoute,
  searchPesticidesRoute,
  suggestPesticidesRoute,
} from '@pesticide/api-contract';
import type { Database } from '@pesticide/db';
import { createRouter } from '../router';
import { getApprovedAssets } from '../services/collection';
import type { FileUrlSigner } from '../services/file-url';
import { getPesticideDetail, searchPesticides, suggestByName } from '../services/pesticides';

export const pesticidesRoutes = (db: Database, signer: FileUrlSigner) =>
  createRouter()
    .openapi(searchPesticidesRoute, async (c) => {
      const items = await searchPesticides(db, c.req.valid('query'));
      return c.json({ count: items.length, items }, 200);
    })
    .openapi(suggestPesticidesRoute, async (c) => {
      const { q, limit } = c.req.valid('query');
      return c.json({ items: await suggestByName(db, 'agr_pesticides', q, limit) }, 200);
    })
    .openapi(getPesticideRoute, async (c) => {
      const { registrationNumber } = c.req.valid('param');
      const detail = await getPesticideDetail(db, registrationNumber);
      if (!detail) return c.json({ error: `登録番号 ${registrationNumber} の農薬は見つかりません` }, 404);
      return c.json(detail, 200);
    })
    .openapi(getPesticideAssetsRoute, async (c) => {
      const { registrationNumber } = c.req.valid('param');
      const assets = await getApprovedAssets(db, signer, registrationNumber);
      if (!assets) return c.json({ error: `登録番号 ${registrationNumber} の農薬は見つかりません` }, 404);
      return c.json(assets, 200);
    });
