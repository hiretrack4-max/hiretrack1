import { History } from 'lucide-react';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { useRecruitmentStatus } from '@/hooks/useCandidates';
import { resolveStatus } from '@/constants/statuses';
import { formatDateTime } from '@/lib/format';

export function StatusHistory({ candidateId }: { candidateId: number }) {
  const { data, isLoading } = useRecruitmentStatus(candidateId);

  return (
    <Card className="p-5">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
        <History className="h-4 w-4 text-brand-500" />
        Status history
      </h3>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<History className="h-7 w-7" />}
          title="No status changes yet"
          description="Transitions will appear here as you move the candidate through the pipeline."
        />
      ) : (
        <ol className="relative space-y-4 pl-5">
          <span className="absolute left-[5px] top-1.5 h-[calc(100%-0.75rem)] w-px bg-line" />
          {data.map((entry) => {
            const meta = resolveStatus(entry.new_status);
            return (
              <li key={entry.id} className="relative">
                <span
                  className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card"
                  style={{ backgroundColor: meta.color }}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium text-ink">
                    {entry.previous_status
                      ? `${resolveStatus(entry.previous_status).label} → ${meta.label}`
                      : meta.label}
                  </p>
                  <span className="text-2xs text-muted">{formatDateTime(entry.changed_at)}</span>
                </div>
                {entry.notes && <p className="mt-0.5 text-sm text-muted">{entry.notes}</p>}
                {entry.changed_by && (
                  <p className="mt-0.5 text-2xs text-muted">by {entry.changed_by}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
