import { normalizeText, parseCount, parseDate, splitPests } from './parse';
import type { CsvTable } from './source';
import type { FamicDataset, NormalizedPesticide, NormalizedUsageRule } from './types';

/**
 * FAMIC 農薬登録情報 CSV の列名候補（NFKC 正規化・空白除去後）。
 * 公開データの列名が変わった場合はここだけ直せばよい。
 */
const BASIC_COLUMNS = {
  registrationNumber: ['登録番号'],
  pesticideType: ['農薬の種類'],
  name: ['農薬の名称', '農薬名'],
  registrantName: ['登録を有する者の名称', '正式名称', '登録者'],
  usageCategory: ['用途'],
  formulationType: ['剤型名', '剤型'],
  ingredientName: ['有効成分', '有効成分名', '有効成分の種類'],
  concentration: ['濃度', '有効成分の含有濃度', '含有濃度'],
  mixtureCount: ['混合数'],
  registeredDate: ['登録年月日', '登録日'],
} as const;

const USAGE_COLUMNS = {
  registrationNumber: ['登録番号'],
  cropName: ['作物名'],
  applicationPlace: ['適用場所'],
  pests: ['適用病害虫雑草名', '適用病害虫名'],
  purpose: ['使用目的'],
  dilution: ['希釈倍数使用量', '希釈倍数', '使用量'],
  liquidAmount: ['散布液量'],
  usageTiming: ['使用時期'],
  maxApplications: ['本剤の使用回数'],
  applicationMethod: ['使用方法'],
  fumigationTime: ['くん蒸時間'],
  fumigationTemperature: ['くん蒸温度'],
  soilType: ['適用土壌'],
  zoneName: ['適用地帯名'],
  appliedPesticideName: ['適用農薬名'],
} as const;

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';

type ColumnMap<T extends Record<string, readonly string[]>> = Record<keyof T, string | undefined>;

function resolveColumns<T extends Record<string, readonly string[]>>(header: string[], spec: T): ColumnMap<T> {
  const out = {} as ColumnMap<T>;
  for (const key of Object.keys(spec) as (keyof T)[]) {
    out[key] = spec[key]!.find((c) => header.includes(c));
  }
  return out;
}

/** 「有効成分①を含む農薬の総使用回数」等の列を ordinal 順に並べる */
function ingredientLimitColumns(header: string[]): string[] {
  const cols: { col: string; ordinal: number }[] = [];
  for (const col of header) {
    const m = col.match(/有効成分(.+?)を含む農薬の総使用回数/);
    if (!m?.[1]) continue;
    const circled = CIRCLED.indexOf(m[1]);
    const ordinal = circled >= 0 ? circled + 1 : Number(m[1].normalize('NFKC'));
    if (Number.isFinite(ordinal) && ordinal > 0) cols.push({ col, ordinal });
  }
  const out: string[] = [];
  for (const { col, ordinal } of cols) out[ordinal - 1] = col;
  return out;
}

const isUsageTable = (t: CsvTable) => t.header.includes('作物名');

const get = (row: Record<string, string>, col: string | undefined) => (col ? normalizeText(row[col]) : null);

function mapPesticides(tables: CsvTable[]): NormalizedPesticide[] {
  const byReg = new Map<string, NormalizedPesticide>();
  for (const table of tables) {
    const cols = resolveColumns(table.header, BASIC_COLUMNS);
    if (!cols.registrationNumber || !cols.name) {
      throw new Error(
        `基本部CSV(${table.name})に「登録番号」「農薬の名称」列が見つかりません: ${table.header.join(',')}`,
      );
    }
    for (const row of table.rows) {
      const reg = get(row, cols.registrationNumber);
      const name = get(row, cols.name);
      if (!reg || !name) continue;
      let p = byReg.get(reg);
      if (!p) {
        p = {
          registrationNumber: reg,
          name,
          pesticideType: get(row, cols.pesticideType),
          registrantName: get(row, cols.registrantName),
          usageCategory: get(row, cols.usageCategory),
          formulationType: get(row, cols.formulationType),
          mixtureCount: parseCount(`${get(row, cols.mixtureCount) ?? ''}回`),
          registeredDate: parseDate(get(row, cols.registeredDate)),
          ingredients: [],
        };
        byReg.set(reg, p);
      }
      const ingredient = get(row, cols.ingredientName);
      if (ingredient && !p.ingredients.some((i) => i.name === ingredient)) {
        p.ingredients.push({ name: ingredient, concentrationText: get(row, cols.concentration) });
      }
    }
  }
  return [...byReg.values()];
}

function mapUsageRules(tables: CsvTable[]): NormalizedUsageRule[] {
  const rules: NormalizedUsageRule[] = [];
  for (const table of tables) {
    const cols = resolveColumns(table.header, USAGE_COLUMNS);
    if (!cols.registrationNumber || !cols.cropName) {
      throw new Error(`適用部CSV(${table.name})に「登録番号」「作物名」列が見つかりません`);
    }
    const limitCols = ingredientLimitColumns(table.header);
    for (const row of table.rows) {
      const reg = get(row, cols.registrationNumber);
      const crop = get(row, cols.cropName);
      if (!reg || !crop) continue;
      rules.push({
        registrationNumber: reg,
        rawCropName: crop,
        pests: splitPests(get(row, cols.pests)),
        applicationPlace: get(row, cols.applicationPlace),
        purpose: get(row, cols.purpose),
        applicationMethod: get(row, cols.applicationMethod),
        dilutionText: get(row, cols.dilution),
        liquidAmount: get(row, cols.liquidAmount),
        usageTimingText: get(row, cols.usageTiming),
        maxApplicationsText: get(row, cols.maxApplications),
        fumigationTime: get(row, cols.fumigationTime),
        fumigationTemperature: get(row, cols.fumigationTemperature),
        soilType: get(row, cols.soilType),
        zoneName: get(row, cols.zoneName),
        appliedPesticideName: get(row, cols.appliedPesticideName),
        ingredientLimitTexts: Array.from(limitCols, (c) => get(row, c)),
      });
    }
  }
  return rules;
}

/** 読み込んだCSVを列構成で「基本部」「適用部」に振り分けて正規化する */
export function mapFamicTables(tables: CsvTable[]): FamicDataset {
  return {
    pesticides: mapPesticides(tables.filter((t) => !isUsageTable(t))),
    usageRules: mapUsageRules(tables.filter(isUsageTable)),
  };
}
