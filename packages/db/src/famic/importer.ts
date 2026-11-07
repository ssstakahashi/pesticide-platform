import { createHash } from 'node:crypto';
import { and, getTableColumns, inArray, sql, TransactionRollbackError, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Database } from '../client';
import {
  agrCrops,
  agrIngredients,
  agrPesticideIngredients,
  agrPesticides,
  agrPests,
  agrUsageIngredientLimits,
  agrUsagePests,
  agrUsageRules,
} from '../schema';
import { parseCount, parseCropName, parseDilution, parsePhiDays } from './parse';
import type { CropNode, FamicDataset, IngredientMeta } from './types';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export type ImportOptions = {
  cropHierarchy?: CropNode[];
  ingredientMeta?: IngredientMeta[];
  /** データセットに存在しない（失効した）登録番号を削除する */
  expire?: boolean;
  dryRun?: boolean;
  log?: (message: string) => void;
};

export type ImportSummary = {
  pesticides: number;
  usageRules: number;
  ingredients: number;
  pests: number;
  unclassifiedCrops: string[];
  missingRegistrationNumbers: string[];
  expired: number;
};

const CHUNK = 1000;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 同じ入力行から常に同じIDを得るための決定的UUID（差分Upsert用） */
function deterministicUuid(input: string): string {
  const h = createHash('sha1').update(input).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** ON CONFLICT DO UPDATE SET col = excluded.col をまとめて生成する */
function excludedSet<T extends PgTable>(table: T, omit: string[] = []): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (omit.includes(key)) continue;
    set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

function flattenHierarchy(nodes: CropNode[], level = 1, parent: string | null = null) {
  const out: { name: string; parent: string | null; level: number; synonyms: string[] }[] = [];
  for (const node of nodes) {
    const isLeaf = !node.children?.length;
    out.push({ name: node.name, parent, level: isLeaf ? Math.max(level, 3) : level, synonyms: node.synonyms ?? [] });
    if (node.children) out.push(...flattenHierarchy(node.children, level + 1, node.name));
  }
  return out;
}

async function upsertCropHierarchy(tx: Tx, hierarchy: CropNode[]) {
  const flat = flattenHierarchy(hierarchy);
  for (const part of chunks(flat)) {
    await tx
      .insert(agrCrops)
      .values(part.map(({ name, level, synonyms }) => ({ name, level, synonyms })))
      .onConflictDoNothing({ target: agrCrops.name });
  }
  const ids = await cropIdMap(
    tx,
    flat.map((c) => c.name),
  );
  for (const crop of flat) {
    if (!crop.parent) continue;
    await tx
      .update(agrCrops)
      .set({ parentId: ids.get(crop.parent)! })
      .where(sql`${agrCrops.name} = ${crop.name} AND ${agrCrops.parentId} IS NULL`);
  }
}

async function cropIdMap(tx: Tx, names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const part of chunks([...new Set(names)])) {
    const rows = await tx
      .select({ id: agrCrops.id, name: agrCrops.name })
      .from(agrCrops)
      .where(inArray(agrCrops.name, part));
    for (const r of rows) map.set(r.name, r.id);
  }
  return map;
}

async function ensureByName(
  tx: Tx,
  table: typeof agrIngredients | typeof agrPests,
  names: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(names)];
  const map = new Map<string, string>();
  for (const part of chunks(unique)) {
    await tx
      .insert(table)
      .values(part.map((name) => ({ name })))
      .onConflictDoNothing({ target: table.name });
    const rows = await tx.select({ id: table.id, name: table.name }).from(table).where(inArray(table.name, part));
    for (const r of rows) map.set(r.name, r.id);
  }
  return map;
}

