import type { TooltipProps } from 'recharts';

/** Shared custom tooltip styled to the HireTrack design system. */
export function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const title = (payload[0]?.payload?.label as string) ?? (label as string);

  return (
    <div className="rounded-xl border border-line bg-card/95 px-3 py-2 shadow-card-hover backdrop-blur">
      {title && <p className="mb-1 text-xs font-semibold text-ink">{title}</p>}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: (entry.payload?.color as string) ?? entry.color }}
            />
            <span className="capitalize text-muted">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
