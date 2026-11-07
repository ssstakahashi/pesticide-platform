import { verifyRoute } from '@pesticide/api-contract';
import type { Database } from '@pesticide/db';
import { createRouter } from '../router';
import { verifyUsage } from '../services/verify';

export const verifyRoutes = (db: Database) =>
  createRouter().openapi(verifyRoute, async (c) => {
    return c.json(await verifyUsage(db, c.req.valid('json')), 200);
  });
