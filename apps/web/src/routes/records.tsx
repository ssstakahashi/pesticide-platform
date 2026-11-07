import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ClipboardCheck, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CropSeason } from '@pesticide/api-contract';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-provider';
import {
  useCreateRecords,
  useCreateSeason,
  useDeleteRecord,
  useDeleteSeason,
  useUpdateSeason,
} from '@/features/records/mutations';
import { recordsQuery, seasonsQuery } from '@/features/records/queries';
import { SeasonForm } from '@/features/records/season-form';
import { api, unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';
import { VerifyResults } from './verify';

const today = () => new Date().toISOString().slice(0, 10);

const seasonPeriod = (s: CropSeason) =>
  s.startedOn || s.endedOn ? `${s.startedOn ?? ''} 〜 ${s.endedOn ?? ''}` : '作期未設定';

export function RecordsPage() {
  const { season: seasonId } = useSearch({ from: '/records' });
  const navigate = useNavigate({ from: '/records' });
  const { ready } = useAuth();
  const seasons = useQuery(seasonsQuery(ready));
  const createSeason = useCreateSeason();
  const [creating, setCreating] = useState(false);

  const selected = seasons.data?.find((s) => s.id === seasonId);
  const select = (id: string | undefined) => navigate({ search: { season: id } });

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="self-start">
        <CardHeader>
          <CardTitle>作付け</CardTitle>
          <CardDescription>圃場・作物・作期ごとに散布記録をまとめます。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {seasons.isPending && ready && <Loader2 className="text-muted-foreground animate-spin" />}
          {seasons.data?.length === 0 && !creating && (
            <p className="text-muted-foreground text-sm">まだ作付けがありません。</p>
          )}
          {seasons.data?.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              className={cn(
                'hover:bg-accent flex flex-col items-start rounded-md border px-3 py-2 text-left text-sm',
                s.id === seasonId && 'bg-accent border-foreground/20',
              )}
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground text-xs">
                {s.cropName} ・ {seasonPeriod(s)} ・ {s.recordCount}件
              </span>
            </button>
          ))}
          {creating ? (
            <div className="mt-2 border-t pt-4">
              <SeasonForm
                submitLabel="作成"
                pending={createSeason.isPending}
                error={createSeason.error?.message}
                onCancel={() => setCreating(false)}
                onSubmit={async (input) => {
                  const season = await createSeason.mutateAsync(input);
                  setCreating(false);
                  select(season.id);
                }}
              />
            </div>
          ) : (
            <Button variant="outline" size="sm" disabled={!ready} onClick={() => setCreating(true)}>
              <Plus />
              新しい作付け
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {selected ? (
          <SeasonDetail key={selected.id} season={selected} onDeleted={() => select(undefined)} />
        ) : (
          <p className="text-muted-foreground text-sm">左の一覧から作付けを選んでください。</p>
        )}
      </div>
    </div>
  );
}

function SeasonDetail({ season, onDeleted }: { season: CropSeason; onDeleted: () => void }) {
  const records = useQuery(recordsQuery(season.id));
  const updateSeason = useUpdateSeason();
  const deleteSeason = useDeleteSeason();
  const deleteRecord = useDeleteRecord();
  const [editing, setEditing] = useState(false);

  const verify = useMutation({
    mutationFn: async () =>
      unwrap(await api.api.me.seasons[':id'].verify.$post({ param: { id: season.id }, json: {} })),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1.5">
              <CardTitle>{season.name}</CardTitle>
              <CardDescription>
                {[season.fieldName, season.cropName, seasonPeriod(season)].filter(Boolean).join(' ・ ')}
              </CardDescription>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
                <Pencil />
                編集
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleteSeason.isPending}
                onClick={async () => {
                  if (!window.confirm(`「${season.name}」と散布記録${season.recordCount}件を削除しますか？`)) return;
                  await deleteSeason.mutateAsync(season.id);
                  onDeleted();
                }}
              >
                <Trash2 />
                削除
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editing && (
            <div className="border-b pb-4">
              <SeasonForm
                initial={season}
                submitLabel="更新"
                pending={updateSeason.isPending}
                error={updateSeason.error?.message}
                onCancel={() => setEditing(false)}
                onSubmit={async (input) => {
                  await updateSeason.mutateAsync({ id: season.id, input });
                  setEditing(false);
                }}
              />
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>散布日</TableHead>
                <TableHead>農薬</TableHead>
                <TableHead>希釈倍数</TableHead>
                <TableHead>散布量</TableHead>
                <TableHead>メモ</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-center">
                    散布記録はまだありません
                  </TableCell>
                </TableRow>
              )}
              {records.data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.sprayedDate}</TableCell>
                  <TableCell>
                    {r.pesticideName ?? '（登録情報なし）'}
                    <span className="text-muted-foreground ml-1 text-xs">第{r.registrationNumber}号</span>
                  </TableCell>
                  <TableCell>{r.dilution ?? '-'}</TableCell>
                  <TableCell>{r.amount ?? '-'}</TableCell>
                  <TableCell className="max-w-48 truncate text-xs" title={r.note ?? undefined}>
                    {r.note ?? '-'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="削除"
                      onClick={() => {
                        if (window.confirm('この散布記録を削除しますか？')) deleteRecord.mutate(r.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <AddRecordForm seasonId={season.id} />

          <Button className="self-start" disabled={verify.isPending} onClick={() => verify.mutate()}>
            {verify.isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            残り回数をチェック
          </Button>
          {verify.error && <p className="text-destructive text-sm">{verify.error.message}</p>}
        </CardContent>
      </Card>

      {verify.data && <VerifyResults data={verify.data} />}
    </>
  );
}

function AddRecordForm({ seasonId }: { seasonId: string }) {
  const createRecords = useCreateRecords();
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [sprayedDate, setSprayedDate] = useState(today());
  const [dilution, setDilution] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await createRecords.mutateAsync({
          seasonId,
          records: [{ registrationNumber: registrationNumber.trim(), sprayedDate, dilution, amount, note }],
        });
        setRegistrationNumber('');
        setDilution('');
        setAmount('');
        setNote('');
      }}
    >
      <p className="text-sm font-medium">散布記録を追加</p>
      <div className="grid gap-3 sm:grid-cols-[7rem_10rem_1fr_1fr]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="record-reg">登録番号</Label>
          <Input
            id="record-reg"
            inputMode="numeric"
            placeholder="例: 22583"
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="record-date">散布日</Label>
          <Input id="record-date" type="date" value={sprayedDate} onChange={(e) => setSprayedDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="record-dilution">希釈倍数</Label>
          <Input
            id="record-dilution"
            placeholder="例: 1000倍"
            value={dilution}
            onChange={(e) => setDilution(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="record-amount">散布量</Label>
          <Input
            id="record-amount"
            placeholder="例: 200L/10a"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="record-note">メモ</Label>
        <Input
          id="record-note"
          placeholder="発生状況や効果など"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        className="self-start"
        disabled={!registrationNumber.trim() || !sprayedDate || createRecords.isPending}
      >
        {createRecords.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
        追加
      </Button>
      {createRecords.error && <p className="text-destructive text-sm">{createRecords.error.message}</p>}
    </form>
  );
}
