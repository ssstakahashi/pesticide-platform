import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { PesticideSearchResult } from '@pesticide/api-contract';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type UsageView = {
  key: string;
  registrationNumbers: string[];
  registeredCropName: string;
  cropCondition: string | null;
  hierarchyDepth: number;
  targetPests: string | null;
  dilutionText: string | null;
  liquidAmount: string | null;
  usageTimingText: string | null;
  phiDays: number | null;
  maxApplicationsCount: number | null;
  applicationMethod: string | null;
  ingredientLimitsSummary: string | null;
};

type PesticideGroup = {
  pesticideName: string;
  registrationNumbers: string[];
  usageCategory: string | null;
  formulationType: string | null;
  usages: UsageView[];
};

const col = createColumnHelper<PesticideGroup>();

/** 登録番号だけが違い、適用内容が同じ行は1つにまとめる */
function usageSignature(item: PesticideSearchResult): string {
  return JSON.stringify([
    item.usage_category,
    item.formulation_type,
    item.registered_crop_name,
    item.crop_condition,
    item.hierarchy_depth,
    item.target_pests,
    item.dilution_text,
    item.liquid_amount,
    item.usage_timing_text,
    item.phi_days,
    item.max_applications_count,
    item.application_method,
    item.ingredient_limits_summary,
  ]);
}

function compareRegistration(a: string, b: string): number {
  return a.localeCompare(b, 'ja', { numeric: true });
}

function joinUnique(values: (string | null)[]): string | null {
  const unique = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return unique.length > 0 ? unique.join('、') : null;
}

export function groupSearchResults(items: PesticideSearchResult[]): PesticideGroup[] {
  const groups = new Map<string, PesticideGroup>();
  const usagesByName = new Map<string, Map<string, UsageView>>();
  const categories = new Map<string, Set<string>>();
  const formulations = new Map<string, Set<string>>();

  for (const item of items) {
    let group = groups.get(item.pesticide_name);
    if (!group) {
      group = {
        pesticideName: item.pesticide_name,
        registrationNumbers: [],
        usageCategory: null,
        formulationType: null,
        usages: [],
      };
      groups.set(item.pesticide_name, group);
      usagesByName.set(item.pesticide_name, new Map());
      categories.set(item.pesticide_name, new Set());
      formulations.set(item.pesticide_name, new Set());
    }
    if (item.usage_category) categories.get(item.pesticide_name)!.add(item.usage_category);
    if (item.formulation_type) formulations.get(item.pesticide_name)!.add(item.formulation_type);
    if (!group.registrationNumbers.includes(item.registration_number)) {
      group.registrationNumbers.push(item.registration_number);
    }

    const signature = usageSignature(item);
    const usages = usagesByName.get(item.pesticide_name)!;
    const existing = usages.get(signature);
    if (existing) {
      if (!existing.registrationNumbers.includes(item.registration_number)) {
        existing.registrationNumbers.push(item.registration_number);
      }
      continue;
    }

    const usage: UsageView = {
      key: signature,
      registrationNumbers: [item.registration_number],
      registeredCropName: item.registered_crop_name,
      cropCondition: item.crop_condition,
      hierarchyDepth: item.hierarchy_depth,
      targetPests: item.target_pests,
      dilutionText: item.dilution_text,
      liquidAmount: item.liquid_amount,
      usageTimingText: item.usage_timing_text,
      phiDays: item.phi_days,
      maxApplicationsCount: item.max_applications_count,
      applicationMethod: item.application_method,
      ingredientLimitsSummary: item.ingredient_limits_summary,
    };
    usages.set(signature, usage);
    group.usages.push(usage);
  }

  for (const group of groups.values()) {
    group.registrationNumbers.sort(compareRegistration);
    group.usageCategory = joinUnique([...(categories.get(group.pesticideName) ?? [])]);
    group.formulationType = joinUnique([...(formulations.get(group.pesticideName) ?? [])]);
    for (const usage of group.usages) usage.registrationNumbers.sort(compareRegistration);
  }

  return [...groups.values()];
}

function RegistrationNumbers({ numbers }: { numbers: string[] }) {
  return (
    <div className="text-muted-foreground text-xs">
      {numbers.map((number, index) => (
        <span key={number} className="whitespace-nowrap">
          {index > 0 ? '・' : ''}第{number}号
        </span>
      ))}
    </div>
  );
}

function registrationsDiffer(group: PesticideGroup): boolean {
  const all = group.registrationNumbers.join('\0');
  return group.usages.some((usage) => usage.registrationNumbers.join('\0') !== all);
}

function minNumber(values: (number | null)[]): number | undefined {
  const defined = values.filter((value): value is number => value != null);
  return defined.length > 0 ? Math.min(...defined) : undefined;
}

function includesQuery(values: (string | null | undefined)[], query: string): boolean {
  return values.some((value) => value?.toLocaleLowerCase('ja').includes(query));
}

