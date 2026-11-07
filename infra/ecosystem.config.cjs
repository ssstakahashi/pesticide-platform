// PM2 設定（自社 Ubuntu サーバー）
//   pnpm install && pnpm build && pnpm db:migrate
//   pm2 start infra/ecosystem.config.cjs && pm2 save
const path = require('node:path');

const root = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'pesticide-api',
      cwd: path.join(root, 'apps/api'),
      script: 'dist/index.js',
      node_args: '--enable-source-maps',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
    },
    {
      // 公式ページ・PDF・商品画像の収集と自動検証（COLLECTOR_CRON の間隔で少数ずつ巡回）
      name: 'pesticide-collector-cron',
      cwd: path.join(root, 'packages/collector'),
      script: 'node_modules/.bin/tsx',
      args: 'scripts/collector-cron.ts',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
};
