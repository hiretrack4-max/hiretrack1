import { cn } from '@/lib/utils';

export interface LogoProps {
  /** Hide the wordmark, show only the mark. */
  compact?: boolean;
  className?: string;
}

/** HireTrack gradient mark + wordmark. */
export function Logo({ compact = false, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient shadow-brand-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
          <path
            d="M8 6v12M16 6v12M8 12h8"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-midnight" />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight text-white">
          Hire<span className="gradient-text">Track</span>
        </span>
      )}
    </div>
  );
}
