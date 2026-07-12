import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ink & Bone status chip — small mono uppercase stamp with a leading dot.
 *
 * Six visual variants map onto the 9 candidate + 4 job statuses:
 *   open  → vermilion   prog → amber   hold → blue
 *   good  → teal        closed → dim   bad  → red
 *
 * Pass a known status enum value (e.g. "OPEN", "RESUME_RECEIVED") and the chip
 * resolves its label + colour automatically, or pass an explicit
 * `label` + `variant` for one-off use.
 */
export type ChipVariant = 'open' | 'prog' | 'hold' | 'good' | 'closed' | 'bad';

const VARIANT_CLASS: Record<ChipVariant, string> = {
  open: 'c-open',
  prog: 'c-prog',
  hold: 'c-hold',
  good: 'c-good',
  closed: 'c-closed',
  bad: 'c-bad',
};

interface ChipMeta {
  label: string;
  variant: ChipVariant;
}

/** Job (Module 6) + Candidate (Module 5) status → chip label + variant. */
export const CHIP_STATUS: Record<string, ChipMeta> = {
  // Job statuses
  OPEN: { label: 'Open', variant: 'open' },
  IN_PROGRESS: { label: 'In Progress', variant: 'prog' },
  ON_HOLD: { label: 'On Hold', variant: 'hold' },
  CLOSED: { label: 'Closed', variant: 'closed' },
  // Candidate pipeline statuses
  RESUME_RECEIVED: { label: 'Resume Received', variant: 'closed' },
  SHORTLISTED: { label: 'Shortlisted', variant: 'open' },
  INTERVIEW_SCHEDULED: { label: 'Interview Scheduled', variant: 'prog' },
  INTERVIEW_IN_PROGRESS: { label: 'Interview In Progress', variant: 'prog' },
  INTERVIEW_COMPLETED: { label: 'Interview Completed', variant: 'hold' },
  OFFER_RELEASED: { label: 'Offer Released', variant: 'open' },
  JOINED: { label: 'Joined', variant: 'good' },
  REJECTED: { label: 'Rejected', variant: 'bad' },
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Resolve any known status value to its chip metadata (neutral fallback). */
export function resolveChip(status: string): ChipMeta {
  return CHIP_STATUS[status] ?? { label: titleCase(status), variant: 'closed' };
}

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** A known status enum value ("OPEN" / "RESUME_RECEIVED" / …). */
  status?: string;
  /** Explicit label override (used when `status` is not supplied). */
  label?: string;
  /** Explicit variant override. */
  variant?: ChipVariant;
  /** Hide the leading dot. */
  dot?: boolean;
}

export function Chip({ status, label, variant, dot = true, className, ...props }: ChipProps) {
  const meta = status ? resolveChip(status) : undefined;
  const v = variant ?? meta?.variant ?? 'closed';
  const text = label ?? meta?.label ?? (status ? titleCase(status) : '');
  return (
    <span className={cn('chip', VARIANT_CLASS[v], className)} {...props}>
      {dot && <span className="dot" />}
      {text}
    </span>
  );
}
