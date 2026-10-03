'use client';

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { Pagination } from './pagination';
import { Skeleton } from './ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from './ui/table';

export interface ServerTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[] | undefined;
  loading?: boolean;
  /** server pagination */
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (page: number) => void;
  /** server sort as "field" / "-field" */
  sort?: string;
  onSort?: (sort: string | undefined) => void;
  sortable?: string[];
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  rowTestId?: (row: T) => string;
}

/** DataTable (docs/07-web-ui.md §3): server-side pagination/sorting; state lives in the URL. */
export function DataTable<T>({
  columns,
  data,
  loading,
  page,
  pageSize,
  total,
  onPage,
  sort,
  onSort,
  sortable = [],
  onRowClick,
  empty,
  rowTestId,
}: ServerTableProps<T>) {
  const t = useTranslations('common');
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table v8 is not React-Compiler aware
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });
  const sortField = sort?.replace(/^-/, '');
  const desc = sort?.startsWith('-');
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <TR key={hg.id}>
              {hg.headers.map((h) => {
                const id = h.column.id;
                const canSort = sortable.includes(id) && onSort;
                return (
                  <TH key={h.id} style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}>
                    {canSort ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          onSort(sortField === id ? (desc ? undefined : `-${id}`) : id)
                        }
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortField === id ? (
                          desc ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUp className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TH>
                );
              })}
            </TR>
          ))}
        </THead>
        <TBody>
          {loading && !data
            ? Array.from({ length: 5 }).map((_, i) => (
                <TR key={i}>
                  {columns.map((_c, j) => (
                    <TD key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TD>
                  ))}
                </TR>
              ))
            : table.getRowModel().rows.map((row) => (
                <TR
                  key={row.id}
                  data-testid={rowTestId?.(row.original)}
                  className={cn(onRowClick && 'cursor-pointer hover:bg-subtle')}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TD key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TD>
                  ))}
                </TR>
              ))}
        </TBody>
      </Table>
      {!loading && data && data.length === 0 ? (empty ?? <EmptyState title={t('noData')} />) : null}
      {page && pageSize && total !== undefined && onPage ? (
        <Pagination page={page} pageSize={pageSize} total={total} onPage={onPage} />
      ) : null}
    </div>
  );
}