function filterGroups(groups: PesticideGroup[], rawQuery: string): PesticideGroup[] {
  const query = rawQuery.trim().toLocaleLowerCase('ja');
  if (!query) return groups;

  const filtered: PesticideGroup[] = [];
  for (const group of groups) {
    const groupHit = includesQuery(
      [group.pesticideName, group.usageCategory, group.formulationType, ...group.registrationNumbers],
      query,
    );
    if (groupHit) {
      filtered.push(group);
      continue;
    }
    const usages = group.usages.filter((usage) =>
      includesQuery(
        [
          usage.registeredCropName,
          usage.cropCondition,
          usage.targetPests,
          usage.dilutionText,
          usage.liquidAmount,
          usage.usageTimingText,
          usage.phiDays == null ? null : String(usage.phiDays),
          usage.maxApplicationsCount == null ? null : String(usage.maxApplicationsCount),
          usage.applicationMethod,
          usage.ingredientLimitsSummary,
          ...usage.registrationNumbers,
        ],
        query,
      ),
    );
    if (usages.length === 0) continue;
    const registrationNumbers = [...new Set(usages.flatMap((usage) => usage.registrationNumbers))].sort(
      compareRegistration,
    );
    filtered.push({ ...group, usages, registrationNumbers });
  }
  return filtered;
}

const COLUMN_TEMPLATE = [
  'minmax(7.5rem,1.4fr)',
  'minmax(4.75rem,0.6fr)',
  'minmax(4.75rem,0.6fr)',
  'minmax(6.25rem,1fr)',
  'minmax(7rem,1.1fr)',
  'minmax(10rem,1.1fr)',
  'minmax(6.25rem,0.9fr)',
  'minmax(7.25rem,0.7fr)',
  'minmax(6.25rem,0.65fr)',
  'minmax(6.25rem,0.8fr)',
  'minmax(10.5rem,1.3fr)',
].join(' ');

function textOrDash(value: string | null): string {
  return value ?? '-';
}

function NameCell({ group }: { group: PesticideGroup }) {
  return (
    <>
      <div className="font-medium">{group.pesticideName}</div>
      <RegistrationNumbers numbers={group.registrationNumbers} />
    </>
  );
}

function CropCell({ group, usage }: { group: PesticideGroup; usage: UsageView }) {
  return (
    <div className="flex flex-col gap-1">
      <span>{usage.registeredCropName}</span>
      {usage.hierarchyDepth > 0 && <Badge variant="secondary">上位分類での登録</Badge>}
      {usage.cropCondition && <span className="text-muted-foreground text-xs">{usage.cropCondition}</span>}
      {registrationsDiffer(group) && (
        <RegistrationNumbers numbers={usage.registrationNumbers} />
      )}
    </div>
  );
}

function DilutionCell({ usage }: { usage: UsageView }) {
  return (
    <div>
      <div>{textOrDash(usage.dilutionText)}</div>
      {usage.liquidAmount && <div className="text-muted-foreground text-xs">{usage.liquidAmount}</div>}
    </div>
  );
}

const columns = [
  col.accessor('pesticideName', { header: '農薬名' }),
  col.accessor((group) => group.usageCategory ?? '', { id: 'usage_category', header: '用途' }),
  col.accessor((group) => group.formulationType ?? '', { id: 'formulation_type', header: '剤型' }),
  col.accessor((group) => group.usages.map((usage) => usage.registeredCropName).join('\n'), {
    id: 'registered_crop_name',
    header: '登録作物',
  }),
  col.accessor((group) => group.usages.map((usage) => usage.targetPests ?? '').join('\n'), {
    id: 'target_pests',
    header: '適用病害虫',
  }),
  col.accessor((group) => group.usages.map((usage) => usage.dilutionText ?? '').join('\n'), {
    id: 'dilution_text',
    header: '希釈倍数・使用量',
  }),
  col.accessor((group) => group.usages.map((usage) => usage.usageTimingText ?? '').join('\n'), {
    id: 'usage_timing_text',
    header: '使用時期',
  }),
  col.accessor((group) => minNumber(group.usages.map((usage) => usage.phiDays)), {
    id: 'phi_days',
    header: '収穫前日数',
    sortUndefined: 'last',
  }),
  col.accessor((group) => minNumber(group.usages.map((usage) => usage.maxApplicationsCount)), {
    id: 'max_applications_count',
    header: '本剤回数',
    sortUndefined: 'last',
  }),
  col.accessor((group) => group.usages.map((usage) => usage.applicationMethod ?? '').join('\n'), {
    id: 'application_method',
    header: '使用方法',
  }),
  col.accessor((group) => group.usages.map((usage) => usage.ingredientLimitsSummary ?? '').join('\n'), {
    id: 'ingredient_limits_summary',
    header: '成分ごとの総使用回数',
    enableSorting: false,
  }),
];

