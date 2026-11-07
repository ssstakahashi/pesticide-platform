import { z } from '@hono/zod-openapi';

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: '作物名(crop)を指定してください' }),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .openapi('Error');

export const RegistrationNumberSchema = z
  .string()
  .regex(/^\d{1,10}$/, '登録番号は数字で指定してください')
  .openapi({ example: '22583' });

// ---- 農薬検索 ----

export const PesticideSearchQuerySchema = z.object({
  crop: z
    .string({ error: '作物名(crop)を指定してください' })
    .trim()
    .min(1, '作物名(crop)を指定してください')
    .openapi({ param: { name: 'crop', in: 'query' }, example: 'すいか' }),
  pest: z
    .string()
    .trim()
    .optional()
    .openapi({ param: { name: 'pest', in: 'query' }, example: 'アブラムシ' }),
  category: z
    .string()
    .trim()
    .optional()
    .openapi({ param: { name: 'category', in: 'query' }, example: '殺虫' }),
});

export const PesticideSearchResultSchema = z
  .object({
    usage_rule_id: z.string(),
    registration_number: z.string(),
    pesticide_name: z.string(),
    usage_category: z.string().nullable(),
    formulation_type: z.string().nullable(),
    registered_crop_name: z.string(),
    crop_condition: z.string().nullable(),
    hierarchy_depth: z.number().int().openapi({
      description: '0=検索した作物そのものへの登録, 1以上=上位分類（果菜類・野菜類など）への登録',
    }),
    target_pests: z.string().nullable(),
    dilution_text: z.string().nullable(),
    liquid_amount: z.string().nullable(),
    usage_timing_text: z.string().nullable(),
    phi_days: z.number().int().nullable(),
    max_applications_count: z.number().int().nullable(),
    application_method: z.string().nullable(),
    ingredient_limits_summary: z.string().nullable(),
  })
  .openapi('PesticideSearchResult');

export const PesticideSearchResponseSchema = z
  .object({
    count: z.number().int(),
    items: z.array(PesticideSearchResultSchema),
  })
  .openapi('PesticideSearchResponse');

// ---- インクリメンタルサーチ（候補表示） ----

export const SuggestQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .openapi({ param: { name: 'q', in: 'query' }, example: 'ダコニール' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .openapi({ param: { name: 'limit', in: 'query' }, example: 10 }),
});

export const SuggestItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    similarity: z.number(),
  })
  .openapi('SuggestItem');

export const SuggestResponseSchema = z.object({ items: z.array(SuggestItemSchema) }).openapi('SuggestResponse');

// ---- 農薬詳細 ----

export const PesticideDetailParamsSchema = z.object({
  registrationNumber: RegistrationNumberSchema.openapi({
    param: { name: 'registrationNumber', in: 'path' },
  }),
});

export const PesticideDetailSchema = z
  .object({
    registrationNumber: z.string(),
    name: z.string(),
    pesticideType: z.string().nullable(),
    registrantName: z.string().nullable(),
    usageCategory: z.string().nullable(),
    formulationType: z.string().nullable(),
    mixtureCount: z.number().int().nullable(),
    registeredDate: z.string().nullable(),
    ingredients: z.array(
      z.object({
        ordinalPosition: z.number().int(),
        name: z.string(),
        concentrationText: z.string().nullable(),
        totalCountGroupName: z.string().nullable(),
        racCode: z.string().nullable(),
      }),
    ),
  })
  .openapi('PesticideDetail');

// ---- 成分別・残り使用回数チェック ----

export const SprayHistoryItemSchema = z
  .object({
    registrationNumber: RegistrationNumberSchema,
    sprayedDate: z.iso.date().openapi({ example: '2026-04-10' }),
  })
  .openapi('SprayHistoryItem');

export const VerifyRequestSchema = z
  .object({
    crop: z.string().trim().min(1).openapi({ example: 'すいか' }),
    history: z
      .array(SprayHistoryItemSchema)
      .max(500)
      .openapi({
        description: '同一作付け（または圃場）でこれまでに散布した農薬の履歴',
        example: [
          { registrationNumber: '23623', sprayedDate: '2026-04-10' },
          { registrationNumber: '22583', sprayedDate: '2026-05-15' },
        ],
      }),
    candidates: z.array(RegistrationNumberSchema).max(200).optional().openapi({
      description:
        '次に使用を検討している農薬の登録番号。省略時は、作物に登録があり履歴と同じ成分または同じ製品を含む農薬を返す',
    }),
  })
  .openapi('VerifyRequest');

