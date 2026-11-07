import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { suggestQuery, type SuggestKind } from '@/lib/queries';
import { cn } from '@/lib/utils';

function useDebounced<T>(value: T, ms = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

type Props = {
  kind: SuggestKind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
};

/** pg_trgm のあいまい検索 API を使った入力中の候補表示 */
export function SuggestInput({ kind, value, onChange, placeholder, id }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(value);
  const { data } = useQuery({ ...suggestQuery(kind, debounced), enabled: open && debounced.trim().length > 0 });
  const items = (data?.items ?? []).filter((i) => i.name !== value);
  const showList = open && items.length > 0;

  const select = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            select(items[active]!.name);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border p-1 shadow-md"
        >
          {items.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === active}
              className={cn('cursor-pointer rounded-sm px-2 py-1.5 text-sm', i === active && 'bg-accent')}
              onMouseDown={(e) => {
                e.preventDefault();
                select(item.name);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
