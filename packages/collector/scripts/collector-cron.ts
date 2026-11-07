import cron from 'node-cron';
import { createDb, loadEnvFile, requireDatabaseUrl } from '@pesticide/db';
import { createSearchProvider, parseCollectorConfig, PoliteFetcher, runBatch } from '../src';

loadEnvFile();
const config = parseCollectorConfig();
const { db } = createDb(requireDatabaseUrl());
const deps = {
  db,
  config,
  fetcher: new PoliteFetcher(config.COLLECTOR_USER_AGENT, config.COLLECTOR_HOST_INTERVAL_MS),
  search: createSearchProvider(config),
  log: (message: string) => console.log(`[${new Date().toISOString()}] ${message}`),
};

let running = false;
cron.schedule(
  config.COLLECTOR_CRON,
  async () => {
    if (running) return;
    running = true;
    try {
      deps.log(`収集バッチ完了: ${JSON.stringify(await runBatch(deps))}`);
    } catch (err) {
      console.error('収集バッチに失敗しました', err);
    } finally {
      running = false;
    }
  },
  { timezone: 'Asia/Tokyo' },
);

deps.log(
  `農薬資料収集 bot を起動しました (cron: ${config.COLLECTOR_CRON}, 検索: ${deps.search.name}, 1回 ${config.COLLECTOR_BATCH_SIZE} 件)`,
);
