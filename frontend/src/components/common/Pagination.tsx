import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';

export interface PaginationProps {
  /** Total item count from the DRF envelope. */
  count: number;
  /** Current 1-based page. */
  page: number;
  /** Page size (DRF PAGE_SIZE = 25). */
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ count, page, pageSize = 25, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (count === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted">
        Showing <span className="font-semibold text-ink">{from}</span>–
        <span className="font-semibold text-ink">{to}</span> of{' '}
        <span className="font-semibold text-ink">{count}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="px-1 text-sm font-medium tabular-nums text-muted">
          Page {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
