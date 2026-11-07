import { suggestCropsRoute, suggestPestsRoute } from '@pesticide/api-contract';
import type { Database } from '@pesticide/db';
import { createRouter } from '../router';
import { suggestByName } from '../services/pesticides';

export const cropsRoutes = (db: Database) =>
  createRouter().openapi(suggestCropsRoute, async (c) => {
    const { q, limit } = c.req.valid('query');
    return c.json({ items: await suggestByName(db, 'agr_crops', q, limit) }, 200);
  });

export const pestsRoutes = (db: Database) =>
  createRouter().openapi(suggestPestsRoute, async (c) => {
    const { q, limit } = c.req.valid('query');
    return c.json({ items: await suggestByName(db, 'agr_pests', q, limit) }, 200);
  });
