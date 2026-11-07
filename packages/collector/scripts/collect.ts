import { parseArgs } from 'node:util';
import { createDb, loadEnvFile, requireDatabaseUrl } from '@pesticide/db';
import {
  addCandidateUrl,
  collectForPesticide,
  completeJob,
  createSearchProvider,
  parseCollectorConfig,
  PoliteFetcher,
  runBatch,
} from '../src';

/**
 * 農薬資料収集 bot（単発実行）
 *   pnpm collect -- --batch 10                       期限が来た農薬をまとめて処理
 *   pnpm collect -- --reg 23623                      指定した農薬だけ処理
 *   pnpm collect -- --reg 23623 --url https://...    公式ページURLを登録して処理
 */
loadEnvFile();
const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    reg: { type: 'string' },
    url: { type: 'string', multiple: true },
    batch: { type: 'string' },
  },
});

const config = parseCollectorConfig();
const { db, pool } = createDb(requireDatabaseUrl());
const deps = {
  db,
  config,
  fetcher: new PoliteFetcher(config.COLLECTOR_USER_AGENT, config.COLLECTOR_HOST_INTERVAL_MS),
  search: createSearchProvider(config),
  log: console.log,
};

try {
  if (values.reg) {
    for (const url of values.url ?? []) console.log(`URL登録: ${await addCandidateUrl(db, values.reg, url)}`);
    const stats = await collectForPesticide(deps, values.reg);
    await completeJob(db, values.reg, stats, config.COLLECTOR_RECHECK_DAYS);
  } else {
    console.log(await runBatch(deps, values.batch ? Number(values.batch) : undefined));
  }
} finally {
  await pool.end();
}
