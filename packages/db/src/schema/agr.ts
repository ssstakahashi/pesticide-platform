import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  date,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// (1) 農薬基本マスタ（登録基本部）
export const agrPesticides = pgTable(
  'agr_pesticides',
  {
    registrationNumber: varchar('registration_number', { length: 10 }).primaryKey(),
    rawId: uuid('raw_id'),
    pesticideType: text('pesticide_type'),
    name: text('name').notNull(),
    registrantName: text('registrant_name'),
    usageCategory: text('usage_category'),
    formulationType: text('formulation_type'),
    mixtureCount: integer('mixture_count'),
    registeredDate: date('registered_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_agr_pesticides_name_trgm').using('gin', table.name.op('gin_trgm_ops'))],
);

// (2) 有効成分マスタ
export const agrIngredients = pgTable(
  'agr_ingredients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    totalCountGroupName: text('total_count_group_name'),
    fracCode: varchar('frac_code', { length: 20 }),
    iracCode: varchar('irac_code', { length: 20 }),
    hracCode: varchar('hrac_code', { length: 20 }),
  },
  (table) => [index('idx_agr_ingredients_name_trgm').using('gin', table.name.op('gin_trgm_ops'))],
);

// (3) 農薬 × 有効成分
export const agrPesticideIngredients = pgTable(
  'agr_pesticide_ingredients',
  {
    registrationNumber: varchar('registration_number', { length: 10 })
      .notNull()
      .references(() => agrPesticides.registrationNumber, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => agrIngredients.id, { onDelete: 'cascade' }),
    ordinalPosition: integer('ordinal_position').notNull(),
    concentrationText: text('concentration_text'),
  },
  (table) => [
    primaryKey({ columns: [table.registrationNumber, table.ordinalPosition] }),
    index('idx_agr_pesticide_ing_ing_id').on(table.ingredientId),
  ],
);

// (4) 作物マスタ（parent_id による自己参照で「野菜類 > 果菜類 > すいか」の階層を表現）
export const agrCrops = pgTable(
  'agr_crops',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id'),
    name: text('name').notNull().unique(),
    level: integer('level').default(3).notNull(),
    synonyms: text('synonyms').array(),
  },
  (table) => [
    index('idx_agr_crops_parent_id').on(table.parentId),
    index('idx_agr_crops_name_trgm').using('gin', table.name.op('gin_trgm_ops')),
  ],
);

// (5) 病害虫・雑草マスタ
export const agrPests = pgTable(
  'agr_pests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    category: varchar('category', { length: 50 }),
  },
  (table) => [index('idx_agr_pests_name_trgm').using('gin', table.name.op('gin_trgm_ops'))],
);

// (6) 適用ルール（登録適用部）
export const agrUsageRules = pgTable(
  'agr_usage_rules',
  {
    id: uuid('id').primaryKey(),
    registrationNumber: varchar('registration_number', { length: 10 })
      .notNull()
      .references(() => agrPesticides.registrationNumber, { onDelete: 'cascade' }),
    cropId: uuid('crop_id')
      .notNull()
      .references(() => agrCrops.id),
    rawCropName: text('raw_crop_name').notNull(),
    cropCondition: text('crop_condition'),
    excludedCropNames: text('excluded_crop_names').array(),
    excludedCropIds: uuid('excluded_crop_ids').array(),
    applicationPlace: text('application_place'),
    purpose: text('purpose'),
    applicationMethod: text('application_method'),
    dilutionText: text('dilution_text'),
    dilutionMin: numeric('dilution_min'),
    dilutionMax: numeric('dilution_max'),
    dilutionUnit: varchar('dilution_unit', { length: 50 }),
    liquidAmount: text('liquid_amount'),
    usageTimingText: text('usage_timing_text'),
    phiDays: integer('phi_days'),
    maxApplicationsText: text('max_applications_text'),
    maxApplicationsCount: integer('max_applications_count'),
    fumigationTime: text('fumigation_time'),
    fumigationTemperature: text('fumigation_temperature'),
    soilType: text('soil_type'),
    zoneName: text('zone_name'),
    appliedPesticideName: text('applied_pesticide_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_agr_usage_rules_crop_id').on(table.cropId),
    index('idx_agr_usage_rules_reg_num').on(table.registrationNumber),
  ],
);

