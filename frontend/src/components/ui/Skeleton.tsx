import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('shimmer rounded-xl bg-muted/10 dark:bg-muted/[0.08]', className)}
      {...props}
    />
  );
}
