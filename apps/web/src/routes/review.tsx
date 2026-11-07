import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import type { AssetType, ReviewItem, ReviewStatus } from '@pesticide/api-contract';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, toApiUrl, unwrap } from '@/lib/api';

const STATUS_LABEL: Record<ReviewStatus, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  pending: { label: '要確認', variant: 'warning' },
  approved: { label: '採用', variant: 'success' },
  rejected: { label: '却下', variant: 'destructive' },
};

const TYPE_LABEL: Record<AssetType, string> = {
  web_page: '公式ページ',
  document: 'PDF資料',
  image: '商品画像',
};

const DOCUMENT_KIND_LABEL: Record<string, string> = {
  spec_sheet: '製品情報・技術資料',
  sds: 'SDS',
  label: 'ラベル',
  other: 'その他',
};

const reviewQueryKey = ['admin', 'collection'] as const;

export function ReviewPage() {
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [type, setType] = useState<AssetType | undefined>(undefined);

  const stats = useQuery({
    queryKey: [...reviewQueryKey, 'stats'],
    queryFn: async () => unwrap(await api.api.admin.collection.stats.$get()),
  });
  const list = useQuery({
    queryKey: [...reviewQueryKey, 'review', { status, type }],
    queryFn: async () => unwrap(await api.api.admin.collection.review.$get({ query: { status, type, limit: '100' } })),
  });

  const pendingCount = stats.data?.assets.filter((a) => a.status === 'pending').reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>収集状況</CardTitle>
            <CardDescription>
              bot が定期的に公式ページ・PDF・商品画像を収集し、スコアの高いものは自動で採用します。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {stats.data ? (
              <>
                <p>要確認: {pendingCount ?? 0}件</p>
                <p>
                  巡回対象: {stats.data.jobs.total}件（実行待ち {stats.data.jobs.due}件 / エラー{' '}
                  {stats.data.jobs.failing}件）
                </p>
                <p className="text-muted-foreground">
                  最終実行:{' '}
                  {stats.data.jobs.lastRunAt ? new Date(stats.data.jobs.lastRunAt).toLocaleString('ja-JP') : '-'}
                </p>
              </>
            ) : stats.error ? (
              <p className="text-destructive">{stats.error.message}</p>
            ) : (
              <Loader2 className="size-4 animate-spin" />
            )}
          </CardContent>
        </Card>
        <CandidateUrlForm />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABEL) as ReviewStatus[]).map((s) => (
            <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s].label}
            </Button>
          ))}
          <span className="mx-1 border-l" />
          <Button size="sm" variant={type === undefined ? 'default' : 'outline'} onClick={() => setType(undefined)}>
            すべて
          </Button>
          {(Object.keys(TYPE_LABEL) as AssetType[]).map((t) => (
            <Button key={t} size="sm" variant={type === t ? 'default' : 'outline'} onClick={() => setType(t)}>
              {TYPE_LABEL[t]}
            </Button>
          ))}
        </div>
        {list.isPending && <Loader2 className="size-5 animate-spin" />}
        {list.error && <p className="text-destructive text-sm">{list.error.message}</p>}
        {list.data && list.data.items.length === 0 && (
          <p className="text-muted-foreground text-sm">該当するデータはありません。</p>
        )}
        {list.data?.items.map((item) => (
          <ReviewItemCard key={`${item.type}:${item.id}`} item={item} />
        ))}
      </div>
    </div>
  );
}

