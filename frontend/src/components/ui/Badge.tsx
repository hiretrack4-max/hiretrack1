import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { resolveStatus } from '@/constants/statuses';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'brand' | 'neutral' | 'accent' | 'success';
}

const TONES = {
  brand: 'bg-brand-500/12 text-brand-600 dark:text-brand-300',
  neutral: 'bg-muted/12 text-muted',
  accent: 'bg-accent/14 text-accent-strong',
  success: 'bg-status-joined/12 text-status-joined',
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export interface StatusPillProps {
  status: string;
  className?: string;
  /** Show the coloured leading dot. */
  dot?: boolean;
}

/** Maps any candidate/job/mapping status to its harmonised colour pill. */
export function StatusPill({ status, className, dot = true }: StatusPillProps) {
  const meta = resolveStatus(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
        meta.pill,
        className,
      )}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      )}
      {meta.label}
    </span>
  );
}
