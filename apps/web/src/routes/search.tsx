import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResultsTable } from '@/features/search/results-table';
import { SuggestInput } from '@/features/search/suggest-input';
import { pesticideSearchQuery } from '@/lib/queries';

const route = getRouteApi('/');

const CATEGORIES = ['殺虫', '殺菌', '除草', '殺虫殺菌', '植物成長調整'];

export function SearchPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const [crop, setCrop] = useState(search.crop ?? '');
  const [pest, setPest] = useState(search.pest ?? '');
  const [category, setCategory] = useState(search.category ?? '');
  const [cropError, setCropError] = useState('');

  useEffect(() => {
    setCrop(search.crop ?? '');
    setPest(search.pest ?? '');
    setCategory(search.category ?? '');
  }, [search.crop, search.pest, search.category]);

  const { data, isFetching, error } = useQuery(pesticideSearchQuery(search));

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid gap-4 md:grid-cols-[1fr_1fr_200px_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmedCrop = crop.trim();
          if (!trimmedCrop) {
            setCropError('作物名を入力してください。');
            return;
          }
          setCropError('');
          void navigate({
            search: {
              crop: trimmedCrop,
              pest: pest.trim() || undefined,
              category: category || undefined,
            },
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="crop">作物名（必須）</Label>
          <SuggestInput
            id="crop"
            kind="crops"
            value={crop}
            onChange={(value) => {
              setCrop(value);
              if (value.trim()) setCropError('');
            }}
            placeholder="例: すいか"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pest">病害虫・雑草</Label>
          <SuggestInput id="pest" kind="pests" value={pest} onChange={setPest} placeholder="例: アブラムシ" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">用途</Label>
          <select
            id="category"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">すべて</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">
          {isFetching ? <Loader2 className="animate-spin" /> : <Search />}
          検索
        </Button>
      </form>

      {cropError && (
        <p className="text-destructive text-sm" role="alert">
          {cropError}
        </p>
      )}
      {error && <p className="text-destructive text-sm">{error.message}</p>}
      {!search.crop && (
        <p className="text-muted-foreground text-sm">
          作物名を入力して検索してください。上位分類（例: 果菜類・野菜類）への登録も含めて表示します。
        </p>
      )}
      {data && <ResultsTable items={data.items} />}
    </div>
  );
}