function ReviewItemCard({ item }: { item: ReviewItem }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: async (action: 'approve' | 'reject') =>
      unwrap(
        await api.api.admin.collection.review.$post({
          json: { type: item.type, id: item.id, action, note: note.trim() || undefined },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reviewQueryKey }),
  });
  const { label, variant } = STATUS_LABEL[item.status];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{item.pesticideName}</CardTitle>
          <span className="text-muted-foreground text-xs">第{item.registrationNumber}号</span>
          <Badge variant="secondary">
            {TYPE_LABEL[item.type]}
            {item.kind && `（${DOCUMENT_KIND_LABEL[item.kind] ?? item.kind}）`}
          </Badge>
          <Badge variant={variant}>{label}</Badge>
          <Badge variant="outline">スコア {item.verificationScore ?? 0}</Badge>
        </div>
        <CardDescription className="break-all">
          {item.registrantName && <span className="mr-2">{item.registrantName}</span>}
          {item.title}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          {item.type === 'image' && item.fileUrl && (
            <a href={toApiUrl(item.fileUrl)} target="_blank" rel="noreferrer" className="shrink-0">
              <img
                src={toApiUrl(item.fileUrl)}
                alt={item.title ?? item.pesticideName}
                loading="lazy"
                className="h-40 w-auto max-w-60 rounded-md border object-contain"
              />
            </a>
          )}
          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <ul className="flex flex-col gap-1">
              {item.verificationDetails?.checks.map((check) => (
                <li key={check.name} className="flex items-center gap-2">
                  {check.passed ? (
                    <Check className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <X className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span className={check.passed ? '' : 'text-muted-foreground'}>
                    {check.name}（{check.weight}点）
                    {check.note && <span className="text-muted-foreground ml-1 text-xs">{check.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-1 text-xs">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all underline"
              >
                <ExternalLink className="size-3 shrink-0" />
                {safeDecodeUrl(item.url)}
              </a>
              {item.pageUrl && item.pageUrl !== item.url && (
                <a
                  href={item.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground inline-flex items-center gap-1 break-all underline"
                >
                  掲載ページ: {safeDecodeUrl(item.pageUrl)}
                </a>
              )}
              {item.type === 'document' && item.fileUrl && (
                <a
                  href={toApiUrl(item.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  <FileText className="size-3 shrink-0" />
                  保存済み PDF を開く
                </a>
              )}
            </div>
            {item.reviewedBy && (
              <p className="text-muted-foreground text-xs">
                確認者: {item.reviewedBy}
                {item.reviewNote && ` / ${item.reviewNote}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="メモ（任意）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            disabled={review.isPending || item.status === 'approved'}
            onClick={() => review.mutate('approve')}
          >
            <Check />
            承認
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={review.isPending || item.status === 'rejected'}
            onClick={() => review.mutate('reject')}
          >
            <X />
            却下
          </Button>
          {review.error && <p className="text-destructive text-sm">{review.error.message}</p>}
        </div>
        {item.type === 'web_page' && item.status === 'pending' && (
          <p className="text-muted-foreground text-xs">
            公式ページを承認すると、このサイトのドメインを製造会社の公式ドメインとして登録し、以降の自動判定に使います。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CandidateUrlForm() {
  const queryClient = useQueryClient();
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [url, setUrl] = useState('');
  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.api.admin.collection.candidates.$post({
          json: { registrationNumber: registrationNumber.trim(), url: url.trim() },
        }),
      ),
    onSuccess: () => {
      setUrl('');
      return queryClient.invalidateQueries({ queryKey: reviewQueryKey });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>公式ページの候補を登録</CardTitle>
        <CardDescription>登録した URL は次回の bot 実行で優先的に取得・検証されます。</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="candidate-reg">登録番号</Label>
            <Input
              id="candidate-reg"
              inputMode="numeric"
              placeholder="例: 23623"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="candidate-url">製造会社の製品ページ URL</Label>
            <Input
              id="candidate-url"
              type="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!registrationNumber.trim() || !url.trim() || add.isPending}>
            {add.isPending && <Loader2 className="animate-spin" />}
            候補として登録
          </Button>
          {add.isSuccess && <p className="text-sm text-emerald-700">登録しました: {safeDecodeUrl(add.data.url)}</p>}
          {add.error && <p className="text-destructive text-sm">{add.error.message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function safeDecodeUrl(url: string) {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}
