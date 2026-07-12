import { cn } from '@/lib/utils';

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-2xl border border-line bg-card p-1 shadow-sm',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative rounded-xl px-4 py-1.5 text-sm font-medium transition-all duration-200',
              active
                ? 'bg-brand-gradient text-white shadow-brand-sm'
                : 'text-muted hover:bg-surface hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