export const VerifyStatusSchema = z
  .enum(['not_registered', 'exceeded', 'last_one', 'available', 'no_limit'])
  .openapi('VerifyStatus', {
    description:
      'not_registered=対象作物に登録なし, exceeded=上限到達(使用不可), last_one=残り1回, available=使用可能, no_limit=回数制限なし',
  });

export const UsageCountSchema = z.object({
  maxCount: z.number().int().nullable(),
  usedCount: z.number().int(),
  remaining: z.number().int().nullable(),
  status: VerifyStatusSchema,
});

export const VerifyIngredientResultSchema = UsageCountSchema.extend({
  ordinalPosition: z.number().int(),
  ingredientName: z.string(),
  countGroupName: z.string(),
  racCode: z.string().nullable(),
  usedHistory: z.array(
    z.object({
      registrationNumber: z.string(),
      pesticideName: z.string(),
      sprayedDate: z.string(),
    }),
  ),
}).openapi('VerifyIngredientResult');

export const VerifyPesticideResultSchema = z
  .object({
    registrationNumber: z.string(),
    pesticideName: z.string(),
    registeredForCrop: z.boolean(),
    status: VerifyStatusSchema,
    product: UsageCountSchema.openapi({ description: '本剤の使用回数' }),
    ingredients: z.array(VerifyIngredientResultSchema),
  })
  .openapi('VerifyPesticideResult');

export const VerifyResponseSchema = z
  .object({
    crop: z.string(),
    unknownRegistrationNumbers: z.array(z.string()),
    items: z.array(VerifyPesticideResultSchema),
  })
  .openapi('VerifyResponse');

// ---- 検証用データ（公式ページ・PDF・商品画像） ----

export const AssetTypeSchema = z.enum(['web_page', 'document', 'image']).openapi('AssetType');
export const FileAssetTypeSchema = z.enum(['document', 'image']).openapi('FileAssetType');
export const ReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']).openapi('ReviewStatus', {
  description: 'pending=要確認, approved=採用（自動または人による承認）, rejected=却下',
});
export const DocumentKindSchema = z.enum(['spec_sheet', 'sds', 'label', 'other']).openapi('DocumentKind', {
  description: 'spec_sheet=製品情報・技術資料, sds=安全データシート, label=ラベル, other=その他',
});

const fileUrl = z.string().openapi({
  description: '署名付きのファイル取得パス（API のベースURLからの相対パス、一定時間で失効）',
  example: '/api/files/image/0abe77d1-ff87-4df8-a32d-2f05b2815da7?exp=1767225600&sig=...',
});

export const PesticideWebPageSchema = z
  .object({ id: z.string(), url: z.string(), title: z.string().nullable() })
  .openapi('PesticideWebPage');

export const PesticideDocumentSchema = z
  .object({
    id: z.string(),
    kind: DocumentKindSchema,
    title: z.string().nullable(),
    sourceUrl: z.string(),
    pageUrl: z.string().nullable(),
    pageCount: z.number().int().nullable(),
    byteSize: z.number().int(),
    fileUrl,
  })
  .openapi('PesticideDocument');

export const PesticideImageSchema = z
  .object({
    id: z.string(),
    altText: z.string().nullable(),
    sourceUrl: z.string(),
    pageUrl: z.string().nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    fileUrl,
  })
  .openapi('PesticideImage');

export const PesticideAssetsSchema = z
  .object({
    registrationNumber: z.string(),
    webPages: z.array(PesticideWebPageSchema),
    documents: z.array(PesticideDocumentSchema),
    images: z.array(PesticideImageSchema),
  })
  .openapi('PesticideAssets', { description: '採用済み（approved）の検証用データのみ' });

export const FileParamsSchema = z.object({
  type: FileAssetTypeSchema.openapi({ param: { name: 'type', in: 'path' } }),
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

export const FileQuerySchema = z.object({
  exp: z.coerce
    .number()
    .int()
    .openapi({ param: { name: 'exp', in: 'query' } }),
  sig: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .openapi({ param: { name: 'sig', in: 'query' } }),
});

// ---- 管理: 収集データのレビュー ----

export const VerificationCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  weight: z.number(),
  note: z.string().optional(),
});

export const VerificationDetailsSchema = z
  .object({ score: z.number(), checks: z.array(VerificationCheckSchema), autoApproved: z.boolean() })
  .openapi('VerificationDetails');

