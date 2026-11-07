import { createRoute, z } from '@hono/zod-openapi';
import {
  CandidateUrlRequestSchema,
  CollectionStatsSchema,
  EnqueueJobRequestSchema,
  ErrorSchema,
  FileParamsSchema,
  FileQuerySchema,
  ManufacturerDomainsRequestSchema,
  ManufacturerDomainsSchema,
  MarkPageFinderCheckedRequestSchema,
  MarkPageFinderCheckedResponseSchema,
  PesticideAssetsSchema,
  ReviewActionRequestSchema,
  ReviewActionResponseSchema,
  ReviewListQuerySchema,
  ReviewListResponseSchema,
  UnverifiedPesticidesQuerySchema,
  UnverifiedPesticidesResponseSchema,
  PesticideDetailParamsSchema,
  PesticideDetailSchema,
  PesticideSearchQuerySchema,
  PesticideSearchResponseSchema,
  SuggestQuerySchema,
  SuggestResponseSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
} from './schemas';

const json = <T>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});

export const BEARER_SECURITY_SCHEME = 'Bearer';

export const searchPesticidesRoute = createRoute({
  method: 'get',
  path: '/search',
  tags: ['pesticides'],
  summary: '作物・病害虫・用途から適用可能な農薬を検索（上位分類の登録も含む）',
  request: { query: PesticideSearchQuerySchema },
  responses: {
    200: json(PesticideSearchResponseSchema, '検索結果'),
    400: json(ErrorSchema, '入力エラー'),
  },
});

export const suggestPesticidesRoute = createRoute({
  method: 'get',
  path: '/suggest',
  tags: ['pesticides'],
  summary: '農薬名のあいまい検索（pg_trgm によるインクリメンタルサーチ）',
  request: { query: SuggestQuerySchema },
  responses: {
    200: json(SuggestResponseSchema, '候補一覧'),
    400: json(ErrorSchema, '入力エラー'),
  },
});

export const getPesticideRoute = createRoute({
  method: 'get',
  path: '/{registrationNumber}',
  tags: ['pesticides'],
  summary: '登録番号から農薬の基本情報と有効成分を取得',
  request: { params: PesticideDetailParamsSchema },
  responses: {
    200: json(PesticideDetailSchema, '農薬詳細'),
    400: json(ErrorSchema, '入力エラー'),
    404: json(ErrorSchema, '該当なし'),
  },
});

export const suggestCropsRoute = createRoute({
  method: 'get',
  path: '/suggest',
  tags: ['crops'],
  summary: '作物名のあいまい検索（別名・ひらがな/カタカナ表記ゆれ対応）',
  request: { query: SuggestQuerySchema },
  responses: {
    200: json(SuggestResponseSchema, '候補一覧'),
    400: json(ErrorSchema, '入力エラー'),
  },
});

export const suggestPestsRoute = createRoute({
  method: 'get',
  path: '/suggest',
  tags: ['pests'],
  summary: '病害虫・雑草名のあいまい検索',
  request: { query: SuggestQuerySchema },
  responses: {
    200: json(SuggestResponseSchema, '候補一覧'),
    400: json(ErrorSchema, '入力エラー'),
  },
});

export const getPesticideAssetsRoute = createRoute({
  method: 'get',
  path: '/{registrationNumber}/assets',
  tags: ['pesticides'],
  summary: '採用済みの検証用データ（製造会社の公式ページ・PDF資料・商品画像）を取得',
  request: { params: PesticideDetailParamsSchema },
  responses: {
    200: json(PesticideAssetsSchema, '検証用データ'),
    400: json(ErrorSchema, '入力エラー'),
    404: json(ErrorSchema, '該当なし'),
  },
});

export const getFileRoute = createRoute({
  method: 'get',
  path: '/{type}/{id}',
  tags: ['files'],
  summary: '保存済みの PDF・画像を取得（署名付きURLのみ有効）',
  request: { params: FileParamsSchema, query: FileQuerySchema },
  responses: {
    200: {
      description: 'ファイル本体',
      content: {
        'application/pdf': { schema: z.string().openapi({ format: 'binary' }) },
        'image/*': { schema: z.string().openapi({ format: 'binary' }) },
      },
    },
    400: json(ErrorSchema, '入力エラー'),
    403: json(ErrorSchema, '署名が不正、または期限切れ'),
    404: json(ErrorSchema, '該当なし'),
  },
});

const adminSecurity = [{ [BEARER_SECURITY_SCHEME]: [] }];
const adminErrors = {
  400: json(ErrorSchema, '入力エラー'),
  401: json(ErrorSchema, '認証エラー'),
};

