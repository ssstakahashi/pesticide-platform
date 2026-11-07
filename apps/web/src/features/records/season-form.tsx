import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { CropSeason, CropSeasonInput } from '@pesticide/api-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SuggestInput } from '@/features/search/suggest-input';

type Props = {
  initial?: Partial<Pick<CropSeason, 'name' | 'fieldName' | 'cropName' | 'startedOn' | 'endedOn'>>;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (input: CropSeasonInput) => void;
  onCancel?: () => void;
};

/** 作付け（圃場 × 作物 × 作期）の入力欄 */
export function SeasonForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const [fieldName, setFieldName] = useState(initial?.fieldName ?? '');
  const [cropName, setCropName] = useState(initial?.cropName ?? '');
  const [startedOn, setStartedOn] = useState(initial?.startedOn ?? '');
  const [endedOn, setEndedOn] = useState(initial?.endedOn ?? '');
  const [name, setName] = useState(initial?.name ?? '');

  const suggestedName = [fieldName.trim(), cropName.trim(), startedOn.slice(0, 7)].filter(Boolean).join(' ');

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name: name.trim() || suggestedName,
          fieldName: fieldName.trim() || null,
          cropName: cropName.trim(),
          startedOn: startedOn || null,
          endedOn: endedOn || null,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="season-field">圃場</Label>
          <Input
            id="season-field"
            placeholder="例: A圃場"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="season-crop">作物名</Label>
          <SuggestInput
            id="season-crop"
            kind="crops"
            value={cropName}
            onChange={setCropName}
            placeholder="例: すいか"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="season-start">作期の開始</Label>
          <Input id="season-start" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="season-end">作期の終了</Label>
          <Input id="season-end" type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="season-name">作付け名</Label>
        <Input
          id="season-name"
          placeholder={suggestedName || '例: A圃場 すいか 2026春'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !cropName.trim() || !(name.trim() || suggestedName)}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  );
}
