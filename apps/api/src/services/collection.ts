import type { AssetType, CollectionStats, PesticideAssets, ReviewItem, ReviewStatus } from '@pesticide/api-contract';
import {
  agrCollectionJobs,
  agrPesticideDocuments,
  agrPesticideImages,
  agrPesticides,
  agrPesticideWebPages,
  type Database,
} from '@pesticide/db';
import { and, asc, count, desc, eq, isNull, notExists, sql, type SQL } from 'drizzle-orm';
import type { FileAssetType, FileUrlSigner } from './file-url';

export async function getApprovedAssets(
  db: Database,
  signer: FileUrlSigner,
  registrationNumber: string,
): Promise<PesticideAssets | null> {
  const [pesticide] = await db
    .select({ registrationNumber: agrPesticides.registrationNumber })
    .from(agrPesticides)
    .where(eq(agrPesticides.registrationNumber, registrationNumber));
  if (!pesticide) return null;

  const [webPages, documents, images] = await Promise.all([
    db
      .select({ id: agrPesticideWebPages.id, url: agrPesticideWebPages.url, title: agrPesticideWebPages.title })
      .from(agrPesticideWebPages)
      .where(
        and(
          eq(agrPesticideWebPages.registrationNumber, registrationNumber),
          eq(agrPesticideWebPages.status, 'approved'),
        ),
      )
      .orderBy(desc(agrPesticideWebPages.verificationScore)),
    db
      .select({
        id: agrPesticideDocuments.id,
        kind: agrPesticideDocuments.kind,
        title: agrPesticideDocuments.title,
        sourceUrl: agrPesticideDocuments.sourceUrl,
        pageUrl: agrPesticideDocuments.pageUrl,
        pageCount: agrPesticideDocuments.pageCount,
        byteSize: agrPesticideDocuments.byteSize,
      })
      .from(agrPesticideDocuments)
      .where(
        and(
          eq(agrPesticideDocuments.registrationNumber, registrationNumber),
          eq(agrPesticideDocuments.status, 'approved'),
        ),
      )
      .orderBy(asc(agrPesticideDocuments.kind), desc(agrPesticideDocuments.verificationScore)),
    db
      .select({
        id: agrPesticideImages.id,
        altText: agrPesticideImages.altText,
        sourceUrl: agrPesticideImages.sourceUrl,
        pageUrl: agrPesticideImages.pageUrl,
        width: agrPesticideImages.width,
        height: agrPesticideImages.height,
      })
      .from(agrPesticideImages)
      .where(
        and(eq(agrPesticideImages.registrationNumber, registrationNumber), eq(agrPesticideImages.status, 'approved')),
      )
      .orderBy(asc(agrPesticideImages.sortOrder), desc(agrPesticideImages.verificationScore))
      .limit(5),
  ]);

  return {
    registrationNumber,
    webPages,
    documents: documents.map((d) => ({ ...d, fileUrl: signer.sign('document', d.id) })),
    images: images.map((i) => ({ ...i, fileUrl: signer.sign('image', i.id) })),
  };
}

export async function findStoredFile(db: Database, type: FileAssetType, id: string) {
  const table = type === 'document' ? agrPesticideDocuments : agrPesticideImages;
  const [row] = await db
    .select({
      registrationNumber: table.registrationNumber,
      storagePath: table.storagePath,
      contentType: table.contentType,
      byteSize: table.byteSize,
      sha256: table.sha256,
    })
    .from(table)
    .where(eq(table.id, id));
  return row ?? null;
}

const pesticideColumns = { pesticideName: agrPesticides.name, registrantName: agrPesticides.registrantName };

