import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Optional back link element rendered above the title. */
  back?: ReactNode;
}

/** Consistent page heading block matching the Dashboard header treatment. */
export function PageHeader({
  eyebrow,
  eyebrowIcon: Icon,
  title,
  description,
  actions,
  back,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        {back}
        {eyebrow && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {eyebrow}
          </span>
        )}
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
