import { cn } from '@/lib/utils';
import type { MappingSummary } from '@/types/api';

export interface MappingSelectorProps {
  mappings: MappingSummary[];
  value: number | null;
  onChange: (mappingId: number) => void;
}

/** Segmented picker to scope interviews / offers to one of a candidate's jobs. */
export function MappingSelector({ mappings, value, onChange }: MappingSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {mappings.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={cn(
              'rounded-xl border px-3 py-2 text-left text-sm transition-all',
              active
                ? 'border-brand-400 bg-brand-500/10 shadow-brand-sm'
                : 'border-line bg-surface/50 hover:border-brand-300',
            )}
          >
            <span className="block font-medium text-ink">{m.job_role}</span>
            <span className="block text-2xs text-muted">{m.job_id}</span>
          </button>
        );
      })}
    </div>
  );
}
