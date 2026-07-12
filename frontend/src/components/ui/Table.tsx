import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  empty?: { title: string; description?: string; icon?: ReactNode };
  className?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function Table<T>({ columns, data, rowKey, onRowClick, empty, className }: TableProps<T>) {
  if (data.length === 0 && empty) {
    return (
      <div className="rounded-2xl border border-line bg-card">
        <EmptyState title={empty.title} description={empty.description} icon={empty.icon} />
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-line bg-card shadow-card', className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'whitespace-nowrap px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted',
                  ALIGN[col.align ?? 'left'],
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-line/70 transition-colors last:border-0',
                onRowClick && 'cursor-pointer hover:bg-surface',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap px-5 py-4 text-ink',
                    ALIGN[col.align ?? 'left'],
                    col.className,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
