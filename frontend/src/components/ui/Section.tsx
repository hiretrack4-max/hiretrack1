import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Numbered section rule — the "dossier tell". Renders an auto-incrementing
 * "01 / 02 …" counter (orange), the title, and a trailing hairline.
 *
 * Counters increment within the nearest `.sect-scope` ancestor, so wrap a run
 * of <Section> elements in <SectionScope> (or any element with the class) to
 * restart numbering from 01.
 */
export interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Force first-child styling (no top rule / margin) outside a scope. */
  first?: boolean;
}

export function Section({ children, first = false, className, ...props }: SectionProps) {
  return (
    <div className={cn('sect', first && 'first', className)} {...props}>
      {children}
    </div>
  );
}

export interface SectionScopeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Resets the section counter for the <Section> elements it contains. */
export function SectionScope({ children, className, ...props }: SectionScopeProps) {
  return (
    <div className={cn('sect-scope', className)} {...props}>
      {children}
    </div>
  );
}
