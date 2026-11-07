import {
  addCandidateUrlRoute,
  enqueueJobRoute,
  getCollectionStatsRoute,
  listReviewItemsRoute,
  listUnverifiedPesticidesRoute,
  markPageFinderCheckedRoute,
  putManufacturerDomainsRoute,
  reviewItemRoute,
} from '@pesticide/api-contract';
import { enqueueNow, markPageFinderChecked } from '@pesticide/collector/queue';
import { addCandidateUrl, reviewAsset, setManufacturerDomains } from '@pesticide/collector/review';
import type { Database } from '@pesticide/db';
import type { AuthPrincipal, AuthVariables } from '../middleware/auth';
import { createRouter } from '../router';
import { getCollectionStats, listReviewItems, listUnverifiedPesticides, pesticideExists } from '../services/collection';
import type { FileUrlSigner } from '../services/file-url';

function reviewerName(principal: AuthPrincipal | undefined): string {
  switch (principal?.type) {
    case 'firebase':
      return principal.email ?? `firebase:${principal.uid}`;
    case 'api_key':
      return `api_key#${principal.keyIndex}`;
    default:
      return 'anonymous';
  }
}

const notFound = (registrationNumber: string) => ({ error: `登録番号 ${registrationNumber} の農薬は見つかりません` });

export const collectionAdminRoutes = (db: Database, signer: FileUrlSigner) =>
  createRouter<{ Variables: AuthVariables }>()
    .openapi(listReviewItemsRoute, async (c) => {
      return c.json({ items: await listReviewItems(db, signer, c.req.valid('query')) }, 200);
    })
    .openapi(reviewItemRoute, async (c) => {
      const body = c.req.valid('json');
      const row = await reviewAsset(db, { ...body, reviewer: reviewerName(c.get('principal')) });
      if (!row) return c.json({ error: '対象のデータが見つかりません' }, 404);
      return c.json(row, 200);
    })
    .openapi(addCandidateUrlRoute, async (c) => {
      const { registrationNumber, url } = c.req.valid('json');
      if (!(await pesticideExists(db, registrationNumber))) return c.json(notFound(registrationNumber), 404);
      return c.json({ url: await addCandidateUrl(db, registrationNumber, url) }, 200);
    })
    .openapi(enqueueJobRoute, async (c) => {
      const { registrationNumber } = c.req.valid('json');
      if (!(await pesticideExists(db, registrationNumber))) return c.json(notFound(registrationNumber), 404);
      await enqueueNow(db, registrationNumber);
      return c.json({ registrationNumber, queued: true as const }, 200);
    })
    .openapi(putManufacturerDomainsRoute, async (c) => {
      const { registrantName, domains, note } = c.req.valid('json');
      return c.json({ registrantName, domains: await setManufacturerDomains(db, registrantName, domains, note) }, 200);
    })
    .openapi(getCollectionStatsRoute, async (c) => {
      return c.json(await getCollectionStats(db), 200);
    })
    .openapi(listUnverifiedPesticidesRoute, async (c) => {
      const { limit } = c.req.valid('query');
      return c.json({ items: await listUnverifiedPesticides(db, limit) }, 200);
    })
    .openapi(markPageFinderCheckedRoute, async (c) => {
      const { registrationNumber } = c.req.valid('json');
      if (!(await pesticideExists(db, registrationNumber))) return c.json(notFound(registrationNumber), 404);
      await markPageFinderChecked(db, registrationNumber);
      return c.json({ registrationNumber, checked: true as const }, 200);
    });
