# pesticide-platform

FAMIC 農薬登録情報にもとづく農薬検索・使用回数検証プラットフォーム（Turborepo + pnpm モノレポ）。

| パス                    | 内容                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web`              | 検索フロントエンド（React + Vite + TanStack Router/Query/Table + shadcn/ui → Firebase Hosting） |
| `apps/api`              | API（Hono + @hono/zod-openapi + Drizzle → 自社 Ubuntu / PM2 / Cloudflare Tunnel）               |
| `packages/api-contract` | Zod スキーマ・OpenAPI ルート定義・OpenAPI から生成した型                                        |
| `packages/db`           | Drizzle スキーマ・マイグレーション（pg_trgm / 検索関数）・FAMIC 同期バッチ                      |
| `packages/collector`    | 検証用データ（公式ページ・PDF資料・商品画像）の収集・自動検証 bot                               |
| `infra`                 | PM2 / Cloudflare Tunnel / Docker(PostgreSQL) の設定例                                           |

## セットアップ

```bash
pnpm install
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/collector/.env.example packages/collector/.env

pnpm db:migrate               # 未適用のマイグレーションのみ適用（履歴は drizzle.__pesticide_platform_migrations）
pnpm dev                      # web: http://localhost:5173 / api: http://localhost:8790
```

接続先は既存の PostgreSQL `agri` DB の public スキーマです（データ投入済み・他プロジェクトと共有）。

- `agri` ではテーブルと `search_agr_pesticides` が既存のため、0000〜0002 は適用済みとして記録し、0003（補助関数）以降を適用しています
- `pnpm db:seed` は空の DB 専用です（実データが入っている DB では中断します）
- 空の DB から作る場合: `createdb <name>` → `DATABASE_URL` を変更 → `pnpm db:migrate && pnpm db:seed`

## API

- `GET /api/pesticides/search?crop=すいか&pest=アブラムシ&category=殺虫` … 上位分類（果菜類・野菜類）の登録・除外作物を考慮した適用検索
- `GET /api/{pesticides|crops|pests}/suggest?q=...` … pg_trgm によるインクリメンタルサーチ
- `GET /api/pesticides/{registrationNumber}` … 農薬詳細
- `POST /api/verify` … 散布履歴から本剤・有効成分ごとの残り使用回数を判定（要 Bearer 認証）
- `GET /api/pesticides/{registrationNumber}/assets` … 採用済みの公式ページ・PDF資料・商品画像（最大5枚）
- `GET /api/files/{document|image}/{id}?exp=&sig=` … 保存ファイルの取得（上記などが返す署名付きURLのみ有効）
- `/api/admin/collection/*` … 収集データのレビュー・候補URL登録・巡回の優先実行・公式ドメイン設定・集計（要 Bearer 認証）
- `GET /api/admin/collection/unverified?limit=20` … 公式ページが無く探索も未了の農薬を登録番号順に最大20件（要 Bearer 認証）
- `POST /api/admin/collection/unverified/checked` … 候補URLが無かった農薬を探索済みにし、次回の未検証一覧から外す（要 Bearer 認証）
- `GET /doc` … OpenAPI 3.1 JSON / `GET /ui` … Swagger UI

### 呼び出し方

- モノレポ内の TypeScript アプリ: `hc<AppType>()`（`import type { AppType } from '@pesticide/api/rpc'`）
- 別リポジトリ・他言語のアプリ: `/doc` の OpenAPI から型やクライアントを生成する
  - `pnpm openapi:generate` で `apps/api/openapi.json` と `packages/api-contract/src/generated/openapi.d.ts` を更新

### 認証

`POST /api/verify` と `/api/admin/*` は `Authorization: Bearer <token>` が必要です。トークンは `API_KEYS`（システム間連携用）か、
Firebase Auth の ID トークン（`FIREBASE_PROJECT_ID` を設定）で検証します。`AUTH_MODE=disabled` はローカル開発専用です。

## FAMIC データ同期

```bash
pnpm famic:sync -- --dry-run ./famic.zip   # 取込内容の確認（ロールバック）
pnpm famic:sync -- ./famic.zip             # 差分 Upsert
pnpm famic:sync -- --expire ./famic.zip    # データに無い登録番号（失効）を削除
```

- ZIP/CSV のパスまたは URL を指定（省略時は `FAMIC_SOURCES`）。Shift_JIS / UTF-8 は自動判定
- CSV の列名は `packages/db/src/famic/mapping.ts` で対応付け。作物階層と有効成分の RAC コードは
  `crop-hierarchy.ts` / `ingredient-meta.ts` で補完
- 適用ルールの ID を作り直すため、定期実行はしない。手動の `famic:sync` も、既存の `agr_usage_rules.id` を参照している場合は実行しない

## 検証用データの収集 bot

農薬ごとに、製造会社の公式製品ページ・仕様書などの PDF・商品画像（最大5枚）を少しずつ収集し、ルールベースで自動検証します。

```bash
pnpm collect -- --reg 23623                                   # 1件だけ収集
pnpm collect -- --reg 23623 --url https://example.co.jp/p/1   # 候補URLを指定して収集
pnpm collect -- --batch 10                                    # 実行時期が来た農薬を10件処理
pnpm --filter @pesticide/collector collector:cron              # 定期実行（COLLECTOR_CRON, 既定は毎時15分）
```

1. URL の発見: 既存の候補（管理画面で登録した URL）＋ Web 検索 API（`SEARCH_PROVIDER=google_cse|brave`）
   - 検索 API を設定しない（`none`）場合は、管理画面で登録した候補 URL のみを巡回します
2. 取得: robots.txt を守り、同一ホストへは `COLLECTOR_HOST_INTERVAL_MS` 間隔でアクセス（社内・プライベート IP へのアクセスは拒否）
3. 検証: 公式ドメイン・登録番号・農薬名・製造会社名の一致をスコア化し、`AUTO_APPROVE_SCORE`（既定90）以上は自動採用、それ未満は「要確認」
4. 確認: Web の「収集データ確認」（`/review`）で承認・却下。公式ページを承認するとそのドメインを製造会社の公式ドメインとして学習し、
   以降は同じ会社の資料が自動採用されやすくなります
5. 再巡回: 成功した農薬は `COLLECTOR_RECHECK_DAYS` 日後、失敗した農薬は 1時間〜最大7日の間隔で再試行

ファイルは `STORAGE_DIR/pesticides/{登録番号}/{documents|images}/{sha256}.{ext}` に保存され、API の署名付き URL
（`FILE_URL_SECRET`, 有効期間 `FILE_URL_TTL_SECONDS`）で配信します。API と collector の `STORAGE_DIR` は同じ場所を指定してください。
PDF の本文抽出（unpdf）には Node.js 24 以上が必要です。

> 収集した PDF・画像の著作権は各製造会社にあります。社内での検証・確認用途にとどめ、外部公開する場合は各社の利用規約を確認してください。

## デプロイ

```bash
pm2 start infra/ecosystem.config.cjs           # API + 収集 bot
bun run deploy                                 # build → commit → push → Firebase Hosting
```

`apps/web/.env` の `VITE_*` は Hosting 用ビルドに埋め込まれます。本番ビルドだけ変える値は `.env.production`、デプロイ先プロジェクトだけ変える値は `.env.<プロジェクトID>` に書きます。プロジェクトは `FIREBASE_PROJECT_ID`（空なら `.firebaserc`）です。

API は `127.0.0.1` で待ち受けるため、外部公開は Cloudflare Tunnel（`infra/cloudflared/config.example.yml`）経由で行います。