export async function importFamicDataset(
  db: Database,
  dataset: FamicDataset,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const log = options.log ?? (() => {});
  const regNumbers = [...new Set(dataset.pesticides.map((p) => p.registrationNumber))];
  if (regNumbers.length === 0)
    throw new Error('取り込む農薬データが0件です（CSVの列名・文字コードを確認してください）');

  const knownRegNumbers = new Set(regNumbers);
  const usageRules = dataset.usageRules.filter((r) => knownRegNumbers.has(r.registrationNumber));
  const skipped = dataset.usageRules.length - usageRules.length;
  if (skipped > 0) log(`基本部に存在しない登録番号の適用行を ${skipped} 件スキップしました`);

  let summary: ImportSummary | undefined;
  try {
    await db.transaction(async (tx) => {
      if (options.cropHierarchy) await upsertCropHierarchy(tx, options.cropHierarchy);

      // 農薬基本部
      for (const part of chunks(dataset.pesticides)) {
        await tx
          .insert(agrPesticides)
          .values(part.map(({ ingredients: _ingredients, ...p }) => p))
          .onConflictDoUpdate({
            target: agrPesticides.registrationNumber,
            set: excludedSet(agrPesticides, ['registrationNumber', 'rawId', 'createdAt']),
          });
      }

      // 有効成分マスタ（RACコード・合算グループは既存値を優先しつつメタ情報で補完）
      const ingredientNames = [
        ...dataset.pesticides.flatMap((p) => p.ingredients.map((i) => i.name)),
        ...(options.ingredientMeta ?? []).map((m) => m.name),
      ];
      const ingredientIds = await ensureByName(tx, agrIngredients, ingredientNames);
      for (const meta of options.ingredientMeta ?? []) {
        await tx
          .update(agrIngredients)
          .set({
            totalCountGroupName: sql`COALESCE(${agrIngredients.totalCountGroupName}, ${meta.totalCountGroupName ?? null})`,
            fracCode: sql`COALESCE(${agrIngredients.fracCode}, ${meta.fracCode ?? null})`,
            iracCode: sql`COALESCE(${agrIngredients.iracCode}, ${meta.iracCode ?? null})`,
            hracCode: sql`COALESCE(${agrIngredients.hracCode}, ${meta.hracCode ?? null})`,
          })
          .where(sql`${agrIngredients.name} = ${meta.name}`);
      }

      for (const part of chunks(regNumbers)) {
        await tx.delete(agrPesticideIngredients).where(inArray(agrPesticideIngredients.registrationNumber, part));
      }
      const pesticideIngredientRows = dataset.pesticides.flatMap((p) =>
        p.ingredients.map((i, idx) => ({
          registrationNumber: p.registrationNumber,
          ingredientId: ingredientIds.get(i.name)!,
          ordinalPosition: idx + 1,
          concentrationText: i.concentrationText,
        })),
      );
      for (const part of chunks(pesticideIngredientRows)) {
        await tx.insert(agrPesticideIngredients).values(part);
      }

      // 作物（階層マスタにない作物は未分類として追加）
      const parsedRules = usageRules.map((rule) => ({ rule, crop: parseCropName(rule.rawCropName) }));
      const cropNames = parsedRules.flatMap(({ crop }) => [crop.name, ...crop.excludedNames]);
      const existingCrops = await cropIdMap(tx, cropNames);
      const unclassifiedCrops = [...new Set(cropNames)].filter((n) => !existingCrops.has(n));
      for (const part of chunks(unclassifiedCrops)) {
        await tx
          .insert(agrCrops)
          .values(part.map((name) => ({ name })))
          .onConflictDoNothing();
      }
      const cropIds = await cropIdMap(tx, cropNames);

      // 病害虫
      const pestIds = await ensureByName(
        tx,
        agrPests,
        parsedRules.flatMap(({ rule }) => rule.pests),
      );

      // 適用部（行内容から決定的IDを作り、消えた行は削除・残った行は更新）
      const seen = new Set<string>();
      const ruleRows = parsedRules
        .map(({ rule, crop }) => {
          const id = deterministicUuid(
            JSON.stringify([
              rule.registrationNumber,
              rule.rawCropName,
              rule.pests,
              rule.applicationPlace,
              rule.purpose,
              rule.applicationMethod,
              rule.dilutionText,
              rule.usageTimingText,
              rule.zoneName,
              rule.soilType,
              rule.appliedPesticideName,
            ]),
          );
          if (seen.has(id)) return null;
          seen.add(id);
          const dilution = parseDilution(rule.dilutionText);
          return {
            rule,
            values: {
              id,
              registrationNumber: rule.registrationNumber,
              cropId: cropIds.get(crop.name)!,
              rawCropName: rule.rawCropName,
              cropCondition: crop.condition,
              excludedCropNames: crop.excludedNames.length ? crop.excludedNames : null,
              excludedCropIds: crop.excludedNames.length ? crop.excludedNames.map((n) => cropIds.get(n)!) : null,
              applicationPlace: rule.applicationPlace,
              purpose: rule.purpose,
              applicationMethod: rule.applicationMethod,
              dilutionText: rule.dilutionText,
              dilutionMin: dilution.min,
              dilutionMax: dilution.max,
              dilutionUnit: dilution.unit,
              liquidAmount: rule.liquidAmount,
              usageTimingText: rule.usageTimingText,
              phiDays: parsePhiDays(rule.usageTimingText),
              maxApplicationsText: rule.maxApplicationsText,
              maxApplicationsCount: parseCount(rule.maxApplicationsText),
              fumigationTime: rule.fumigationTime,
              fumigationTemperature: rule.fumigationTemperature,
              soilType: rule.soilType,
              zoneName: rule.zoneName,
              appliedPesticideName: rule.appliedPesticideName,
            },
          };
        })
        .filter((r) => r !== null);

      const ruleIds = ruleRows.map((r) => r.values.id);
      for (const part of chunks(regNumbers)) {
        await tx
          .delete(agrUsageRules)
          .where(
            and(
              inArray(agrUsageRules.registrationNumber, part),
              sql`NOT (${agrUsageRules.id} = ANY(${sql.param(ruleIds)}::uuid[]))`,
            ),
          );
      }
      for (const part of chunks(ruleRows)) {
        await tx
          .insert(agrUsageRules)
          .values(part.map((r) => r.values))
          .onConflictDoUpdate({ target: agrUsageRules.id, set: excludedSet(agrUsageRules, ['id', 'createdAt']) });
      }

      for (const part of chunks(ruleIds)) {
        await tx.delete(agrUsagePests).where(inArray(agrUsagePests.usageRuleId, part));
        await tx.delete(agrUsageIngredientLimits).where(inArray(agrUsageIngredientLimits.usageRuleId, part));
      }

      const ingredientsByReg = new Map(
        dataset.pesticides.map((p) => [p.registrationNumber, p.ingredients.map((i) => ingredientIds.get(i.name)!)]),
      );
      const pestRows = ruleRows.flatMap(({ rule, values }) =>
        rule.pests.map((p) => ({ usageRuleId: values.id, pestId: pestIds.get(p)!, conditionNote: '' })),
      );
      const limitRows = ruleRows.flatMap(({ rule, values }) =>
        rule.ingredientLimitTexts.flatMap((text, idx) =>
          text
            ? [
                {
                  usageRuleId: values.id,
                  ordinalPosition: idx + 1,
                  ingredientId: ingredientsByReg.get(rule.registrationNumber)?.[idx] ?? null,
                  limitText: text,
                  maxTotalCount: parseCount(text),
                },
              ]
            : [],
        ),
      );
      for (const part of chunks(pestRows)) {
        await tx.insert(agrUsagePests).values(part).onConflictDoNothing();
      }
      for (const part of chunks(limitRows)) {
        await tx.insert(agrUsageIngredientLimits).values(part);
      }

      // 失効処理: データセットに存在しない登録番号
      const missing: string[] = [];
      const existing = await tx.select({ reg: agrPesticides.registrationNumber }).from(agrPesticides);
      for (const { reg } of existing) if (!knownRegNumbers.has(reg)) missing.push(reg);
      let expired = 0;
      if (options.expire && missing.length > existing.length / 2) {
        throw new Error(
          `失効対象が既存件数の半数を超えています（${missing.length}/${existing.length}件）。入力データが不完全な可能性があるため中断しました`,
        );
      }
      if (options.expire && missing.length > 0) {
        for (const part of chunks(missing)) {
          const deleted = await tx
            .delete(agrPesticides)
            .where(inArray(agrPesticides.registrationNumber, part))
            .returning({ reg: agrPesticides.registrationNumber });
          expired += deleted.length;
        }
      }

      summary = {
        pesticides: regNumbers.length,
        usageRules: ruleRows.length,
        ingredients: new Set(ingredientNames).size,
        pests: pestIds.size,
        unclassifiedCrops,
        missingRegistrationNumbers: missing,
        expired,
      };

      if (options.dryRun) {
        log('dry-run のためロールバックします');
        tx.rollback();
      }
    });
  } catch (err) {
    if (!(options.dryRun && err instanceof TransactionRollbackError)) throw err;
  }
  return summary!;
}