// (7) 適用ルール × 対象病害虫
export const agrUsagePests = pgTable(
  'agr_usage_pests',
  {
    usageRuleId: uuid('usage_rule_id')
      .notNull()
      .references(() => agrUsageRules.id, { onDelete: 'cascade' }),
    pestId: uuid('pest_id')
      .notNull()
      .references(() => agrPests.id, { onDelete: 'cascade' }),
    conditionNote: text('condition_note').default('').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.usageRuleId, table.pestId, table.conditionNote] }),
    index('idx_agr_usage_pests_pest_id').on(table.pestId),
  ],
);

// (8) 適用ルール × 有効成分別・総使用回数制限
export const agrUsageIngredientLimits = pgTable(
  'agr_usage_ingredient_limits',
  {
    usageRuleId: uuid('usage_rule_id')
      .notNull()
      .references(() => agrUsageRules.id, { onDelete: 'cascade' }),
    ordinalPosition: integer('ordinal_position').notNull(),
    ingredientId: uuid('ingredient_id').references(() => agrIngredients.id, {
      onDelete: 'set null',
    }),
    limitText: text('limit_text').notNull(),
    maxTotalCount: integer('max_total_count'),
  },
  (table) => [
    primaryKey({ columns: [table.usageRuleId, table.ordinalPosition] }),
    index('idx_agr_usage_limits_ing_id').on(table.ingredientId),
  ],
);

export const agrPesticidesRelations = relations(agrPesticides, ({ many }) => ({
  ingredients: many(agrPesticideIngredients),
  usageRules: many(agrUsageRules),
}));

export const agrIngredientsRelations = relations(agrIngredients, ({ many }) => ({
  pesticides: many(agrPesticideIngredients),
}));

export const agrPesticideIngredientsRelations = relations(agrPesticideIngredients, ({ one }) => ({
  pesticide: one(agrPesticides, {
    fields: [agrPesticideIngredients.registrationNumber],
    references: [agrPesticides.registrationNumber],
  }),
  ingredient: one(agrIngredients, {
    fields: [agrPesticideIngredients.ingredientId],
    references: [agrIngredients.id],
  }),
}));

export const agrCropsRelations = relations(agrCrops, ({ one, many }) => ({
  parent: one(agrCrops, {
    fields: [agrCrops.parentId],
    references: [agrCrops.id],
    relationName: 'crop_hierarchy',
  }),
  children: many(agrCrops, { relationName: 'crop_hierarchy' }),
  usageRules: many(agrUsageRules),
}));

export const agrUsageRulesRelations = relations(agrUsageRules, ({ one, many }) => ({
  pesticide: one(agrPesticides, {
    fields: [agrUsageRules.registrationNumber],
    references: [agrPesticides.registrationNumber],
  }),
  crop: one(agrCrops, { fields: [agrUsageRules.cropId], references: [agrCrops.id] }),
  pests: many(agrUsagePests),
  ingredientLimits: many(agrUsageIngredientLimits),
}));

export const agrUsagePestsRelations = relations(agrUsagePests, ({ one }) => ({
  usageRule: one(agrUsageRules, {
    fields: [agrUsagePests.usageRuleId],
    references: [agrUsageRules.id],
  }),
  pest: one(agrPests, { fields: [agrUsagePests.pestId], references: [agrPests.id] }),
}));

export const agrUsageIngredientLimitsRelations = relations(agrUsageIngredientLimits, ({ one }) => ({
  usageRule: one(agrUsageRules, {
    fields: [agrUsageIngredientLimits.usageRuleId],
    references: [agrUsageRules.id],
  }),
  ingredient: one(agrIngredients, {
    fields: [agrUsageIngredientLimits.ingredientId],
    references: [agrIngredients.id],
  }),
}));
