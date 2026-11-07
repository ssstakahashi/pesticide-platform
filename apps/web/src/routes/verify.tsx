import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VerifyPesticideResult, VerifyResponse, VerifyStatus } from '@pesticide/api-contract';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-provider';
import { useOpenLinkDialog } from '@/features/auth/link-dialog';
import { useCreateRecords, useCreateSeason, useDeleteRecord } from '@/features/records/mutations';
import { recordsQuery, seasonsQuery } from '@/features/records/queries';
import { SeasonForm } from '@/features/records/season-form';
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

/** savedId があるのは選択中の作付けに保存済みの行 */
type HistoryRow = { key: number; registrationNumber: string; sprayedDate: string; savedId?: string };

const today = () => new Date().toISOString().slice(0, 10);

export function VerifyPage() {
  const [crop, setCrop] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([{ key: 0, registrationNumber: '', sprayedDate: today() }]);
  const [candidates, setCandidates] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const { ready, isAnonymous } = useAuth();
  const openLinkDialog = useOpenLinkDialog();
  const seasons = useQuery(seasonsQuery(ready));
  const savedRecords = useQuery(recordsQuery(seasonId || undefined));
  const createSeason = useCreateSeason();
  const createRecords = useCreateRecords();
  const deleteRecord = useDeleteRecord();

  useEffect(() => {
    if (!seasonId || !savedRecords.data) return;
    setHistory((rows) => [
      ...savedRecords.data.map((r, i) => ({
        key: -1 - i,
        registrationNumber: r.registrationNumber,
        sprayedDate: r.sprayedDate,
        savedId: r.id,
      })),
      ...rows.filter((r) => !r.savedId),
    ]);
  }, [seasonId, savedRecords.data]);

  const selectSeason = (id: string) => {
    setSeasonId(id);
    setSavedMessage(null);
    setShowSeasonForm(false);
    const season = seasons.data?.find((s) => s.id === id);
    if (season) setCrop(season.cropName);
    setHistory((rows) => {
      const unsaved = rows.filter((r) => !r.savedId);
      return unsaved.length ? unsaved : [{ key: 0, registrationNumber: '', sprayedDate: today() }];
    });
  };

  const unsavedRows = history.filter((h) => !h.savedId && h.registrationNumber.trim());

  const saveTo = async (targetSeasonId: string) => {
    await createRecords.mutateAsync({
      seasonId: targetSeasonId,
      records: unsavedRows.map((r) => ({
        registrationNumber: r.registrationNumber.trim(),
        sprayedDate: r.sprayedDate,
      })),
    });
    setHistory((rows) => rows.filter((r) => r.savedId));
    setSeasonId(targetSeasonId);
    setShowSeasonForm(false);
    setSavedMessage(`${unsavedRows.length}件の散布記録を保存しました`);
  };

  const removeRow = (row: HistoryRow) => {
    if (row.savedId) {
      if (!window.confirm('保存済みの散布記録を削除しますか？')) return;
      deleteRecord.mutate(row.savedId);
    }
    setHistory((rows) => rows.filter((r) => r.key !== row.key));
  };

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
              <Label htmlFor="verify-season">作付け（保存先）</Label>
              <select
                id="verify-season"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-base shadow-xs md:text-sm"
                value={seasonId}
                disabled={!ready}
                onChange={(e) => selectSeason(e.target.value)}
              >
                <option value="">保存しない（この場だけ）</option>
                {seasons.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.recordCount}件）
                  </option>
                ))}
              </select>
            </div>
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
                    readOnly={Boolean(row.savedId)}
                    title={row.savedId ? '保存済み' : undefined}
                    onChange={(e) => updateRow(row.key, { registrationNumber: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={row.sprayedDate}
                    readOnly={Boolean(row.savedId)}
                    onChange={(e) => updateRow(row.key, { sprayedDate: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label="削除" onClick={() => removeRow(row)}>
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
            <Button
              type="button"
              variant="outline"
              disabled={!ready || unsavedRows.length === 0 || createRecords.isPending}
              onClick={() => {
                setSavedMessage(null);
                if (seasonId) void saveTo(seasonId);
                else setShowSeasonForm(true);
              }}
            >
              {createRecords.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              この履歴を保存
            </Button>
            {createRecords.error && <p className="text-destructive text-sm">{createRecords.error.message}</p>}
            {savedMessage && (
              <p className="text-sm text-emerald-700">
                <Check className="mr-1 inline size-4" />
                {savedMessage}
                {isAnonymous && (
                  <>
                    （この端末のみ）・別の端末でも見るには{' '}
                    <button type="button" className="underline underline-offset-2" onClick={openLinkDialog}>
                      登録する
                    </button>
                  </>
                )}
              </p>
            )}
          </form>
          {showSeasonForm && (
            <div className="mt-4 flex flex-col gap-3 border-t pt-4">
              <p className="text-sm font-medium">保存先の作付けを作成</p>
              <SeasonForm
                initial={{ cropName: crop.trim() }}
                submitLabel="作成して保存"
                pending={createSeason.isPending || createRecords.isPending}
                error={createSeason.error?.message}
                onCancel={() => setShowSeasonForm(false)}
                onSubmit={async (input) => {
                  const season = await createSeason.mutateAsync(input);
                  setCrop(season.cropName);
                  await saveTo(season.id);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">{verify.data && <VerifyResults data={verify.data} />}</div>
    </div>
  );
}

/** 判定結果の一覧（散布記録ページからも使う） */
export function VerifyResults({ data }: { data: VerifyResponse }) {
  return (
    <>
      {data.unknownRegistrationNumbers.length ? (
        <p className="text-sm text-amber-700">
          登録情報が見つからない登録番号があります: {data.unknownRegistrationNumbers.join('、')}
        </p>
      ) : null}
      {data.items.length === 0 && <p className="text-muted-foreground text-sm">該当する農薬はありません。</p>}
      {data.items.map((item) => (
        <VerifyResultCard key={item.registrationNumber} item={item} />
      ))}
    </>
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