export async function listReviewItems(
  db: Database,
  signer: FileUrlSigner,
  query: { status: ReviewStatus; type?: AssetType; registrationNumber?: string; limit: number },
): Promise<ReviewItem[]> {
  const filter = (table: typeof agrPesticideWebPages | typeof agrPesticideDocuments | typeof agrPesticideImages) => {
    const conditions: SQL[] = [eq(table.status, query.status)];
    if (query.registrationNumber) conditions.push(eq(table.registrationNumber, query.registrationNumber));
    return and(...conditions);
  };
  const wants = (type: AssetType) => !query.type || query.type === type;
  const order = (table: typeof agrPesticideWebPages | typeof agrPesticideDocuments | typeof agrPesticideImages) => [
    desc(table.verificationScore),
    desc(table.createdAt),
  ];

  const [pages, documents, images] = await Promise.all([
    wants('web_page')
      ? db
          .select({ row: agrPesticideWebPages, ...pesticideColumns })
          .from(agrPesticideWebPages)
          .innerJoin(agrPesticides, eq(agrPesticides.registrationNumber, agrPesticideWebPages.registrationNumber))
          .where(filter(agrPesticideWebPages))
          .orderBy(...order(agrPesticideWebPages))
          .limit(query.limit)
      : [],
    wants('document')
      ? db
          .select({ row: agrPesticideDocuments, ...pesticideColumns })
          .from(agrPesticideDocuments)
          .innerJoin(agrPesticides, eq(agrPesticides.registrationNumber, agrPesticideDocuments.registrationNumber))
          .where(filter(agrPesticideDocuments))
          .orderBy(...order(agrPesticideDocuments))
          .limit(query.limit)
      : [],
    wants('image')
      ? db
          .select({ row: agrPesticideImages, ...pesticideColumns })
          .from(agrPesticideImages)
          .innerJoin(agrPesticides, eq(agrPesticides.registrationNumber, agrPesticideImages.registrationNumber))
          .where(filter(agrPesticideImages))
          .orderBy(...order(agrPesticideImages))
          .limit(query.limit)
      : [],
  ]);

  const common = (
    type: AssetType,
    r: (typeof pages)[number]['row'] | (typeof documents)[number]['row'] | (typeof images)[number]['row'],
    p: { pesticideName: string; registrantName: string | null },
  ) => ({
    type,
    id: r.id,
    registrationNumber: r.registrationNumber,
    pesticideName: p.pesticideName,
    registrantName: p.registrantName,
    status: r.status,
    verificationScore: r.verificationScore,
    verificationDetails: r.verificationDetails,
    reviewedBy: r.reviewedBy,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
  });

  const items: ReviewItem[] = [
    ...pages.map(({ row, ...p }) => ({
      ...common('web_page', row, p),
      url: row.url,
      pageUrl: null,
      title: row.title,
      kind: null,
      width: null,
      height: null,
      fileUrl: null,
    })),
    ...documents.map(({ row, ...p }) => ({
      ...common('document', row, p),
      url: row.sourceUrl,
      pageUrl: row.pageUrl,
      title: row.title,
      kind: row.kind,
      width: null,
      height: null,
      fileUrl: signer.sign('document', row.id),
    })),
    ...images.map(({ row, ...p }) => ({
      ...common('image', row, p),
      url: row.sourceUrl,
      pageUrl: row.pageUrl,
      title: row.altText,
      kind: null,
      width: row.width,
      height: row.height,
      fileUrl: signer.sign('image', row.id),
    })),
  ];

  return items
    .sort((a, b) => (b.verificationScore ?? 0) - (a.verificationScore ?? 0) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, query.limit);
}

/** 公式ページが無く、探索 bot も未確認の農薬を登録番号の昇順で返す */
export async function listUnverifiedPesticides(db: Database, limit: number) {
  return db
    .select({
      registrationNumber: agrPesticides.registrationNumber,
      name: agrPesticides.name,
      registrantName: agrPesticides.registrantName,
      formulationType: agrPesticides.formulationType,
    })
    .from(agrPesticides)
    .leftJoin(agrCollectionJobs, eq(agrCollectionJobs.registrationNumber, agrPesticides.registrationNumber))
    .where(
      and(
        isNull(agrCollectionJobs.pageFinderCheckedAt),
        notExists(
          db
            .select({ registrationNumber: agrPesticideWebPages.registrationNumber })
            .from(agrPesticideWebPages)
            .where(eq(agrPesticideWebPages.registrationNumber, agrPesticides.registrationNumber)),
        ),
      ),
    )
    .orderBy(asc(sql`length(${agrPesticides.registrationNumber})`), asc(agrPesticides.registrationNumber))
    .limit(limit);
}

export async function pesticideExists(db: Database, registrationNumber: string) {
  const [row] = await db
    .select({ registrationNumber: agrPesticides.registrationNumber })
    .from(agrPesticides)
    .where(eq(agrPesticides.registrationNumber, registrationNumber));
  return Boolean(row);
}

export async function getCollectionStats(db: Database): Promise<CollectionStats> {
  const countBy = (
    type: AssetType,
    table: typeof agrPesticideWebPages | typeof agrPesticideDocuments | typeof agrPesticideImages,
  ) =>
    db
      .select({ status: table.status, count: count() })
      .from(table)
      .groupBy(table.status)
      .then((rows) => rows.map((r) => ({ type, ...r })));

  const [pages, documents, images, [jobs]] = await Promise.all([
    countBy('web_page', agrPesticideWebPages),
    countBy('document', agrPesticideDocuments),
    countBy('image', agrPesticideImages),
    db
      .select({
        total: count(),
        due: sql<number>`count(*) FILTER (WHERE ${agrCollectionJobs.nextRunAt} <= now())`.mapWith(Number),
        failing: sql<number>`count(*) FILTER (WHERE ${agrCollectionJobs.lastError} IS NOT NULL)`.mapWith(Number),
        lastRunAt: sql<Date | null>`max(${agrCollectionJobs.lastRunAt})`.mapWith((v) => (v ? new Date(v) : null)),
      })
      .from(agrCollectionJobs),
  ]);

  return {
    assets: [...pages, ...documents, ...images],
    jobs: {
      total: jobs?.total ?? 0,
      due: jobs?.due ?? 0,
      failing: jobs?.failing ?? 0,
      lastRunAt: jobs?.lastRunAt ? jobs.lastRunAt.toISOString() : null,
    },
  };
}
