import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useRef, useState } from 'react';
import type { PesticideSearchResult } from '@pesticide/api-contract';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const col = createColumnHelper<PesticideSearchResult>();

const columns = [
  col.accessor('pesticide_name', {
    header: '農薬名',
    cell: (info) => (
      <div>
        <div className="font-medium">{info.getValue()}</div>
        <div className="text-muted-foreground text-xs">第{info.row.original.registration_number}号</div>
      </div>
    ),
  }),
  col.accessor('usage_category', { header: '用途', cell: (info) => info.getValue() ?? '-' }),
  col.accessor('formulation_type', { header: '剤型', cell: (info) => info.getValue() ?? '-' }),
  col.accessor('registered_crop_name', {
    header: '登録作物',
    cell: (info) => (
      <div className="flex flex-col gap-1">
        <span>{info.getValue()}</span>
        {info.row.original.hierarchy_depth > 0 && <Badge variant="secondary">上位分類での登録</Badge>}
        {info.row.original.crop_condition && (
          <span className="text-muted-foreground text-xs">{info.row.original.crop_condition}</span>
        )}
      </div>
    ),
  }),
  col.accessor('target_pests', { header: '適用病害虫', cell: (info) => info.getValue() ?? '-' }),
  col.accessor('dilution_text', {
    header: '希釈倍数・使用量',
    cell: (info) => (
      <div>
        <div>{info.getValue() ?? '-'}</div>
        {info.row.original.liquid_amount && (
          <div className="text-muted-foreground text-xs">{info.row.original.liquid_amount}</div>
        )}
      </div>
    ),
  }),
  col.accessor('usage_timing_text', { header: '使用時期', cell: (info) => info.getValue() ?? '-' }),
  col.accessor('phi_days', {
    header: '収穫前日数',
    sortUndefined: 'last',
    cell: (info) => (info.getValue() == null ? '-' : `${info.getValue()}日`),
  }),
  col.accessor('max_applications_count', {
    header: '本剤回数',
    cell: (info) => (info.getValue() == null ? '-' : `${info.getValue()}回以内`),
  }),
  col.accessor('application_method', { header: '使用方法', cell: (info) => info.getValue() ?? '-' }),
  col.accessor('ingredient_limits_summary', {
    header: '成分ごとの総使用回数',
    enableSorting: false,
    cell: (info) => <span className="text-xs">{info.getValue() ?? '-'}</span>,
  }),
];

/** 数万件の適用一覧でも軽快に描画できるよう、行を仮想スクロールで描画する */
export function ResultsTable({ items }: { items: PesticideSearchResult[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.usage_rule_id,
  });

  const { rows } = table.getRowModel();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0);

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
          {rows.length} / {items.length} 件
        </span>
      </div>
      <div ref={scrollRef} className="h-[65vh] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="bg-background sticky top-0 z-10 shadow-[0_1px_0_var(--border)]">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
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
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop }} />
              </tr>
            )}
            {virtualRows.map((vr) => {
              const row = rows[vr.index]!;
              return (
                <TableRow key={row.id} data-index={vr.index} ref={virtualizer.measureElement}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom }} />
              </tr>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