function UsageValue({ group, usage, columnId }: { group: PesticideGroup; usage: UsageView; columnId: string }) {
  switch (columnId) {
    case 'registered_crop_name':
      return <CropCell group={group} usage={usage} />;
    case 'target_pests':
      return textOrDash(usage.targetPests);
    case 'dilution_text':
      return <DilutionCell usage={usage} />;
    case 'usage_timing_text':
      return textOrDash(usage.usageTimingText);
    case 'phi_days':
      return usage.phiDays == null ? '-' : `${usage.phiDays}日`;
    case 'max_applications_count':
      return usage.maxApplicationsCount == null ? '-' : `${usage.maxApplicationsCount}回以内`;
    case 'application_method':
      return textOrDash(usage.applicationMethod);
    case 'ingredient_limits_summary':
      return <span className="text-xs">{textOrDash(usage.ingredientLimitsSummary)}</span>;
    default:
      return null;
  }
}

const USAGE_COLUMN_IDS = [
  'registered_crop_name',
  'target_pests',
  'dilution_text',
  'usage_timing_text',
  'phi_days',
  'max_applications_count',
  'application_method',
  'ingredient_limits_summary',
];

/** 数万件の適用一覧でも軽快に描画できるよう、農薬単位の行を仮想スクロールで描画する */
export function ResultsTable({ items }: { items: PesticideSearchResult[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const groups = useMemo(() => groupSearchResults(items), [items]);
  const filtered = useMemo(() => filterGroups(groups, globalFilter), [groups, globalFilter]);
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.pesticideName,
  });

  const { rows } = table.getRowModel();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => 40 + (rows[index]?.original.usages.length ?? 1) * 52,
    overscan: 8,
    getItemKey: (index) => rows[index]?.id ?? index,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0);
  const visibleUsages = filtered.reduce((sum, group) => sum + group.usages.length, 0);
  const totalUsages = groups.reduce((sum, group) => sum + group.usages.length, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <Input
          className="max-w-xs"
          placeholder="結果を絞り込み（農薬名・病害虫など）"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
        <span className="text-muted-foreground text-sm">
          {rows.length} / {groups.length} 農薬（適用 {visibleUsages} / {totalUsages} 件）
        </span>
      </div>
      <div ref={scrollRef} className="h-[65vh] overflow-auto rounded-md border">
        <div role="table" className="grid w-full text-sm" style={{ gridTemplateColumns: COLUMN_TEMPLATE }}>
          {table.getHeaderGroups().map((headerGroup) =>
            headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  className="bg-background sticky top-0 z-10 flex h-10 items-center border-b px-2 font-medium whitespace-nowrap shadow-[0_1px_0_var(--border)]"
                >
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 whitespace-nowrap"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="text-muted-foreground size-3" />
                      )}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </div>
              );
            }),
          )}
          {paddingTop > 0 && <div aria-hidden className="col-span-full" style={{ height: paddingTop }} />}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index]!;
            const group = row.original;
            return (
              <PesticideRow
                key={row.id}
                group={group}
                index={virtualRow.index}
                measureRef={virtualizer.measureElement}
              />
            );
          })}
          {paddingBottom > 0 && <div aria-hidden className="col-span-full" style={{ height: paddingBottom }} />}
        </div>
      </div>
    </div>
  );
}

function PesticideRow({
  group,
  index,
  measureRef,
}: {
  group: PesticideGroup;
  index: number;
  measureRef: (element: HTMLDivElement | null) => void;
}) {
  const usageCount = group.usages.length;
  return (
    <div
      role="row"
      data-index={index}
      ref={measureRef}
      className="col-span-full grid grid-cols-subgrid border-b transition-colors hover:bg-neutral-200"
    >
      <GroupCell column={1} rowSpan={usageCount}>
        <NameCell group={group} />
      </GroupCell>
      <GroupCell column={2} rowSpan={usageCount}>
        {textOrDash(group.usageCategory)}
      </GroupCell>
      <GroupCell column={3} rowSpan={usageCount}>
        {textOrDash(group.formulationType)}
      </GroupCell>
      {group.usages.map((usage, usageIndex) =>
        USAGE_COLUMN_IDS.map((columnId, columnOffset) => (
          <div
            key={`${usage.key}-${columnId}`}
            role="cell"
            className={cn('min-w-0 p-2', usageIndex > 0 && 'border-t')}
            style={{ gridColumn: columnOffset + 4, gridRow: usageIndex + 1 }}
          >
            <UsageValue group={group} usage={usage} columnId={columnId} />
          </div>
        )),
      )}
    </div>
  );
}

function GroupCell({ column, rowSpan, children }: { column: number; rowSpan: number; children: ReactNode }) {
  return (
    <div
      role="cell"
      className="min-w-0 self-start p-2"
      style={{ gridColumn: column, gridRow: `1 / span ${rowSpan}` }}
    >
      {children}
    </div>
  );
}