export const ReviewListQuerySchema = z.object({
  status: ReviewStatusSchema.default('pending').openapi({ param: { name: 'status', in: 'query' } }),
  type: AssetTypeSchema.optional().openapi({ param: { name: 'type', in: 'query' } }),
  registrationNumber: RegistrationNumberSchema.optional().openapi({
    param: { name: 'registrationNumber', in: 'query' },
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .openapi({ param: { name: 'limit', in: 'query' } }),
});

export const ReviewItemSchema = z
  .object({
    type: AssetTypeSchema,
    id: z.string(),
    registrationNumber: z.string(),
    pesticideName: z.string(),
    registrantName: z.string().nullable(),
    status: ReviewStatusSchema,
    url: z.string().openapi({ description: 'ページURL、またはファイルの取得元URL' }),
    pageUrl: z.string().nullable(),
    title: z.string().nullable(),
    kind: DocumentKindSchema.nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    verificationScore: z.number().int().nullable(),
    verificationDetails: VerificationDetailsSchema.nullable(),
    reviewedBy: z.string().nullable(),
    reviewNote: z.string().nullable(),
    createdAt: z.string(),
    fileUrl: fileUrl.nullable(),
  })
  .openapi('ReviewItem');

export const ReviewListResponseSchema = z.object({ items: z.array(ReviewItemSchema) }).openapi('ReviewListResponse');

export const ReviewActionRequestSchema = z
  .object({
    type: AssetTypeSchema,
    id: z.uuid(),
    action: z.enum(['approve', 'reject']),
    note: z.string().trim().max(1000).optional(),
  })
  .openapi('ReviewActionRequest');

export const ReviewActionResponseSchema = z
  .object({ id: z.string(), registrationNumber: z.string(), status: ReviewStatusSchema })
  .openapi('ReviewActionResponse');

export const CandidateUrlRequestSchema = z
  .object({
    registrationNumber: RegistrationNumberSchema,
    url: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .openapi({ example: 'https://www.nippon-soda.co.jp/nougyo/product/3963/' }),
  })
  .openapi('CandidateUrlRequest');

export const EnqueueJobRequestSchema = z
  .object({ registrationNumber: RegistrationNumberSchema })
  .openapi('EnqueueJobRequest');

export const ManufacturerDomainsRequestSchema = z
  .object({
    registrantName: z.string().trim().min(1).openapi({ example: '日本曹達株式会社' }),
    domains: z
      .array(z.string().trim().min(1).max(253))
      .max(20)
      .openapi({ example: ['nippon-soda.co.jp'] }),
    note: z.string().trim().max(1000).optional(),
  })
  .openapi('ManufacturerDomainsRequest');

export const ManufacturerDomainsSchema = z
  .object({ registrantName: z.string(), domains: z.array(z.string()) })
  .openapi('ManufacturerDomains');

export const UnverifiedPesticidesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(20)
    .openapi({ param: { name: 'limit', in: 'query' }, description: '1回に返す件数。最大20' }),
});

export const UnverifiedPesticideSchema = z
  .object({
    registrationNumber: z.string(),
    name: z.string(),
    registrantName: z.string().nullable(),
    formulationType: z.string().nullable(),
  })
  .openapi('UnverifiedPesticide');

export const UnverifiedPesticidesResponseSchema = z
  .object({ items: z.array(UnverifiedPesticideSchema) })
  .openapi('UnverifiedPesticidesResponse', {
    description: '公式ページが1件もなく、探索 bot も未確認の農薬。登録番号の昇順',
  });

export const MarkPageFinderCheckedRequestSchema = z
  .object({ registrationNumber: RegistrationNumberSchema })
  .openapi('MarkPageFinderCheckedRequest');

export const MarkPageFinderCheckedResponseSchema = z
  .object({ registrationNumber: z.string(), checked: z.literal(true) })
  .openapi('MarkPageFinderCheckedResponse');

export const CollectionStatsSchema = z
  .object({
    assets: z.array(z.object({ type: AssetTypeSchema, status: ReviewStatusSchema, count: z.number().int() })),
    jobs: z.object({
      total: z.number().int(),
      due: z.number().int(),
      failing: z.number().int(),
      lastRunAt: z.string().nullable(),
    }),
  })
  .openapi('CollectionStats');

// ---- 利用者の散布記録（匿名ログインを含む） ----

