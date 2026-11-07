import { pgTable, uuid, varchar, text, boolean, date, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// (14) Web の利用者（Firebase Auth の uid。匿名ログインを含む）
export const appUsers = pgTable(
  'app_users',
  {
    uid: text('uid').primaryKey(),
    isAnonymous: boolean('is_anonymous').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_app_users_anonymous_last_seen').on(table.isAnonymous, table.lastSeenAt)],
);

// (15) 作付け（圃場 × 作物 × 作期）
export const userCropSeasons = pgTable(
  'user_crop_seasons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid')
      .notNull()
      .references(() => appUsers.uid, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    fieldName: text('field_name'),
    cropName: text('crop_name').notNull(),
    startedOn: date('started_on'),
    endedOn: date('ended_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_user_crop_seasons_uid_started').on(table.uid, table.startedOn)],
);

// (16) 散布記録。FAMIC 同期で農薬が失効・削除されても残すため、登録番号に外部キーは張らず農薬名を保存しておく
export const userSprayRecords = pgTable(
  'user_spray_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => userCropSeasons.id, { onDelete: 'cascade' }),
    registrationNumber: varchar('registration_number', { length: 10 }).notNull(),
    pesticideName: text('pesticide_name'),
    sprayedDate: date('sprayed_date').notNull(),
    dilution: text('dilution'),
    amount: text('amount'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_user_spray_records_season_date').on(table.seasonId, table.sprayedDate)],
);

export const appUsersRelations = relations(appUsers, ({ many }) => ({
  seasons: many(userCropSeasons),
}));

export const userCropSeasonsRelations = relations(userCropSeasons, ({ one, many }) => ({
  user: one(appUsers, { fields: [userCropSeasons.uid], references: [appUsers.uid] }),
  records: many(userSprayRecords),
}));

export const userSprayRecordsRelations = relations(userSprayRecords, ({ one }) => ({
  season: one(userCropSeasons, { fields: [userSprayRecords.seasonId], references: [userCropSeasons.id] }),
}));
