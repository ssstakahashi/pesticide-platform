import { notInArray, sql } from 'drizzle-orm';
import { createDb } from '../src/client';
import { agrPesticides } from '../src/schema';
import { loadEnvFile, requireDatabaseUrl } from '../src/env';
import { CROP_HIERARCHY, INGREDIENT_META, importFamicDataset } from '../src/famic';
import type { FamicDataset, NormalizedUsageRule } from '../src/famic';

/**
 * 動作確認用のサンプルデータ（実際の登録内容ではありません）。
 * 本番データは famic:sync で FAMIC の公開データから取り込んでください。
 */
const rule = (
  r: Partial<NormalizedUsageRule> & Pick<NormalizedUsageRule, 'registrationNumber' | 'rawCropName' | 'pests'>,
): NormalizedUsageRule => ({
  applicationPlace: null,
  purpose: null,
  applicationMethod: null,
  dilutionText: null,
  liquidAmount: null,
  usageTimingText: null,
  maxApplicationsText: null,
  fumigationTime: null,
  fumigationTemperature: null,
  soilType: null,
  zoneName: null,
  appliedPesticideName: null,
  ingredientLimitTexts: [],
  ...r,
});

const pesticide = (
  registrationNumber: string,
  name: string,
  usageCategory: string,
  formulationType: string,
  ingredients: string[],
) => ({
  registrationNumber,
  name,
  pesticideType: null,
  registrantName: 'サンプル',
  usageCategory,
  formulationType,
  mixtureCount: ingredients.length,
  registeredDate: null,
  ingredients: ingredients.map((name) => ({ name, concentrationText: null })),
});

const ACETAMIPRID_LIMIT = '4回以内(定植時までの処理は1回以内、散布は3回以内)';

const SAMPLE: FamicDataset = {
  pesticides: [
    pesticide('23623', 'アベイル粒剤', '殺虫剤', '粒剤', ['アセタミプリド', 'シアントラニリプロール']),
    pesticide('22583', 'モスピラン顆粒水溶剤', '殺虫剤', '水溶剤', ['アセタミプリド']),
    pesticide('90001', 'ベリマークSC（サンプル）', '殺虫剤', '水和剤', ['シアントラニリプロール']),
    pesticide('90002', 'ミネクトデュオ粒剤（サンプル）', '殺虫剤', '粒剤', [
      'チアメトキサム',
      'シアントラニリプロール',
    ]),
    pesticide('90003', 'ダコニール1000（サンプル）', '殺菌剤', '水和剤', ['TPN']),
  ],
  usageRules: [
    rule({
      registrationNumber: '23623',
      rawCropName: 'すいか',
      pests: ['アブラムシ類', 'コナジラミ類'],
      dilutionText: '1~2g/株',
      usageTimingText: '定植時',
      maxApplicationsText: '1回',
      applicationMethod: '植穴土壌混和',
      ingredientLimitTexts: [ACETAMIPRID_LIMIT, '1回以内'],
    }),
    rule({
      registrationNumber: '22583',
      rawCropName: 'すいか',
      pests: ['アブラムシ類', 'ミナミキイロアザミウマ'],
      dilutionText: '2000~4000倍',
      liquidAmount: '100~300L/10a',
      usageTimingText: '収穫前日まで',
      maxApplicationsText: '3回以内',
      applicationMethod: '散布',
      ingredientLimitTexts: [ACETAMIPRID_LIMIT],
    }),
    rule({
      registrationNumber: '90001',
      rawCropName: 'すいか',
      pests: ['アブラムシ類', 'ウリハムシ'],
      dilutionText: '400倍',
      usageTimingText: '育苗期後半~定植当日',
      maxApplicationsText: '1回',
      applicationMethod: '株元灌注',
      ingredientLimitTexts: ['1回以内'],
    }),
    rule({
      registrationNumber: '90002',
      rawCropName: 'すいか',
      pests: ['アブラムシ類', 'アザミウマ類'],
      dilutionText: '1g/株',
      usageTimingText: '定植時',
      maxApplicationsText: '1回',
      applicationMethod: '植穴土壌混和',
      ingredientLimitTexts: ['1回以内', '1回以内'],
    }),
    rule({
      registrationNumber: '90003',
      rawCropName: '果菜類',
      pests: ['うどんこ病', '炭疽病'],
      dilutionText: '1000倍',
      usageTimingText: '収穫前日まで',
      maxApplicationsText: '4回以内',
      applicationMethod: '散布',
      ingredientLimitTexts: ['4回以内'],
    }),
    rule({
      registrationNumber: '90003',
      rawCropName: '野菜類(すいかを除く)',
      pests: ['べと病'],
      dilutionText: '1000倍',
      usageTimingText: '収穫7日前まで',
      maxApplicationsText: '2回以内',
      applicationMethod: '散布',
      ingredientLimitTexts: ['2回以内'],
    }),
  ],
};

loadEnvFile();
const { db, pool } = createDb(requireDatabaseUrl());
try {
  const sampleNumbers = SAMPLE.pesticides.map((p) => p.registrationNumber);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agrPesticides)
    .where(notInArray(agrPesticides.registrationNumber, sampleNumbers));
  const count = row?.count ?? 0;
  if (count > 0) {
    throw new Error(
      `実データ（${count}件）が入っている DB にはサンプルデータを投入できません（登録番号が重複し上書きされるため）`,
    );
  }

  const summary = await importFamicDataset(db, SAMPLE, {
    cropHierarchy: CROP_HIERARCHY,
    ingredientMeta: INGREDIENT_META,
    log: console.log,
  });
  console.log('サンプルデータを投入しました:', summary);
} finally {
  await pool.end();
}
