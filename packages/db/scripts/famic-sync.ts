import { parseArgs } from 'node:util';
import { createDb } from '../src/client';
import { loadEnvFile, requireDatabaseUrl } from '../src/env';
import { CROP_HIERARCHY, INGREDIENT_META, importFamicDataset, loadCsvTables, mapFamicTables } from '../src/famic';

/**
 * FAMIC 農薬登録情報の同期バッチ
 *   pnpm famic:sync -- [--expire] [--dry-run] <ZIP/CSVのパスまたはURL ...>
 * 引数省略時は FAMIC_SOURCES（カンマ区切り）を使う。
 */
export async function runFamicSync(argv = process.argv.slice(2)) {
  loadEnvFile();
  const { values, positionals } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    allowPositionals: true,
    options: {
      expire: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const sources = positionals.length
    ? positionals
    : (process.env.FAMIC_SOURCES ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  if (sources.length === 0) {
    throw new Error('取込元を引数か FAMIC_SOURCES で指定してください');
  }

  const tables = (await Promise.all(sources.map(loadCsvTables))).flat();
  for (const t of tables) console.log(`読込: ${t.name} (${t.rows.length}行)`);

  const dataset = mapFamicTables(tables);
  console.log(`正規化: 農薬 ${dataset.pesticides.length}件 / 適用 ${dataset.usageRules.length}件`);

  const { db, pool } = createDb(requireDatabaseUrl());
  try {
    const summary = await importFamicDataset(db, dataset, {
      cropHierarchy: CROP_HIERARCHY,
      ingredientMeta: INGREDIENT_META,
      expire: values.expire,
      dryRun: values['dry-run'],
      log: console.log,
    });
    console.log('同期結果:', {
      ...summary,
      unclassifiedCrops: summary.unclassifiedCrops.length,
      missingRegistrationNumbers: summary.missingRegistrationNumbers.length,
    });
    if (summary.unclassifiedCrops.length) {
      console.log(
        `作物階層が未設定の作物: ${summary.unclassifiedCrops.slice(0, 50).join('、')}${summary.unclassifiedCrops.length > 50 ? ' ...' : ''}`,
      );
    }
    if (summary.missingRegistrationNumbers.length && !values.expire) {
      console.log(
        'データセットに無い登録番号があります（失効の可能性）。削除するには --expire を付けて実行してください',
      );
    }
    return summary;
  } finally {
    await pool.end();
  }
}

if (import.meta.filename === process.argv[1]) {
  runFamicSync().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
