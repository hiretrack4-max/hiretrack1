import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Adorn — wraps a text <Input> (or raw `.inp`) to show a right-aligned mono
 * suffix, e.g. a "LPA" unit on a salary field.
 *
 *   <Adorn suffix="LPA"><Input name="ctc" /></Adorn>
 */
export interface AdornProps {
  suffix: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Adorn({ suffix, children, className }: AdornProps) {
  return (
    <div className={cn('adorn', className)}>
      {children}
      <span className="suf">{suffix}</span>
    </div>
  );
}