const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const MeSchema = z
  .object({
    uid: z.string(),
    isAnonymous: z.boolean(),
    email: z.string().nullable(),
    seasonCount: z.number().int(),
    recordCount: z.number().int(),
  })
  .openapi('Me');

export const IdParamsSchema = z.object({
  id: z.uuid('IDの形式が不正です').openapi({ param: { name: 'id', in: 'path' } }),
});

export const CropSeasonInputSchema = z
  .object({
    name: z.string().trim().min(1, '作付け名を入力してください').max(100).openapi({ example: 'A圃場 すいか 2026春' }),
    fieldName: optionalText(100).openapi({ example: 'A圃場' }),
    cropName: z.string().trim().min(1, '作物名を入力してください').max(100).openapi({ example: 'すいか' }),
    startedOn: z.iso.date().nullish().openapi({ example: '2026-03-01' }),
    endedOn: z.iso.date().nullish(),
  })
  .openapi('CropSeasonInput');

export const CropSeasonSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    fieldName: z.string().nullable(),
    cropName: z.string(),
    startedOn: z.string().nullable(),
    endedOn: z.string().nullable(),
    recordCount: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('CropSeason');

export const CropSeasonListResponseSchema = z
  .object({ items: z.array(CropSeasonSchema) })
  .openapi('CropSeasonListResponse');

export const SprayRecordInputSchema = z
  .object({
    registrationNumber: RegistrationNumberSchema,
    sprayedDate: z.iso.date().openapi({ example: '2026-04-10' }),
    dilution: optionalText(50).openapi({ example: '1000倍' }),
    amount: optionalText(50).openapi({ example: '200L/10a' }),
    note: optionalText(1000),
  })
  .openapi('SprayRecordInput');

export const SprayRecordCreateRequestSchema = z
  .object({ records: z.array(SprayRecordInputSchema).min(1).max(500) })
  .openapi('SprayRecordCreateRequest');

export const SprayRecordSchema = z
  .object({
    id: z.string(),
    seasonId: z.string(),
    registrationNumber: z.string(),
    pesticideName: z.string().nullable(),
    sprayedDate: z.string(),
    dilution: z.string().nullable(),
    amount: z.string().nullable(),
    note: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('SprayRecord');

export const SprayRecordListResponseSchema = z
  .object({ items: z.array(SprayRecordSchema) })
  .openapi('SprayRecordListResponse');

export const SeasonVerifyRequestSchema = VerifyRequestSchema.pick({ candidates: true }).openapi('SeasonVerifyRequest');

export const MergeAccountRequestSchema = z
  .object({
    anonymousIdToken: z.string().min(1).openapi({ description: '引き継ぎ元の匿名ユーザーの Firebase ID トークン' }),
  })
  .openapi('MergeAccountRequest');

export const MergeAccountResponseSchema = z.object({ movedSeasons: z.number().int() }).openapi('MergeAccountResponse');

export type PesticideSearchQuery = z.infer<typeof PesticideSearchQuerySchema>;
export type PesticideSearchResult = z.infer<typeof PesticideSearchResultSchema>;
export type PesticideSearchResponse = z.infer<typeof PesticideSearchResponseSchema>;
export type SuggestItem = z.infer<typeof SuggestItemSchema>;
export type PesticideDetail = z.infer<typeof PesticideDetailSchema>;
export type SprayHistoryItem = z.infer<typeof SprayHistoryItemSchema>;
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
export type VerifyStatus = z.infer<typeof VerifyStatusSchema>;
export type UsageCount = z.infer<typeof UsageCountSchema>;
export type VerifyIngredientResult = z.infer<typeof VerifyIngredientResultSchema>;
export type VerifyPesticideResult = z.infer<typeof VerifyPesticideResultSchema>;
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
export type AssetType = z.infer<typeof AssetTypeSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type PesticideAssets = z.infer<typeof PesticideAssetsSchema>;
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type VerificationDetails = z.infer<typeof VerificationDetailsSchema>;
export type CollectionStats = z.infer<typeof CollectionStatsSchema>;
export type Me = z.infer<typeof MeSchema>;
export type CropSeasonInput = z.infer<typeof CropSeasonInputSchema>;
export type CropSeason = z.infer<typeof CropSeasonSchema>;
export type SprayRecordInput = z.infer<typeof SprayRecordInputSchema>;
export type SprayRecord = z.infer<typeof SprayRecordSchema>;
