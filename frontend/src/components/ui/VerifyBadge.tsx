import { cn } from '@/lib/utils';

/**
 * Tiny mono pill flagging the provenance / confidence of a parsed field.
 *  - verify (amber)  → parser was unsure, HR should confirm
 *  - auto   (dim)    → auto-extracted, looks confident
 *  - manual (orange) → entered / edited by HR
 */
export interface VerifyBadgeProps {
  kind?: 'verify' | 'auto' | 'manual';
  className?: string;
  children?: string;
}

export function VerifyBadge({ kind = 'verify', className, children }: VerifyBadgeProps) {
  return <span className={cn(kind, className)}>{children ?? kind}</span>;
}
