import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui';

export interface PlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
}

/** Elegant "coming in Pass 2" placeholder for feature pages. */
export function Placeholder({ icon: Icon, title, description, features }: PlaceholderProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">{title}</h1>
        <p className="text-sm text-muted">{description}</p>
      </div>

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
        <div className="relative flex flex-col items-center justify-center gap-5 px-6 py-16 text-center">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-gradient text-white shadow-brand">
            <Icon className="h-8 w-8" />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white ring-4 ring-card">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
          </span>

          <div className="max-w-md space-y-1.5">
            <h2 className="font-display text-xl font-bold text-ink">{title} is on the way</h2>
            <p className="text-sm text-muted">
              This module is being crafted for the next release. Here's what's coming:
            </p>
          </div>

          <ul className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
            {features.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-surface/60 px-3.5 py-2.5 text-left text-sm text-ink"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gradient" />
                {f}
              </li>
            ))}
          </ul>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-600 dark:text-brand-300">
            <Sparkles className="h-3.5 w-3.5" />
            Coming in Pass 2
          </span>
        </div>
      </Card>
    </div>
  );
}
