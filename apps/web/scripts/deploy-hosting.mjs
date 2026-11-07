import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(webRoot, '.env');
const fromFile = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const project = (process.env.FIREBASE_PROJECT_ID || fromFile.FIREBASE_PROJECT_ID || '').trim();
const argv = process.argv.slice(2);
const hasProjectFlag = argv.some((arg) => arg === '--project' || arg === '-P' || arg.startsWith('--project='));

if (project && !/^[A-Za-z0-9_-]+$/.test(project)) {
  console.error('FIREBASE_PROJECT_ID は英数字・ハイフン・アンダースコアだけにしてください。');
  process.exit(1);
}

const args = ['deploy', '--only', 'hosting'];
if (project && !hasProjectFlag) args.push('--project', project);
args.push(...argv);

const result = spawnSync('firebase', args, { cwd: webRoot, stdio: 'inherit' });
if (result.error) {
  console.error(
    result.error.code === 'ENOENT'
      ? 'firebase コマンドが見つかりません。Firebase CLI をインストールしてください。'
      : result.error.message,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
