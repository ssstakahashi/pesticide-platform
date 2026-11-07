import { useMutation } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { VerifyPesticideResult, VerifyStatus } from '@pesticide/api-contract';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SuggestInput } from '@/features/search/suggest-input';
import { api, unwrap } from '@/lib/api';

const STATUS_LABEL: Record<
  VerifyStatus,
  { label: string; variant: 'destructive' | 'warning' | 'success' | 'secondary' }
> = {
  not_registered: { label: '登録なし', variant: 'destructive' },
  exceeded: { label: '上限到達（使用不可）', variant: 'destructive' },
  last_one: { label: '残り1回', variant: 'warning' },
  available: { label: '使用可能', variant: 'success' },
  no_limit: { label: '制限なし', variant: 'secondary' },
};

function StatusBadge({ status }: { status: VerifyStatus }) {
  const { label, variant } = STATUS_LABEL[status];
  return <Badge variant={variant}>{label}</Badge>;
}

type HistoryRow = { key: number; registrationNumber: string; sprayedDate: string };

const today = () => new Date().toISOString().slice(0, 10);

export function VerifyPage() {
  const [crop, setCrop] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([{ key: 0, registrationNumber: '', sprayedDate: today() }]);
  const [candidates, setCandidates] = useState('');

  const verify = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.api.verify.$post({
          json: {
            crop: crop.trim(),
            history: history
              .filter((h) => h.registrationNumber.trim())
              .map(({ registrationNumber, sprayedDate }) => ({
                registrationNumber: registrationNumber.trim(),
                sprayedDate,
              })),
            candidates: candidates.trim()
              ? candidates
                  .split(/[,\s、]+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined,
          },
        }),
      ),
  });

  const updateRow = (key: number, patch: Partial<HistoryRow>) =>
    setHistory((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>散布履歴</CardTitle>
          <CardDescription>同じ有効成分は商品名が違っても合算して総使用回数をカウントします。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              verify.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="verify-crop">作物名</Label>
              <SuggestInput id="verify-crop" kind="crops" value={crop} onChange={setCrop} placeholder="例: すいか" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>これまでに散布した農薬（登録番号・散布日）</Label>
              {history.map((row) => (
                <div key={row.key} className="flex gap-2">
                  <Input
                    className="w-28"
                    inputMode="numeric"
                    placeholder="登録番号"
                    value={row.registrationNumber}
                    onChange={(e) => updateRow(row.key, { registrationNumber: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={row.sprayedDate}
                    onChange={(e) => updateRow(row.key, { sprayedDate: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="削除"
                    onClick={() => setHistory((rows) => rows.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setHistory((rows) => [
                    ...rows,
                    { key: Math.max(-1, ...rows.map((r) => r.key)) + 1, registrationNumber: '', sprayedDate: today() },
                  ])
                }
              >
                <Plus />
                履歴を追加
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="candidates">次に使う予定の農薬（登録番号・任意）</Label>
              <Input
                id="candidates"
                placeholder="例: 22583, 90001（空欄なら同一成分を含む農薬を表示）"
                value={candidates}
                onChange={(e) => setCandidates(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!crop.trim() || verify.isPending}>
              {verify.isPending && <Loader2 className="animate-spin" />}
              残り使用回数をチェック
            </Button>
            {verify.error && <p className="text-destructive text-sm">{verify.error.message}</p>}
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {verify.data?.unknownRegistrationNumbers.length ? (
          <p className="text-sm text-amber-700">
            登録情報が見つからない登録番号があります: {verify.data.unknownRegistrationNumbers.join('、')}
          </p>
        ) : null}
        {verify.data && verify.data.items.length === 0 && (
          <p className="text-muted-foreground text-sm">該当する農薬はありません。</p>
        )}
        {verify.data?.items.map((item) => (
          <VerifyResultCard key={item.registrationNumber} item={item} />
        ))}
      </div>
    </div>
  );
}

function VerifyResultCard({ item }: { item: VerifyPesticideResult }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{item.pesticideName}</CardTitle>
          <span className="text-muted-foreground text-xs">第{item.registrationNumber}号</span>
          <StatusBadge status={item.status} />
        </div>
        {item.registeredForCrop && (
          <CardDescription>
            本剤の使用回数: {item.product.usedCount}回使用
            {item.product.maxCount != null &&
              ` / 上限${item.product.maxCount}回（残り${Math.max(0, item.product.remaining ?? 0)}回）`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>有効成分</TableHead>
              <TableHead>系統(RAC)</TableHead>
              <TableHead>総使用回数上限</TableHead>
              <TableHead>使用済</TableHead>
              <TableHead>残り</TableHead>
              <TableHead>判定</TableHead>
              <TableHead>同一成分の過去散布履歴</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {item.ingredients.map((ing) => (
              <TableRow key={ing.ordinalPosition}>
                <TableCell>{ing.ingredientName}</TableCell>
                <TableCell>{ing.racCode ?? '-'}</TableCell>
                <TableCell>{ing.maxCount == null ? '-' : `${ing.maxCount}回`}</TableCell>
                <TableCell>{ing.usedCount}回</TableCell>
                <TableCell>{ing.remaining == null ? '-' : `${Math.max(0, ing.remaining)}回`}</TableCell>
                <TableCell>
                  <StatusBadge status={item.registeredForCrop ? ing.status : 'not_registered'} />
                </TableCell>
                <TableCell className="text-xs">
                  {ing.usedHistory.map((h) => `${h.pesticideName}(${h.sprayedDate})`).join('、') || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