export const listReviewItemsRoute = createRoute({
  method: 'get',
  path: '/review',
  tags: ['admin'],
  summary: '収集データのレビュー一覧（既定は要確認のみ、スコアの高い順）',
  security: adminSecurity,
  request: { query: ReviewListQuerySchema },
  responses: { 200: json(ReviewListResponseSchema, 'レビュー対象'), ...adminErrors },
});

export const reviewItemRoute = createRoute({
  method: 'post',
  path: '/review',
  tags: ['admin'],
  summary: '収集データを承認・却下（公式ページの承認時は製造会社の公式ドメインとして学習）',
  security: adminSecurity,
  request: { body: { content: { 'application/json': { schema: ReviewActionRequestSchema } }, required: true } },
  responses: {
    200: json(ReviewActionResponseSchema, '更新結果'),
    ...adminErrors,
    404: json(ErrorSchema, '該当なし'),
  },
});

export const addCandidateUrlRoute = createRoute({
  method: 'post',
  path: '/candidates',
  tags: ['admin'],
  summary: '公式ページの候補URLを登録し、次回の bot 実行で優先的に検証させる',
  security: adminSecurity,
  request: { body: { content: { 'application/json': { schema: CandidateUrlRequestSchema } }, required: true } },
  responses: {
    200: json(z.object({ url: z.string() }), '登録したURL'),
    ...adminErrors,
    404: json(ErrorSchema, '該当なし'),
  },
});

export const enqueueJobRoute = createRoute({
  method: 'post',
  path: '/jobs',
  tags: ['admin'],
  summary: '指定した農薬の収集を次回の bot 実行で最優先にする',
  security: adminSecurity,
  request: { body: { content: { 'application/json': { schema: EnqueueJobRequestSchema } }, required: true } },
  responses: {
    200: json(z.object({ registrationNumber: z.string(), queued: z.literal(true) }), '登録結果'),
    ...adminErrors,
    404: json(ErrorSchema, '該当なし'),
  },
});

export const putManufacturerDomainsRoute = createRoute({
  method: 'put',
  path: '/domains',
  tags: ['admin'],
  summary: '製造会社（登録者）の公式ドメインを設定（自動検証の基準になる）',
  security: adminSecurity,
  request: {
    body: { content: { 'application/json': { schema: ManufacturerDomainsRequestSchema } }, required: true },
  },
  responses: { 200: json(ManufacturerDomainsSchema, '設定結果'), ...adminErrors },
});

export const listUnverifiedPesticidesRoute = createRoute({
  method: 'get',
  path: '/unverified',
  tags: ['admin'],
  summary: '公式ページの検証が始まっていない農薬を登録番号順に取得',
  description:
    '公式ページが1件もなく、探索 bot が未確認の農薬だけを登録番号の昇順で返す。採用済み・確認待ち・却下済みのページがある農薬、および探索済みの農薬は含まない。',
  security: adminSecurity,
  request: { query: UnverifiedPesticidesQuerySchema },
  responses: { 200: json(UnverifiedPesticidesResponseSchema, '未検証の農薬'), ...adminErrors },
});

export const markPageFinderCheckedRoute = createRoute({
  method: 'post',
  path: '/unverified/checked',
  tags: ['admin'],
  summary: '候補URLが無かった農薬を探索済みにする',
  description: '次回の未検証一覧から外す。候補URLを登録できた農薬には使わない。',
  security: adminSecurity,
  request: {
    body: { content: { 'application/json': { schema: MarkPageFinderCheckedRequestSchema } }, required: true },
  },
  responses: {
    200: json(MarkPageFinderCheckedResponseSchema, '記録結果'),
    ...adminErrors,
    404: json(ErrorSchema, '該当なし'),
  },
});

export const getCollectionStatsRoute = createRoute({
  method: 'get',
  path: '/stats',
  tags: ['admin'],
  summary: '収集状況の集計',
  security: adminSecurity,
  responses: { 200: json(CollectionStatsSchema, '集計'), 401: json(ErrorSchema, '認証エラー') },
});

export const verifyRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['verify'],
  summary: '散布履歴から「本剤」「有効成分ごと」の残り使用回数を判定',
  security: [{ [BEARER_SECURITY_SCHEME]: [] }],
  request: {
    body: { content: { 'application/json': { schema: VerifyRequestSchema } }, required: true },
  },
  responses: {
    200: json(VerifyResponseSchema, '判定結果'),
    400: json(ErrorSchema, '入力エラー'),
    401: json(ErrorSchema, '認証エラー'),
  },
});
