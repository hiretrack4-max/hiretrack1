import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ink & Bone tag — a small outlined pill for tagging (skills, roles, tech).
 * `hot` renders the vermilion "primary tag" treatment. Provide `onRemove`
 * to show a trailing ✕ button.
 */
export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  hot?: boolean;
  onRemove?: () => void;
  children: ReactNode;
}

export function Tag({ hot = false, onRemove, children, className, ...props }: TagProps) {
  return (
    <span className={cn('tag', hot && 'hot', className)} {...props}>
      {children}
      {onRemove && (
        <button
          type="button"
          className="rm"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}
