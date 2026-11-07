import {
  agrManufacturerDomains,
  agrPesticideDocuments,
  agrPesticideImages,
  agrPesticides,
  agrPesticideWebPages,
  type Database,
  type ReviewStatus,
} from '@pesticide/db';
import { eq, sql } from 'drizzle-orm';
import { enqueueNow } from './queue';

export type AssetType = 'web_page' | 'document' | 'image';

export const ASSET_TABLES = {
  web_page: agrPesticideWebPages,
  document: agrPesticideDocuments,
  image: agrPesticideImages,
} as const;

/**
 * 人による承認・却下。公式ページを承認したときは、そのホストを製造会社の公式ドメインとして学習し、
 * 以降の自動検証（公式ドメイン判定）に使う。
 */
export async function reviewAsset(
  db: Database,
  input: { type: AssetType; id: string; action: 'approve' | 'reject'; reviewer: string; note?: string },
) {
  const table = ASSET_TABLES[input.type];
  const status: ReviewStatus = input.action === 'approve' ? 'approved' : 'rejected';
  const [row] = await db
    .update(table)
    .set({
      status,
      reviewedBy: input.reviewer,
      reviewedAt: new Date(),
      reviewNote: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(table.id, input.id))
    .returning({ id: table.id, registrationNumber: table.registrationNumber, status: table.status });
  if (!row) return null;

  if (input.type === 'web_page' && status === 'approved') {
    const [page] = await db
      .select({ url: agrPesticideWebPages.url, registrantName: agrPesticides.registrantName })
      .from(agrPesticideWebPages)
      .innerJoin(agrPesticides, eq(agrPesticides.registrationNumber, agrPesticideWebPages.registrationNumber))
      .where(eq(agrPesticideWebPages.id, input.id));
    if (page?.registrantName) {
      const host = new URL(page.url).hostname.replace(/^www\./, '');
      await db
        .insert(agrManufacturerDomains)
        .values({ registrantName: page.registrantName, domains: [host], note: '承認されたページから自動登録' })
        .onConflictDoUpdate({
          target: agrManufacturerDomains.registrantName,
          set: {
            domains: sql`(SELECT array_agg(DISTINCT d) FROM unnest(${agrManufacturerDomains.domains} || ARRAY[${host}]::text[]) d)`,
            updatedAt: new Date(),
          },
        });
    }
  }
  return row;
}

/** 管理者が見つけた公式ページ URL を登録し、次回の bot 実行で優先的に検証させる */
export async function addCandidateUrl(db: Database, registrationNumber: string, url: string) {
  const normalized = new URL(url);
  if (normalized.protocol !== 'https:' && normalized.protocol !== 'http:')
    throw new Error('http(s) の URL を指定してください');
  normalized.hash = '';
  await db
    .insert(agrPesticideWebPages)
    .values({ registrationNumber, url: normalized.href, source: 'manual' })
    .onConflictDoNothing();
  await enqueueNow(db, registrationNumber);
  return normalized.href;
}

export async function setManufacturerDomains(db: Database, registrantName: string, domains: string[], note?: string) {
  const cleaned = [
    ...new Set(
      domains
        .map((d) =>
          d
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/[/:?#].*$/, '')
            .replace(/^www\./, ''),
        )
        .filter(Boolean),
    ),
  ];
  await db
    .insert(agrManufacturerDomains)
    .values({ registrantName, domains: cleaned, note: note ?? null })
    .onConflictDoUpdate({
      target: agrManufacturerDomains.registrantName,
      set: { domains: cleaned, note: note ?? null, updatedAt: new Date() },
    });
  return cleaned;
}
