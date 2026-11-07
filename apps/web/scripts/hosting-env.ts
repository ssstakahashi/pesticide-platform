import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const PROJECT_ID_PATTERN = /^[a-z0-9-]+$/;
const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Firebase の predeploy が既に入れるキー。dotenv からは載せない。 */
const RESERVED = new Set(['NODE_ENV', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'PROJECT_DIR', 'RESOURCE_DIR']);

/**
 * `firebase deploy` の predeploy では `GCLOUD_PROJECT` にプロジェクト ID が入る。
 * `.env.<プロジェクトID>` または `.env.<エイリアス>` の値を process.env に載せ、
 * Vite が読む `.env` より優先させる。シェルに既にある変数は変えない。
 * @returns 読み込んだファイル名。該当ファイルが無ければ null。
 */
export function applyHostingProjectEnv(webRoot: string, projectId: string | undefined): string | null {
  if (!projectId || !PROJECT_ID_PATTERN.test(projectId)) return null;

  const idName = `.env.${projectId}`;
  const alias = aliasForProject(webRoot, projectId);
  const aliasName = alias ? `.env.${alias}` : null;
  const idExists = existsSync(join(webRoot, idName));
  const aliasExists = aliasName ? existsSync(join(webRoot, aliasName)) : false;
  if (idExists && aliasExists && aliasName) {
    throw new Error(`${idName} と ${aliasName} は同時に置けません。どちらか一方にしてください。`);
  }

  const filename = idExists ? idName : aliasExists && aliasName ? aliasName : null;
  if (!filename) return null;

  const values = parseEnv(readFileSync(join(webRoot, filename), 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (!value || RESERVED.has(key) || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
  return filename;
}

function aliasForProject(webRoot: string, projectId: string): string | null {
  const rcPath = join(webRoot, '.firebaserc');
  if (!existsSync(rcPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(rcPath, 'utf8')) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !('projects' in parsed)) return null;
  const projects = parsed.projects;
  if (!projects || typeof projects !== 'object') return null;

  const aliases = Object.entries(projects).flatMap(([alias, id]) =>
    alias !== 'default' && id === projectId && ALIAS_PATTERN.test(alias) ? [alias] : [],
  );
  return aliases.length === 1 ? (aliases[0] ?? null) : null;
}
