import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  mono?: boolean;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyMessage?: string;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'Sin datos',
  className,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg border border-border bg-surface',
        className
      )}
    >
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-muted text-[10px] uppercase tracking-wider text-ink-subtle">
          <tr>
            {columns.map((col) => (
              <th key={col.id} scope="col" className={cn('px-3 py-2 font-bold', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-ink-subtle"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)} className="hover:bg-surface-muted/60">
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      'px-3 py-2 text-ink',
                      col.mono && 'font-mono tabular-nums text-xs',
                      col.className
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
