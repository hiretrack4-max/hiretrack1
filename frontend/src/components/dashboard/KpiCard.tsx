import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Accent hex used for the icon chip + accent bar. */
  accent: string;
  hint?: string;
  loading?: boolean;
}

export function KpiCard({ label, value, icon: Icon, accent, hint, loading }: KpiCardProps) {
  if (loading) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <Skeleton className="h-4 w-10" />
        </div>
        <Skeleton className="mt-5 h-8 w-20" />
        <Skeleton className="mt-2 h-4 w-24" />
      </Card>
    );
  }

  return (
    <Card interactive className="group relative overflow-hidden p-5">
      {/* soft accent glow */}
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.14] blur-2xl transition-opacity duration-300 group-hover:opacity-25"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
        {hint && (
          <span className="text-2xs font-medium uppercase tracking-wide text-muted">{hint}</span>
        )}
      </div>
      <p className="mt-4 font-display text-3xl font-bold tabular-nums text-ink">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-sm font-medium text-muted">{label}</p>
      <span
        className={cn('mt-4 block h-1 w-full rounded-full opacity-70')}
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00)` }}
      />
    </Card>
  );
}
