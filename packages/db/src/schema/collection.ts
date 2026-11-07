import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agrPesticides } from './agr';

/** pending=人の確認待ち / approved=採用 / rejected=不採用 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
/** 仕様書・技術資料 / SDS / ラベル / その他 */
export type DocumentKind = 'spec_sheet' | 'sds' | 'label' | 'other';
export type CollectionSource = 'search' | 'manual' | 'crawl';

export type VerificationDetails = {
  score: number;
  checks: { name: string; passed: boolean; weight: number; note?: string }[];
  autoApproved: boolean;
};

const reviewColumns = {
  status: varchar('status', { length: 20 }).$type<ReviewStatus>().default('pending').notNull(),
  verificationScore: integer('verification_score').default(0).notNull(),
  verificationDetails: jsonb('verification_details').$type<VerificationDetails>(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

const storedFileColumns = {
  sourceUrl: text('source_url').notNull(),
  storagePath: text('storage_path').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  contentType: varchar('content_type', { length: 100 }).notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
};

// (9) 製造会社（登録者）の公式ドメイン。検証時に「公式サイト上の情報か」を判定する
export const agrManufacturerDomains = pgTable('agr_manufacturer_domains', {
  registrantName: text('registrant_name').primaryKey(),
  domains: text('domains').array().notNull(),
  note: text('note'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// (10) 製造会社の公式ウェブページ（製品ページ）
export const agrPesticideWebPages = pgTable(
  'agr_pesticide_web_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationNumber: varchar('registration_number', { length: 10 })
      .notNull()
      .references(() => agrPesticides.registrationNumber, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title'),
    source: varchar('source', { length: 20 }).$type<CollectionSource>().default('search').notNull(),
    httpStatus: integer('http_status'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    ...reviewColumns,
  },
  (table) => [
    uniqueIndex('uq_agr_web_pages_reg_url').on(table.registrationNumber, table.url),
    index('idx_agr_web_pages_status').on(table.status),
  ],
);

// (11) 仕様書などの PDF
export const agrPesticideDocuments = pgTable(
  'agr_pesticide_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationNumber: varchar('registration_number', { length: 10 })
      .notNull()
      .references(() => agrPesticides.registrationNumber, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).$type<DocumentKind>().default('other').notNull(),
    title: text('title'),
    pageUrl: text('page_url'),
    pageCount: integer('page_count'),
    ...storedFileColumns,
    ...reviewColumns,
  },
  (table) => [
    uniqueIndex('uq_agr_documents_reg_sha').on(table.registrationNumber, table.sha256),
    index('idx_agr_documents_status').on(table.status),
  ],
);

// (12) 商品画像（1農薬あたり最大5枚）
export const agrPesticideImages = pgTable(
  'agr_pesticide_images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationNumber: varchar('registration_number', { length: 10 })
      .notNull()
      .references(() => agrPesticides.registrationNumber, { onDelete: 'cascade' }),
    altText: text('alt_text'),
    pageUrl: text('page_url'),
    width: integer('width'),
    height: integer('height'),
    sortOrder: integer('sort_order').default(0).notNull(),
    ...storedFileColumns,
    ...reviewColumns,
  },
  (table) => [
    uniqueIndex('uq_agr_images_reg_sha').on(table.registrationNumber, table.sha256),
    index('idx_agr_images_status').on(table.status),
  ],
);

// (13) bot の巡回状態（農薬ごと）
export const agrCollectionJobs = pgTable(
  'agr_collection_jobs',
  {
    registrationNumber: varchar('registration_number', { length: 10 })
      .primaryKey()
      .references(() => agrPesticides.registrationNumber, { onDelete: 'cascade' }),
    priority: integer('priority').default(0).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).defaultNow().notNull(),
    lastError: text('last_error'),
    lastStats: jsonb('last_stats').$type<Record<string, number>>(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** 公式ページ探索 bot が候補URLを登録せずに確認し終えた時刻。再取得の対象から外す */
    pageFinderCheckedAt: timestamp('page_finder_checked_at', { withTimezone: true }),
  },
  (table) => [index('idx_agr_collection_jobs_next').on(table.priority, table.nextRunAt)],
);

export const agrPesticideWebPagesRelations = relations(agrPesticideWebPages, ({ one }) => ({
  pesticide: one(agrPesticides, {
    fields: [agrPesticideWebPages.registrationNumber],
    references: [agrPesticides.registrationNumber],
  }),
}));

export const agrPesticideDocumentsRelations = relations(agrPesticideDocuments, ({ one }) => ({
  pesticide: one(agrPesticides, {
    fields: [agrPesticideDocuments.registrationNumber],
    references: [agrPesticides.registrationNumber],
  }),
}));

export const agrPesticideImagesRelations = relations(agrPesticideImages, ({ one }) => ({
  pesticide: one(agrPesticides, {
    fields: [agrPesticideImages.registrationNumber],
    references: [agrPesticides.registrationNumber],
  }),
}));
