#!/usr/bin/env bash
#
# 【Responsibility】ビルド、バージョン付きコミット、push、Firebase Hosting デプロイをこの順で実行する。
# - ビルドが失敗したら commit / push / deploy には進まない。
# - 直前の MAJOR.MINOR.PATCH コミットの PATCH を +1 したメッセージで commit する。
# - 履歴にバージョンが無い場合は 0.0.1 から始める。
# - .env 系はコミットしない。
# - 実行: リポジトリ直下、または apps/web で `bun run deploy`
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${ROOT}/apps/web/node_modules/.bin:${ROOT}/node_modules/.bin:${PATH}"
export GIT_PAGER=cat

# 直近のバージョン形式コミットから、次の PATCH バージョンを求める。
# @returns 次バージョン（例: 0.0.6）。履歴が無い場合は 0.0.1。
resolve_next_version() {
  local last=""
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    last="$(git log --format='%s' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)"
  fi
  if [ -z "$last" ]; then
    echo "0.0.1"
    return
  fi

  local major minor patch
  IFS='.' read -r major minor patch <<< "$last"
  echo "${major}.${minor}.$((patch + 1))"
}

# package.json の version をコミットメッセージと揃える。
# @param $1 次バージョン
sync_package_version() {
  local version="$1"
  node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const path = process.argv[1];
const version = process.argv[2];
const pkg = JSON.parse(readFileSync(path, "utf8"));
const { name, version: _current, ...rest } = pkg;
writeFileSync(path, JSON.stringify({ name, version, ...rest }, null, 2) + "\n");
' "${ROOT}/package.json" "$version"
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "エラー: git リポジトリではありません。" >&2
  exit 1
fi

echo "==> build"
pnpm build

NEXT_VERSION="$(resolve_next_version)"
echo "==> 次バージョン: ${NEXT_VERSION}"
sync_package_version "${NEXT_VERSION}"

git add --all

blocked="$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' || true)"
if [ -n "$blocked" ]; then
  echo "エラー: 秘密情報を含むファイルがコミット対象です。" >&2
  echo "$blocked" >&2
  exit 1
fi

if git diff --cached --quiet; then
  echo "コミットする変更はありません。push とデプロイを実行します。"
else
  echo "コミット対象:"
  git --no-pager diff --cached --stat
  git commit -m "${NEXT_VERSION}"
  echo "コミットしました: ${NEXT_VERSION}"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "エラー: remote origin がありません。push 先を設定してから再実行してください。" >&2
  exit 1
fi

git push -u origin HEAD
echo "push しました: $(git rev-parse --abbrev-ref HEAD)"

echo "==> Firebase Hosting"
node apps/web/scripts/deploy-hosting.mjs

echo "デプロイ完了: ${NEXT_VERSION}"
echo "Hosting URL: https://pesticide-platform.web.app"
